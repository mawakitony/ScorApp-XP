"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { promises as dns } from "node:dns"
import { randomBytes } from "node:crypto"
import { can } from "@/lib/auth/permissions"
import { createInviteToken, hashInviteToken, inviteExpiry } from "@/lib/auth/invitations"
import { enqueueEmail } from "@/lib/email/queue"
import { invitationIdempotencyKey } from "@/lib/email/templates"
import { getAppUrl } from "@/lib/env"
import { addVercelDomain, getVercelDomain, removeVercelDomain } from "@/lib/domains/vercel"
import { allowRate } from "@/lib/security/rate"
import { getUser } from "@/lib/auth/session"
import { loadEntitlements } from "@/lib/billing/account"
import { normalizeDomain, verificationTxt } from "@/lib/billing/domains"
import { DEFAULT_TRIAL_DAYS } from "@/lib/billing/plans"
import { hasFeature } from "@/lib/billing/entitlements"
import { ensureMembership } from "@/lib/data/membership"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export async function createOrganization(formData: FormData) {
  const user = await getUser()
  if (!user) redirect("/login")
  const name = String(formData.get("name") ?? "").trim()
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase()
  const useCase = String(formData.get("useCase") ?? "").trim()
  if (name.length < 2 || !slugPattern.test(slug) || slug === "woloyem") redirect("/onboarding?error=1")
  const supabase = await createClient()
  const { error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_slug: slug,
    p_use_case: useCase,
    p_trial_days: DEFAULT_TRIAL_DAYS,
  })
  if (error) redirect("/onboarding?error=1")
  redirect("/dashboard")
}

async function manager() {
  const membership = await ensureMembership()
  const user = await getUser()
  if (!membership || !user || !can({ role: membership.role }, "team.manage")) return { error: "Permission refusée." as const }
  return { membership, user }
}

export async function saveOrganization(formData: FormData) {
  const context = await manager()
  if ("error" in context) return context
  const name = String(formData.get("name") ?? "").trim()
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase()
  if (name.length < 2 || !slugPattern.test(slug)) return { error: "Nom ou slug invalide." }
  if (slug === "woloyem" && context.membership.organization.slug !== "woloyem") return { error: "Slug réservé." }
  const supabase = await createClient()
  const { error } = await supabase.from("organizations").update({
    name,
    slug,
    website: String(formData.get("website") ?? "").trim().slice(0, 200),
    country: String(formData.get("country") ?? "").trim().slice(0, 80),
    timezone: String(formData.get("timezone") ?? "UTC").trim().slice(0, 80) || "UTC",
    default_language: String(formData.get("language") ?? "fr") === "en" ? "en" : "fr",
    footer_text: String(formData.get("footer") ?? "").trim().slice(0, 300),
  }).eq("id", context.membership.organization.id)
  if (error) return { error: "L'organisation n'a pas pu être enregistrée." }
  revalidatePath("/dashboard/settings/organization")
  return { ok: true as const }
}

export async function inviteMember(formData: FormData) {
  const context = await manager()
  if ("error" in context) return context
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const role = String(formData.get("role") ?? "viewer")
  if (!email.includes("@") || !["admin", "editor", "analyst", "viewer"].includes(role)) return { error: "Invitation invalide." }
  const entitlements = await loadEntitlements(context.membership.organization.id)
  const admin = createAdminClient()
  const { count } = await admin.from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", context.membership.organization.id)
  const limit = entitlements.limits.team_members
  if (limit !== null && (count ?? 0) >= limit) return { error: "La limite de membres du plan est atteinte." }
  if (!await allowRate(`invite:${context.membership.organization.id}`, 3600, 20)) return { error: "Trop d'invitations. Réessayez plus tard." }
  const share = createInviteToken()
  const { data: invitation, error } = await admin.from("organization_invitations").insert({
    organization_id: context.membership.organization.id,
    email,
    role,
    token_hash: share.hash,
    expires_at: inviteExpiry(),
    invited_by: context.user.id,
  }).select("id").single()
  if (error || !invitation) return { error: "L'invitation n'a pas pu être créée." }
  const { data: organization } = await admin.from("organizations").select("name, default_language").eq("id", context.membership.organization.id).maybeSingle()
  const queued = await enqueueEmail({
    organizationId: context.membership.organization.id,
    template: "organization_invitation",
    recipient: email,
    locale: organization?.default_language === "en" ? "en" : "fr",
    idempotencyKey: invitationIdempotencyKey(invitation.id),
    payload: { organizationName: organization?.name ?? context.membership.organization.name, url: `${getAppUrl()}/invite/${share.token}` },
  })
  if (!queued.queued) return { error: "L'invitation est créée, mais l'email n'a pas pu être mis en file." }
  await admin.from("audit_logs").insert({
    organization_id: context.membership.organization.id,
    actor_id: context.user.id,
    action: "member.invited",
    metadata: { role },
  })
  revalidatePath("/dashboard/settings/team")
  return { ok: true as const }
}

export async function acceptInvitation(token: string) {
  const user = await getUser()
  if (!user) redirect(`/login?next=/invite/${token}`)
  const admin = createAdminClient()
  const { data: invitation } = await admin.from("organization_invitations").select("organization_id").eq("token_hash", hashInviteToken(token)).maybeSingle()
  const limit = invitation ? (await loadEntitlements(invitation.organization_id)).limits.team_members : 0
  const supabase = await createClient()
  const { error } = await supabase.rpc("accept_organization_invitation", {
    p_token_hash: hashInviteToken(token),
    p_member_limit: limit,
  })
  if (error) redirect(`/invite/${token}?error=1`)
  redirect("/dashboard")
}

export async function transferOwnership(userId: string) {
  const context = await manager()
  if ("error" in context || !can({ role: context.membership.role }, "ownership.transfer")) return { error: "Permission refusée." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("transfer_organization_ownership", { p_target: userId })
  if (error) return { error: "Le transfert a échoué." }
  revalidatePath("/dashboard/settings/team")
  return { ok: true as const }
}

export async function addDomain(formData: FormData) {
  const context = await manager()
  if ("error" in context) return context
  const entitlements = await loadEntitlements(context.membership.organization.id)
  if (!hasFeature(entitlements, "custom_domain")) return { error: "Les domaines personnalisés sont disponibles à partir du plan Business." }
  const domain = normalizeDomain(String(formData.get("domain") ?? ""))
  if (!domain) return { error: "Nom de domaine invalide." }
  if (!await allowRate(`domain:${context.membership.organization.id}`, 3600, 10)) return { error: "Trop de vérifications. Réessayez plus tard." }
  const admin = createAdminClient()
  const defaultSlug = String(formData.get("default_slug") ?? "").trim()
  let defaultScorecardId: string | null = null
  if (defaultSlug) {
    const { data: scorecard } = await admin.from("scorecards").select("id").eq("organization_id", context.membership.organization.id).eq("slug", defaultSlug).eq("status", "published").maybeSingle()
    if (!scorecard) return { error: "La scorecard par défaut est introuvable." }
    defaultScorecardId = scorecard.id
  }
  const vercel = await addVercelDomain(domain)
  if (vercel.configured && !vercel.ok) return { error: "Le domaine n'a pas pu être ajouté chez l'hébergeur." }
  const { error } = await admin.from("custom_domains").insert({
    organization_id: context.membership.organization.id,
    domain,
    verification_token: randomBytes(18).toString("hex"),
    status: "pending",
    default_scorecard_id: defaultScorecardId,
    ssl_status: vercel.configured && vercel.ok ? vercel.ssl : null,
  })
  if (error) return { error: "Ce domaine ne peut pas être ajouté." }
  revalidatePath("/dashboard/settings/domains")
  return { ok: true as const }
}

export async function verifyDomain(domainId: string) {
  const context = await manager()
  if ("error" in context) return context
  const admin = createAdminClient()
  const { data } = await admin.from("custom_domains").select("id, domain, verification_token, organization_id").eq("id", domainId).eq("organization_id", context.membership.organization.id).maybeSingle()
  if (!data) return { error: "Domaine introuvable." }
  if (!await allowRate(`domain-check:${context.user.id}`, 60, 5)) return { error: "Trop de vérifications. Réessayez plus tard." }
  let verified = false
  try {
    const records = await dns.resolveTxt(data.domain)
    verified = records.flat().some((value) => value.includes(verificationTxt(data.verification_token)))
  } catch {
    verified = false
  }
  const vercel = await getVercelDomain(data.domain)
  if (vercel.configured && !vercel.ok) return { error: "Le statut d'hébergement est indisponible." }
  if (vercel.configured && vercel.ok && !vercel.verified) verified = false
  await admin.from("custom_domains").update({
    status: verified ? "verified" : "failed",
    verified_at: verified ? new Date().toISOString() : null,
    ssl_status: vercel.configured && vercel.ok ? vercel.ssl : null,
  }).eq("id", data.id).eq("organization_id", data.organization_id)
  revalidatePath("/dashboard/settings/domains")
  return verified ? { ok: true as const } : { error: "Le domaine n'est pas encore vérifié." }
}

export async function removeDomain(domainId: string) {
  const context = await manager()
  if ("error" in context) return context
  const admin = createAdminClient()
  const { data } = await admin.from("custom_domains").select("id, domain, organization_id").eq("id", domainId).eq("organization_id", context.membership.organization.id).maybeSingle()
  if (!data) return { error: "Domaine introuvable." }
  await admin.from("custom_domains").update({ status: "disabled" }).eq("id", data.id).eq("organization_id", data.organization_id)
  const vercel = await removeVercelDomain(data.domain)
  if (vercel.configured && !vercel.ok) return { error: "Le domaine est désactivé, mais le retrait chez l'hébergeur a échoué." }
  revalidatePath("/dashboard/settings/domains")
  return { ok: true as const }
}
