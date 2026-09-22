"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { promises as dns } from "node:dns"
import { getUser } from "@/lib/auth/session"
import { verificationTxt } from "@/lib/billing/domains"
import { FEATURES, METRICS, type Feature, type UsageMetric } from "@/lib/billing/plans"
import { enqueueEmail } from "@/lib/email/queue"
import { requirePlatformAdmin } from "@/lib/platform/auth"
import { SUPPORT_COOKIE } from "@/lib/platform/data"
import { canPlatform, canRevokePlatformAdmin } from "@/lib/platform/permissions"
import { canEditEntitlements, canSuspendOrganization, reasonIsValid, recentAuth, supportExpiry, WOLOYEM_SLUG } from "@/lib/platform/rules"
import { createAdminClient } from "@/lib/supabase/admin"

async function actor(permission: Parameters<typeof requirePlatformAdmin>[0]) {
  const admin = await requirePlatformAdmin(permission)
  const user = await getUser()
  return { admin, user }
}

async function audit(organizationId: string, actorId: string, action: string, metadata: Record<string, string>) {
  const admin = createAdminClient()
  await admin.from("audit_logs").insert({ organization_id: organizationId, actor_id: actorId, action, metadata })
}

async function recentlyAudited(actorId: string, action: string) {
  const admin = createAdminClient()
  const since = new Date(Date.now() - 15_000).toISOString()
  const { count } = await admin.from("audit_logs").select("id", { count: "exact", head: true }).eq("actor_id", actorId).eq("action", action).gte("created_at", since)
  return (count ?? 0) > 0
}

export async function startSupportSession(organizationId: string, reason: string) {
  const { admin } = await actor("platform.support.access")
  if (!reasonIsValid(reason)) return { error: "Indiquez la raison de l'accès." }
  if (await recentlyAudited(admin.userId, "support_session.started")) return { error: "Veuillez patienter avant une nouvelle session." }
  const client = createAdminClient()
  const { count } = await client.from("support_sessions").select("id", { count: "exact", head: true }).eq("platform_admin_id", admin.userId).eq("status", "active")
  if ((count ?? 0) > 0) return { error: "Une session support est déjà ouverte." }
  const { data: organization } = await client.from("organizations").select("id").eq("id", organizationId).maybeSingle()
  if (!organization) return { error: "Organisation introuvable." }
  const expires = supportExpiry()
  const { data, error } = await client.from("support_sessions").insert({
    platform_admin_id: admin.userId,
    organization_id: organization.id,
    reason: reason.trim(),
    expires_at: expires,
  }).select("id").single()
  if (error || !data) return { error: "La session n'a pas pu être ouverte." }
  const jar = await cookies()
  jar.set(SUPPORT_COOKIE, data.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 60 })
  await audit(organization.id, admin.userId, "support_session.started", { support_session_id: data.id })
  const { data: owner } = await client.from("organization_members").select("user_id").eq("organization_id", organization.id).eq("role", "owner").limit(1).maybeSingle()
  const { data: profile } = owner ? await client.from("profiles").select("email").eq("id", owner.user_id).maybeSingle() : { data: null }
  const { data: named } = await client.from("organizations").select("name, default_language").eq("id", organization.id).maybeSingle()
  if (profile?.email && named) {
    await enqueueEmail({
      organizationId: organization.id,
      template: "support_notice",
      recipient: profile.email,
      locale: named.default_language === "en" ? "en" : "fr",
      idempotencyKey: `support_notice:${data.id}`,
      payload: { organizationName: named.name },
    })
  }
  revalidatePath("/platform")
  return { ok: true as const }
}

export async function endSupportSession() {
  const { admin } = await actor("platform.support.access")
  const jar = await cookies()
  const id = jar.get(SUPPORT_COOKIE)?.value
  jar.delete(SUPPORT_COOKIE)
  if (!id) return
  const client = createAdminClient()
  const { data } = await client.from("support_sessions").select("id, organization_id, status").eq("id", id).eq("platform_admin_id", admin.userId).maybeSingle()
  if (!data || data.status !== "active") return
  await client.from("support_sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", data.id)
  await audit(data.organization_id, admin.userId, "support_session.ended", { support_session_id: data.id })
  revalidatePath("/platform")
}

export async function retryPlatformJob(kind: "integration" | "report", jobId: string) {
  const { admin } = await actor("platform.jobs.retry")
  if (await recentlyAudited(admin.userId, "job.retried")) return { error: "Veuillez patienter avant une nouvelle relance." }
  const client = createAdminClient()
  if (kind === "report") {
    const { data } = await client.from("report_jobs").select("id, organization_id, status, report_id").eq("id", jobId).maybeSingle()
    if (!data || (data.status !== "failed" && data.status !== "dead")) return { error: "Ce job ne peut pas être relancé." }
    const { error } = await client.from("report_jobs").update({ status: "pending", next_run_at: new Date().toISOString(), locked_at: null }).eq("id", data.id).in("status", ["failed", "dead"])
    if (error) return { error: "Relance impossible." }
    await client.from("assessment_reports").update({ status: "pending" }).eq("id", data.report_id).eq("organization_id", data.organization_id).eq("status", "failed")
    await audit(data.organization_id, admin.userId, "job.retried", { job_id: data.id, kind: "report" })
  } else {
    const { data } = await client.from("integration_jobs").select("id, organization_id, status").eq("id", jobId).maybeSingle()
    if (!data || data.status !== "failed") return { error: "Ce job ne peut pas être relancé." }
    const { error } = await client.from("integration_jobs").update({ status: "pending", next_run_at: new Date().toISOString(), locked_at: null }).eq("id", data.id).eq("status", "failed")
    if (error) return { error: "Relance impossible." }
    await audit(data.organization_id, admin.userId, "job.retried", { job_id: data.id, kind: "integration" })
  }
  revalidatePath("/platform/jobs")
  return { ok: true as const }
}

export async function updateEntitlement(organizationId: string, feature: string, enabled: boolean, limit: string) {
  const { admin, user } = await actor("platform.entitlements.manage")
  if (!recentAuth(user?.last_sign_in_at ?? null)) return { error: "Une authentification récente est requise." }
  if (!FEATURES.includes(feature as Feature) && !METRICS.includes(feature as UsageMetric)) return { error: "Fonctionnalité inconnue." }
  const client = createAdminClient()
  const { data: organization } = await client.from("organizations").select("id, slug").eq("id", organizationId).maybeSingle()
  if (!organization || !canEditEntitlements({ slug: organization.slug, allowed: canPlatform(admin, "platform.entitlements.manage") })) {
    return { error: "Cette organisation ne peut pas être modifiée ici." }
  }
  const { data: previous } = await client.from("organization_entitlements").select("enabled, limit_override").eq("organization_id", organization.id).eq("feature", feature).maybeSingle()
  const limitOverride = limit.trim() === "" ? null : Number(limit)
  if (limitOverride !== null && !Number.isFinite(limitOverride)) return { error: "Limite invalide." }
  const { error } = await client.from("organization_entitlements").upsert({
    organization_id: organization.id,
    feature,
    enabled,
    limit_override: limitOverride,
  }, { onConflict: "organization_id,feature" })
  if (error) return { error: "L'override n'a pas été enregistré." }
  await audit(organization.id, admin.userId, "entitlement.updated", {
    feature,
    previous: previous ? `${previous.enabled}:${previous.limit_override ?? ""}` : "plan-default",
    next: `${enabled}:${limitOverride ?? ""}`,
  })
  revalidatePath(`/platform/organizations/${organization.id}`)
  return { ok: true as const }
}

export async function suspendOrganization(organizationId: string, reason: string) {
  const { admin, user } = await actor("platform.organizations.manage")
  if (!recentAuth(user?.last_sign_in_at ?? null)) return { error: "Une authentification récente est requise." }
  if (reason.trim().length < 8) return { error: "La raison est obligatoire." }
  const client = createAdminClient()
  const { data: organization } = await client.from("organizations").select("id, slug").eq("id", organizationId).maybeSingle()
  if (!organization || !canSuspendOrganization({ slug: organization.slug, allowed: true })) return { error: "WOLOYEM ne peut pas être suspendu." }
  const { error } = await client.from("organization_suspensions").insert({
    organization_id: organization.id,
    reason: reason.trim(),
    created_by: admin.userId,
  })
  if (error) return { error: "Suspension impossible." }
  await audit(organization.id, admin.userId, "organization.suspended", { slug: organization.slug })
  revalidatePath("/platform/organizations")
  return { ok: true as const }
}

export async function unsuspendOrganization(organizationId: string) {
  const { admin, user } = await actor("platform.organizations.manage")
  if (!recentAuth(user?.last_sign_in_at ?? null)) return { error: "Une authentification récente est requise." }
  const client = createAdminClient()
  const { data } = await client.from("organization_suspensions").select("id").eq("organization_id", organizationId).is("lifted_at", null).maybeSingle()
  if (!data) return { error: "Aucune suspension active." }
  await client.from("organization_suspensions").update({ lifted_at: new Date().toISOString(), lifted_by: admin.userId }).eq("id", data.id)
  await audit(organizationId, admin.userId, "organization.unsuspended", {})
  revalidatePath("/platform/organizations")
  return { ok: true as const }
}

export async function checkPlatformDomain(domainId: string) {
  const { admin } = await actor("platform.organizations.read")
  if (await recentlyAudited(admin.userId, "domain.checked")) return { error: "Veuillez patienter avant un nouveau contrôle." }
  const client = createAdminClient()
  const { data } = await client.from("custom_domains").select("id, domain, verification_token, organization_id, status").eq("id", domainId).maybeSingle()
  if (!data) return { error: "Domaine introuvable." }
  let verified = false
  try {
    const records = await dns.resolveTxt(data.domain)
    verified = records.flat().some((value) => value.includes(verificationTxt(data.verification_token)))
  } catch {
    verified = false
  }
  await audit(data.organization_id, admin.userId, "domain.checked", { domain: data.domain, result: verified ? "verified" : "missing" })
  revalidatePath("/platform/domains")
  return { ok: true as const, verified }
}

export async function grantPlatformAdmin(email: string, role: string) {
  const { admin, user } = await actor("platform.admins.manage")
  if (!recentAuth(user?.last_sign_in_at ?? null)) return { error: "Une authentification récente est requise." }
  if (role !== "super_admin" && role !== "support" && role !== "operations" && role !== "finance") return { error: "Rôle invalide." }
  const client = createAdminClient()
  const { data: profile } = await client.from("profiles").select("id").ilike("email", email.trim()).maybeSingle()
  if (!profile) return { error: "Profil introuvable." }
  const { error } = await client.from("platform_admins").upsert({ user_id: profile.id, role })
  if (error) return { error: "Enregistrement impossible." }
  const { data: woloyem } = await client.from("organizations").select("id").eq("slug", WOLOYEM_SLUG).maybeSingle()
  if (woloyem) await audit(woloyem.id, admin.userId, "platform_admin.updated", { role })
  revalidatePath("/platform/admins")
  return { ok: true as const }
}

export async function revokePlatformAdmin(userId: string) {
  const { admin, user } = await actor("platform.admins.manage")
  if (!recentAuth(user?.last_sign_in_at ?? null)) return { error: "Une authentification récente est requise." }
  const client = createAdminClient()
  const { count } = await client.from("platform_admins").select("user_id", { count: "exact", head: true }).eq("role", "super_admin")
  const { data: target } = await client.from("platform_admins").select("role").eq("user_id", userId).maybeSingle()
  if (!target || !canRevokePlatformAdmin({ actorId: admin.userId, targetId: userId, targetRole: target.role, superAdminCount: count ?? 0 })) {
    return { error: "Ce retrait est refusé." }
  }
  const { error } = await client.from("platform_admins").delete().eq("user_id", userId)
  if (error) return { error: "Retrait impossible." }
  const { data: woloyem } = await client.from("organizations").select("id").eq("slug", WOLOYEM_SLUG).maybeSingle()
  if (woloyem) await audit(woloyem.id, admin.userId, "platform_admin.removed", {})
  revalidatePath("/platform/admins")
  return { ok: true as const }
}
