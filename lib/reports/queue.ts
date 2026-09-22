import "server-only"

import { activeAiProvider } from "@/lib/ai/provider"
import { REPORT_AI_PROMPT_VERSION, explainWithoutChangingScore, sanitizeAiAnalysis, type AIReportInput } from "@/lib/ai/prompts"
import { decryptSecret } from "@/lib/integrations/crypto"
import { publishIntegrationEvent } from "@/lib/integrations/dispatch"
import { consumeMonthly, loadEntitlements, monthlyUsage } from "@/lib/billing/account"
import { hasFeature, withinLimit } from "@/lib/billing/entitlements"
import { dataCompleteness, leadQuality, leadTemperature } from "@/lib/leads/qualification"
import { parseLeadFields } from "@/lib/scorecard/content"
import { categoryBand, nextReportVersion, pdfRetryPlan, regenerationBlocked } from "@/lib/reports/version"
import { generateRuleBasedInsights, type InsightRule } from "@/lib/reports/insights"
import { renderReportPdf, type InternalDetails } from "@/lib/reports/pdf"
import { createShareToken, shareExpiry } from "@/lib/reports/share"
import { participantDto, type ParticipantReport } from "@/lib/reports/dto"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAppUrl } from "@/lib/env"
import type { Json } from "@/types/database"

type Admin = ReturnType<typeof createAdminClient>

export async function enqueueParticipantReport(input: { organizationId: string; sessionId: string; scorecardId: string }) {
  try {
    await createReport({ ...input, reportType: "participant", force: false })
  } catch {
    console.error("report.enqueue.failed")
  }
}

export async function regenerateReport(input: { organizationId: string; sessionId: string; reportType: "participant" | "admin" }) {
  return createReport({ ...input, scorecardId: null, force: true })
}

export async function runReportAction(input: { organizationId: string; leadId: string | null; action: string }) {
  if (!input.leadId) return "missing_target"
  const admin = createAdminClient()
  const { data: lead } = await admin.from("leads").select("session_id, scorecard_id").eq("id", input.leadId).eq("organization_id", input.organizationId).maybeSingle()
  if (!lead?.session_id) return "missing_target"
  if (input.action === "generate_report") {
    await createReport({ organizationId: input.organizationId, sessionId: lead.session_id, scorecardId: lead.scorecard_id, reportType: "participant", force: false })
    return null
  }
  const { data: report } = await admin.from("assessment_reports").select("id").eq("session_id", lead.session_id).eq("organization_id", input.organizationId).eq("report_type", "participant").order("version", { ascending: false }).limit(1).maybeSingle()
  if (!report) return "missing_report"
  if (input.action === "send_report_email") {
    await enqueueJob(admin, input.organizationId, report.id, "email")
    return null
  }
  if (input.action === "generate_ai_analysis") {
    if (!activeAiProvider().configured) return "ai_not_configured"
    await admin.from("assessment_reports").update({ ai_status: "pending" }).eq("id", report.id)
    await enqueueJob(admin, input.organizationId, report.id, "ai")
    return null
  }
  return "unknown_action"
}

export async function processReportJobs() {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc("claim_report_jobs", { p_limit: 20 })
  if (error || !data) return { reports: 0 }
  for (const job of data) {
    try {
      if (job.kind === "pdf") await runPdf(admin, job)
      else if (job.kind === "ai") await runAi(admin, job)
      else if (job.kind === "email") await runEmail(admin, job)
      else await finishJob(admin, job.id, "failed", "unknown_job", null)
    } catch {
      await finishJob(admin, job.id, "failed", "worker_error", null)
    }
  }
  return { reports: data.length }
}

async function createReport(input: {
  organizationId: string
  sessionId: string
  scorecardId: string | null
  reportType: "participant" | "admin"
  force: boolean
}) {
  const admin = createAdminClient()
  const { data: result } = await admin.from("assessment_results").select("id, overall_percent, result_range_id, session_id").eq("session_id", input.sessionId).maybeSingle()
  if (!result) return { error: "Résultat introuvable." as const }
  const { data: session } = await admin.from("assessment_sessions").select("scorecard_id").eq("id", input.sessionId).maybeSingle()
  const scorecardId = input.scorecardId ?? session?.scorecard_id ?? null
  if (!scorecardId) return { error: "Scorecard introuvable." as const }
  const { data: scorecard } = await admin.from("scorecards").select("id, organization_id, name, language, privacy_text, report_config").eq("id", scorecardId).maybeSingle()
  if (!scorecard || scorecard.organization_id !== input.organizationId) return { error: "Scorecard introuvable." as const }
  const config = reportConfig(scorecard.report_config)
  if (!config.enabled && input.reportType === "participant" && !input.force) return { ok: true as const }

  const { data: latest } = await admin.from("assessment_reports").select("id, version, created_at, status").eq("assessment_result_id", result.id).eq("report_type", input.reportType).order("version", { ascending: false }).limit(1).maybeSingle()
  if (latest && !input.force) return { ok: true as const, id: latest.id }
  if (input.force && regenerationBlocked(latest?.created_at ?? null, Date.now())) return { error: "Une version vient d'être générée. Réessayez dans quelques minutes." as const }

  const snapshot = await buildSnapshot(admin, {
    organizationId: input.organizationId,
    sessionId: input.sessionId,
    scorecard,
    result,
    config,
    internal: input.reportType === "admin",
  })
  const version = nextReportVersion(latest?.version ?? null)
  const { data: lead } = await admin.from("leads").select("id").eq("session_id", input.sessionId).eq("organization_id", input.organizationId).maybeSingle()
  const inserted = await admin.from("assessment_reports").insert({
    organization_id: input.organizationId,
    assessment_result_id: result.id,
    session_id: input.sessionId,
    lead_id: lead?.id ?? null,
    scorecard_id: scorecard.id,
    report_type: input.reportType,
    status: config.pdf ? "pending" : "ready",
    version,
    snapshot: snapshot as unknown as Json,
    ai_status: "not_requested",
    generated_at: config.pdf ? null : new Date().toISOString(),
  }).select("id").maybeSingle()
  if (!inserted.data) return { error: "Le rapport existe déjà." as const }
  if (config.pdf) await enqueueJob(admin, input.organizationId, inserted.data.id, "pdf")
  const orgMode = orgAiMode(await loadSettings(admin, input.organizationId))
  const aiWanted = input.reportType === "participant" && config.aiMode === "automatic" && orgMode === "automatic" && activeAiProvider().configured
  if (aiWanted) {
    await admin.from("assessment_reports").update({ ai_status: "pending" }).eq("id", inserted.data.id)
    await enqueueJob(admin, input.organizationId, inserted.data.id, "ai")
  }
  await admin.from("report_events").insert({ organization_id: input.organizationId, report_id: inserted.data.id, event_type: "report.generated" })
  return { ok: true as const, id: inserted.data.id }
}

async function buildSnapshot(admin: Admin, input: {
  organizationId: string
  sessionId: string
  scorecard: { id: string; name: string; language: "fr" | "en"; privacy_text: string | null }
  result: { id: string; overall_percent: number; result_range_id: string | null }
  config: ReturnType<typeof reportConfig>
  internal: boolean
}) {
  const settings = await loadSettings(admin, input.organizationId)
  const [{ data: scores }, { data: range }, { data: recommendation }, { data: rules }, { data: lead }] = await Promise.all([
    admin.from("category_scores").select("scoring_category_id, percent").eq("result_id", input.result.id),
    input.result.result_range_id ? admin.from("result_ranges").select("title, description, badge, label").eq("id", input.result.result_range_id).maybeSingle() : Promise.resolve({ data: null }),
    input.result.result_range_id ? admin.from("result_recommendations").select("body, cta_label").eq("result_range_id", input.result.result_range_id).order("position").limit(1).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("report_rules").select("scoring_category_id, operator, threshold, message").eq("scorecard_id", input.scorecard.id).eq("organization_id", input.organizationId),
    admin.from("leads").select("id, status, source, respondent_id, session_id, scorecard_id").eq("session_id", input.sessionId).eq("organization_id", input.organizationId).maybeSingle(),
  ])
  const categoryIds = (scores ?? []).map((score) => score.scoring_category_id)
  const { data: categories } = categoryIds.length
    ? await admin.from("scoring_categories").select("id, name, high_message, medium_message, low_message").in("id", categoryIds)
    : { data: [] }
  const named = (scores ?? []).map((score) => {
    const category = categories?.find((item) => item.id === score.scoring_category_id)
    return {
      name: category?.name ?? "Catégorie",
      percent: Number(score.percent),
      high: category?.high_message ?? "",
      medium: category?.medium_message ?? "",
      low: category?.low_message ?? "",
    }
  })
  const insightRules: InsightRule[] = []
  for (const rule of rules ?? []) {
    const category = categories?.find((item) => item.id === rule.scoring_category_id)
    if (!category || (rule.operator !== "lt" && rule.operator !== "lte" && rule.operator !== "gte")) continue
    insightRules.push({ categoryName: category.name, op: rule.operator, threshold: Number(rule.threshold), message: rule.message })
  }
  const insights = generateRuleBasedInsights({
    language: input.scorecard.language,
    officialPercent: Number(input.result.overall_percent),
    resultTitle: range?.title || range?.label || "Résultat",
    resultDescription: range?.description ?? "",
    rangeRecommendation: recommendation?.body ?? "",
    categories: named,
    rules: insightRules,
  })
  let participantLabel = input.scorecard.language === "en" ? "Participant" : "Participant"
  if (lead?.respondent_id && !input.internal) {
    const { data: person } = await admin.from("respondents").select("first_name, last_name").eq("id", lead.respondent_id).eq("organization_id", input.organizationId).maybeSingle()
    const name = [person?.first_name, person?.last_name].filter(Boolean).join(" ")
    if (name) participantLabel = name
  }
  const report: ParticipantReport = {
    language: input.scorecard.language,
    brandName: settings.brandName || "WOLOYEM",
    website: settings.website,
    contactEmail: settings.email,
    footer: settings.footer,
    scorecardTitle: input.scorecard.name,
    participantLabel,
    generatedAt: new Date().toISOString(),
    overallPercent: insights.officialPercent,
    badge: range?.badge || range?.label || "",
    resultTitle: range?.title || "Résultat",
    summary: insights.summary,
    categories: input.config.categories ? named.map((category) => ({ name: category.name, percent: category.percent, band: categoryBand(category.percent) })) : [],
    strengths: input.config.strengths ? insights.strengths : [],
    improvementAreas: input.config.improvements ? insights.improvementAreas : [],
    recommendations: insights.recommendations,
    ctaLabel: input.config.cta ? recommendation?.cta_label ?? "" : "",
    disclaimer: input.config.disclaimer ? input.scorecard.privacy_text ?? "" : "",
  }
  if (!input.internal || !lead) return report
  const [{ data: person }, { data: notes }, { data: utm }, { data: clicks }, { data: responses }, { data: form }] = await Promise.all([
    lead.respondent_id ? admin.from("respondents").select("email, phone, country, company, job_title").eq("id", lead.respondent_id).eq("organization_id", input.organizationId).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("lead_notes").select("content").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(10),
    lead.session_id ? admin.from("utm_tracking").select("utm_source, utm_campaign").eq("session_id", lead.session_id).maybeSingle() : Promise.resolve({ data: null }),
    lead.session_id ? admin.from("cta_clicks").select("id").eq("session_id", lead.session_id).limit(1) : Promise.resolve({ data: [] }),
    lead.session_id ? admin.from("responses").select("question_id, option_id, value_text, score_awarded").eq("session_id", lead.session_id) : Promise.resolve({ data: [] }),
    lead.scorecard_id ? admin.from("scorecard_lead_forms").select("fields").eq("scorecard_id", lead.scorecard_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const fields = parseLeadFields(form?.fields ?? null)
  const quality = leadQuality({
    assessmentScore: Number(input.result.overall_percent),
    completed: true,
    ctaClicked: (clicks ?? []).length > 0,
    completeness: dataCompleteness(
      { email: person?.email, phone: person?.phone, country: person?.country, company: person?.company, jobTitle: person?.job_title },
      { email: fields.email.enabled, phone: fields.phone.enabled, country: fields.country.enabled, company: fields.company.enabled, jobTitle: fields.job_title.enabled },
    ),
  })
  const questionIds = [...new Set((responses ?? []).map((row) => row.question_id))]
  const { data: questions } = questionIds.length ? await admin.from("questions").select("id, title").in("id", questionIds) : { data: [] }
  const optionIds = (responses ?? []).flatMap((row) => (row.option_id ? [row.option_id] : []))
  const { data: options } = optionIds.length ? await admin.from("question_options").select("id, label").in("id", optionIds) : { data: [] }
  return {
    ...report,
    internal: true,
    leadStatus: lead.status,
    temperature: leadTemperature(Number(input.result.overall_percent), (clicks ?? []).length > 0),
    quality,
    source: utm?.utm_source ?? lead.source,
    campaign: utm?.utm_campaign ?? null,
    email: person?.email ?? null,
    phone: person?.phone ?? null,
    notes: (notes ?? []).map((note) => note.content),
    answers: (responses ?? []).map((row) => ({
      question: questions?.find((question) => question.id === row.question_id)?.title ?? "Question",
      answer: options?.find((option) => option.id === row.option_id)?.label ?? row.value_text ?? "",
      awarded: row.score_awarded === null ? null : Number(row.score_awarded),
    })),
  }
}

function adminPdfDetails(snapshot: ParticipantReport): InternalDetails {
  const raw = snapshot as ParticipantReport & Partial<InternalDetails>
  return {
    leadStatus: raw.leadStatus ?? null,
    temperature: raw.temperature ?? null,
    quality: typeof raw.quality === "number" ? raw.quality : null,
    source: raw.source ?? null,
    campaign: raw.campaign ?? null,
    email: raw.email ?? null,
    phone: raw.phone ?? null,
    answers: Array.isArray(raw.answers) ? raw.answers : [],
    notes: Array.isArray(raw.notes) ? raw.notes : [],
  }
}

function emailFromSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("email" in value)) return null
  return typeof value.email === "string" ? value.email : null
}

async function runPdf(admin: Admin, job: { id: string; organization_id: string; report_id: string; attempts: number }) {
  const { data: report } = await admin.from("assessment_reports").select("id, version, snapshot, report_type, organization_id, lead_id, session_id, scorecard_id").eq("id", job.report_id).eq("organization_id", job.organization_id).maybeSingle()
  if (!report) {
    await finishJob(admin, job.id, "failed", "missing_report", null)
    return
  }
  await admin.from("assessment_reports").update({ status: "generating" }).eq("id", report.id)
  try {
    const snapshot = report.snapshot as ParticipantReport
    const presented = participantDto(snapshot)
    const details = report.report_type === "admin" ? adminPdfDetails(snapshot) : null
    const buffer = await renderReportPdf(presented, report.report_type === "admin", details)
    const path = `${report.organization_id}/${report.id}/report-v${report.version}.pdf`
    const uploaded = await admin.storage.from("assessment-reports").upload(path, buffer, { contentType: "application/pdf", upsert: true })
    if (uploaded.error) throw new Error("storage")
    await admin.from("assessment_reports").update({ status: "ready", storage_path: path, generated_at: new Date().toISOString() }).eq("id", report.id)
    await admin.from("report_events").insert({ organization_id: report.organization_id, report_id: report.id, event_type: "report.ready" })
    const email = emailFromSnapshot(report.snapshot)
    if (email) {
      const { enqueueEmail } = await import("@/lib/email/queue")
      await enqueueEmail({
        organizationId: report.organization_id,
        template: "report_ready",
        recipient: email,
        locale: "fr",
        idempotencyKey: `report_ready:${report.id}`,
        payload: { organizationName: "WOLOYEM Score" },
      })
    }
    await publishIntegrationEvent({
      organizationId: report.organization_id,
      type: "report.ready",
      leadId: report.lead_id,
      sessionId: report.session_id,
      scorecardId: report.scorecard_id,
      report: { id: report.id, status: "ready" },
    })
    await finishJob(admin, job.id, "completed", null, null)
  } catch {
    const plan = pdfRetryPlan(job.attempts)
    await admin.from("assessment_reports").update({ status: plan.status === "dead" ? "failed" : "pending" }).eq("id", report.id)
    await finishJob(admin, job.id, plan.status === "pending" ? "pending" : "dead", "pdf_failed", plan.delayMs)
  }
}

async function runAi(admin: Admin, job: { id: string; organization_id: string; report_id: string }) {
  const entitlements = await loadEntitlements(job.organization_id)
  const used = await monthlyUsage(job.organization_id, "ai_generations")
  if (!hasFeature(entitlements, "ai") || !withinLimit(entitlements, "ai_generations", used)) {
    await admin.from("assessment_reports").update({ ai_status: "not_requested" }).eq("id", job.report_id).eq("organization_id", job.organization_id)
    await finishJob(admin, job.id, "completed", null, null)
    return
  }
  const provider = activeAiProvider()
  const { data: report } = await admin.from("assessment_reports").select("id, snapshot").eq("id", job.report_id).eq("organization_id", job.organization_id).maybeSingle()
  if (!report || !provider.configured) {
    if (report) await admin.from("assessment_reports").update({ ai_status: "failed" }).eq("id", report.id)
    await finishJob(admin, job.id, "failed", "ai_not_configured", null)
    return
  }
  const base = participantDto(report.snapshot as ParticipantReport)
  const input: AIReportInput = {
    language: base.language,
    scorecardTitle: base.scorecardTitle,
    overallPercent: base.overallPercent,
    resultTitle: base.resultTitle,
    categories: base.categories.map((category) => ({ name: category.name, percent: category.percent })),
    recommendations: base.recommendations,
    participantLabel: "Participant",
  }
  const analysis = sanitizeAiAnalysis(await provider.generateReportAnalysis(input))
  if (!analysis) {
    await admin.from("assessment_reports").update({ ai_status: "failed" }).eq("id", report.id)
    await finishJob(admin, job.id, "failed", "ai_failed", null)
    return
  }
  explainWithoutChangingScore({ ...base, officialPercent: base.overallPercent }, analysis)
  await admin.from("assessment_reports").update({
    ai_status: "completed",
    ai_provider: provider.id,
    ai_model: process.env.AI_MODEL || null,
    ai_prompt_version: REPORT_AI_PROMPT_VERSION,
    ai_output: analysis as unknown as Json,
  }).eq("id", report.id)
  await consumeMonthly(job.organization_id, "ai_generations", null)
  await finishJob(admin, job.id, "completed", null, null)
}

async function runEmail(admin: Admin, job: { id: string; organization_id: string; report_id: string }) {
  const { data: report } = await admin.from("assessment_reports").select("id, lead_id, organization_id").eq("id", job.report_id).eq("organization_id", job.organization_id).eq("report_type", "participant").maybeSingle()
  if (!report?.lead_id) {
    await finishJob(admin, job.id, "failed", "missing_report", null)
    return
  }
  const { data: lead } = await admin.from("leads").select("respondent_id").eq("id", report.lead_id).eq("organization_id", report.organization_id).maybeSingle()
  const { data: person } = lead?.respondent_id
    ? await admin.from("respondents").select("email").eq("id", lead.respondent_id).eq("organization_id", report.organization_id).maybeSingle()
    : { data: null }
  const settings = await loadSettings(admin, report.organization_id)
  const { data: integration } = await admin.from("integrations").select("encrypted_credentials, status").eq("organization_id", report.organization_id).eq("provider", "brevo").eq("status", "active").limit(1).maybeSingle()
  const secret = process.env.INTEGRATIONS_SECRET
  const apiKey = integration?.encrypted_credentials && secret ? safeDecrypt(integration.encrypted_credentials, secret) : null
  if (!person?.email || !apiKey || !settings.email) {
    await finishJob(admin, job.id, "completed", "email_skipped", null)
    return
  }
  const share = createShareToken()
  await admin.from("report_shares").insert({
    organization_id: report.organization_id,
    report_id: report.id,
    token_hash: share.hash,
    expires_at: shareExpiry(7),
  })
  const link = `${getAppUrl()}/r/${share.token}`
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: settings.brandName || "WOLOYEM", email: settings.email },
      to: [{ email: person.email }],
      subject: "Votre rapport WOLOYEM",
      htmlContent: `<p>Votre rapport est disponible pendant 7 jours : <a href="${link}">ouvrir le rapport</a></p>`,
    }),
  })
  if (!response.ok) {
    await finishJob(admin, job.id, "failed", "email_failed", null)
    return
  }
  await admin.from("report_events").insert({ organization_id: report.organization_id, report_id: report.id, event_type: "report.email_sent" })
  await admin.from("report_events").insert({ organization_id: report.organization_id, report_id: report.id, event_type: "report.shared" })
  await finishJob(admin, job.id, "completed", null, null)
}

function safeDecrypt(packed: string, secret: string) {
  try {
    return decryptSecret(packed, secret)
  } catch {
    return null
  }
}

async function enqueueJob(admin: Admin, organizationId: string, reportId: string, kind: "pdf" | "ai" | "email") {
  const { error } = await admin.from("report_jobs").insert({ organization_id: organizationId, report_id: reportId, kind, status: "pending" })
  if (error && error.code !== "23505") console.error("report.job.failed")
}

async function finishJob(admin: Admin, jobId: string, status: "pending" | "completed" | "failed" | "dead", lastError: string | null, delayMs: number | null) {
  await admin.from("report_jobs").update({
    status,
    last_error: lastError,
    locked_at: null,
    next_run_at: new Date(Date.now() + (delayMs ?? 0)).toISOString(),
  }).eq("id", jobId)
}

async function loadSettings(admin: Admin, organizationId: string): Promise<{ brandName: string; website: string; email: string; footer: string; aiMode: "disabled" | "manual" | "automatic" }> {
  const { data } = await admin.from("organizations").select("report_settings").eq("id", organizationId).maybeSingle()
  const row = record(data?.report_settings ?? {})
  return {
    brandName: text(row.brandName) || "WOLOYEM",
    website: text(row.website),
    email: text(row.email),
    footer: text(row.footer),
    aiMode: row.aiMode === "manual" || row.aiMode === "automatic" ? row.aiMode : "disabled",
  }
}

function orgAiMode(settings: { aiMode: "disabled" | "manual" | "automatic" }) {
  return settings.aiMode
}

function reportConfig(value: Json) {
  const row = record(value)
  return {
    enabled: row.enabled !== false,
    pdf: row.pdf !== false,
    categories: row.categories !== false,
    strengths: row.strengths !== false,
    improvements: row.improvements !== false,
    cta: row.cta !== false,
    disclaimer: row.disclaimer !== false,
    aiMode: row.aiMode === "manual" || row.aiMode === "automatic" ? row.aiMode : "disabled" as const,
  }
}

function record(value: Json | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, Json | undefined>
  return value
}

function text(value: Json | undefined) {
  return typeof value === "string" ? value : ""
}
