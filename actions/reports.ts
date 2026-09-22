"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { loadVisitorSession } from "@/lib/assessment/store"
import { canEdit, getUser } from "@/lib/auth/session"
import { ensureMembership } from "@/lib/data/membership"
import { createShareToken, shareExpiry } from "@/lib/reports/share"
import { regenerateReport } from "@/lib/reports/queue"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"

async function editor() {
  const membership = await ensureMembership()
  const user = await getUser()
  if (!membership || !user || !canEdit(membership.role)) return { error: "Permission refusée." as const }
  return { organizationId: membership.organization.id, userId: user.id }
}

export async function saveReportSetup(input: {
  scorecardId: string
  enabled: boolean
  pdf: boolean
  categories: boolean
  strengths: boolean
  improvements: boolean
  cta: boolean
  disclaimer: boolean
  aiMode: string
  messages: { id: string; high: string; medium: string; low: string }[]
  rule?: { categoryId: string; operator: string; threshold: string; message: string }
}) {
  const context = await editor()
  if ("error" in context) return context
  if (!z.string().uuid().safeParse(input.scorecardId).success) return { error: "Scorecard invalide." }
  const supabase = await createClient()
  const aiMode = input.aiMode === "manual" || input.aiMode === "automatic" ? input.aiMode : "disabled"
  const { error } = await supabase.from("scorecards").update({
    report_config: {
      enabled: input.enabled,
      pdf: input.pdf,
      categories: input.categories,
      strengths: input.strengths,
      improvements: input.improvements,
      cta: input.cta,
      disclaimer: input.disclaimer,
      aiMode,
    },
  }).eq("id", input.scorecardId).eq("organization_id", context.organizationId)
  if (error) return { error: "Le rapport n'a pas pu être configuré." }
  for (const message of input.messages.slice(0, 30)) {
    if (!z.string().uuid().safeParse(message.id).success) continue
    await supabase.from("scoring_categories").update({
      high_message: message.high.slice(0, 500),
      medium_message: message.medium.slice(0, 500),
      low_message: message.low.slice(0, 500),
    }).eq("id", message.id).eq("scorecard_id", input.scorecardId)
  }
  if (input.rule?.message.trim() && z.string().uuid().safeParse(input.rule.categoryId).success) {
    const operator = input.rule.operator === "lte" || input.rule.operator === "gte" ? input.rule.operator : "lt"
    const threshold = Number(input.rule.threshold)
    if (Number.isFinite(threshold)) {
      await supabase.from("report_rules").insert({
        organization_id: context.organizationId,
        scorecard_id: input.scorecardId,
        scoring_category_id: input.rule.categoryId,
        operator,
        threshold,
        message: input.rule.message.trim().slice(0, 500),
      })
    }
  }
  revalidatePath(`/dashboard/scorecards/${input.scorecardId}/builder`)
  return { ok: true as const }
}

export async function saveOrgReportSettings(input: { brandName: string; website: string; email: string; footer: string; aiMode: string }) {
  const context = await editor()
  if ("error" in context) return context
  const aiMode = input.aiMode === "manual" || input.aiMode === "automatic" ? input.aiMode : "disabled"
  const supabase = await createClient()
  const { error } = await supabase.from("organizations").update({
    report_settings: {
      brandName: input.brandName.trim().slice(0, 80) || "WOLOYEM",
      website: input.website.trim().slice(0, 200),
      email: input.email.trim().slice(0, 200),
      footer: input.footer.trim().slice(0, 300),
      aiMode,
    } satisfies Json,
  }).eq("id", context.organizationId)
  if (error) return { error: "Les paramètres n'ont pas pu être enregistrés." }
  revalidatePath("/dashboard/settings")
  return { ok: true as const }
}

export async function createReportShare(reportId: string, days: 1 | 7 | 30) {
  const context = await editor()
  if ("error" in context || !z.string().uuid().safeParse(reportId).success) return { error: "Permission refusée." }
  const admin = createAdminClient()
  const { data: report } = await admin.from("assessment_reports").select("id, report_type").eq("id", reportId).eq("organization_id", context.organizationId).maybeSingle()
  if (!report || report.report_type !== "participant") return { error: "Rapport introuvable." }
  const share = createShareToken()
  const { error } = await admin.from("report_shares").insert({
    organization_id: context.organizationId,
    report_id: report.id,
    token_hash: share.hash,
    expires_at: shareExpiry(days),
  })
  if (error) return { error: "Le lien n'a pas pu être créé." }
  await admin.from("report_events").insert({ organization_id: context.organizationId, report_id: report.id, event_type: "report.shared" })
  revalidatePath("/dashboard/leads")
  return { ok: true as const, token: share.token }
}

export async function revokeReportShare(shareId: string) {
  const context = await editor()
  if ("error" in context || !z.string().uuid().safeParse(shareId).success) return { error: "Permission refusée." }
  const supabase = await createClient()
  const { error } = await supabase.from("report_shares").update({ revoked_at: new Date().toISOString() }).eq("id", shareId).eq("organization_id", context.organizationId).is("revoked_at", null)
  if (error) return { error: "Le lien n'a pas pu être révoqué." }
  revalidatePath("/dashboard/leads")
  return { ok: true as const }
}

export async function regenerateLeadReport(sessionId: string, reportType: "participant" | "admin") {
  const context = await editor()
  if ("error" in context || !z.string().uuid().safeParse(sessionId).success) return { error: "Permission refusée." }
  const result = await regenerateReport({ organizationId: context.organizationId, sessionId, reportType })
  if (result && "error" in result && result.error) return { error: result.error }
  revalidatePath("/dashboard/leads")
  return { ok: true as const }
}

async function ownParticipantReport(slug: string) {
  const loaded = await loadVisitorSession(slug)
  if ("error" in loaded) return { error: "Session introuvable." as const }
  const admin = createAdminClient()
  const { data: report } = await admin
    .from("assessment_reports")
    .select("id, status, organization_id")
    .eq("session_id", loaded.session.id)
    .eq("organization_id", loaded.scorecard.organization_id)
    .eq("report_type", "participant")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!report) return { error: "Rapport introuvable." as const }
  return { report, slug, sessionId: loaded.session.id }
}

export async function retryOwnReport(slug: string) {
  const owned = await ownParticipantReport(slug)
  if ("error" in owned) return owned
  if (owned.report.status !== "failed") return { error: "Ce rapport ne peut pas être relancé." as const }
  const admin = createAdminClient()
  await admin.from("assessment_reports").update({ status: "pending" }).eq("id", owned.report.id).eq("organization_id", owned.report.organization_id)
  const { error } = await admin.from("report_jobs").insert({
    organization_id: owned.report.organization_id,
    report_id: owned.report.id,
    kind: "pdf",
    status: "pending",
  })
  if (error && error.code !== "23505") return { error: "Relance impossible." as const }
  revalidatePath(`/s/${owned.slug}/results/${owned.sessionId}/report`)
  return { ok: true as const }
}

export async function shareOwnReport(slug: string, days: 1 | 7 | 30) {
  const owned = await ownParticipantReport(slug)
  if ("error" in owned) return owned
  if (days !== 1 && days !== 7 && days !== 30) return { error: "Durée invalide." as const }
  const admin = createAdminClient()
  const share = createShareToken()
  const { error } = await admin.from("report_shares").insert({
    organization_id: owned.report.organization_id,
    report_id: owned.report.id,
    token_hash: share.hash,
    expires_at: shareExpiry(days),
  })
  if (error) return { error: "Le lien n'a pas pu être créé." as const }
  await admin.from("report_events").insert({
    organization_id: owned.report.organization_id,
    report_id: owned.report.id,
    event_type: "report.shared",
  })
  return { ok: true as const, token: share.token }
}

export async function retryReport(reportId: string) {
  const context = await editor()
  if ("error" in context || !z.string().uuid().safeParse(reportId).success) return { error: "Permission refusée." }
  const admin = createAdminClient()
  const { data: report } = await admin.from("assessment_reports").select("id, status").eq("id", reportId).eq("organization_id", context.organizationId).maybeSingle()
  if (!report || report.status !== "failed") return { error: "Ce rapport ne peut pas être relancé." }
  await admin.from("assessment_reports").update({ status: "pending" }).eq("id", report.id)
  const { error } = await admin.from("report_jobs").insert({ organization_id: context.organizationId, report_id: report.id, kind: "pdf", status: "pending" })
  if (error && error.code !== "23505") return { error: "Relance impossible." }
  return { ok: true as const }
}
