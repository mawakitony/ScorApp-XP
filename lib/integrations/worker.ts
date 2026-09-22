import "server-only"

import { brevoContact, pushBrevoContact } from "@/lib/integrations/brevo"
import { decryptSecret } from "@/lib/integrations/crypto"
import { isLeadStatus } from "@/lib/leads/qualification"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Json } from "@/types/database"
import { conditionsMatch, parseConditions, type AutomationContext } from "./rules"
import { assertPublicWebhookUrl } from "./ssrf"
import { deliverWebhook } from "./webhook"
import { JOB_BATCH_SIZE } from "./version"

type Admin = ReturnType<typeof createAdminClient>

export async function processIntegrationJobs() {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc("claim_integration_jobs", { p_limit: JOB_BATCH_SIZE })
  if (error || !data) return { processed: 0 }
  for (const job of data) {
    try {
      if (job.kind === "webhook") await runWebhook(admin, job)
      else if (job.kind === "automation") await runAutomation(admin, job)
      else if (job.kind === "brevo") await runBrevo(admin, job)
      else await settle(admin, job.id, "failed", "unknown_job")
    } catch {
      await settle(admin, job.id, "failed", "worker_error")
    }
  }
  return { processed: data.length }
}

async function runWebhook(admin: Admin, job: ClaimedJob) {
  if (!job.delivery_id) {
    await settle(admin, job.id, "failed", "missing_delivery")
    return
  }
  const { data: delivery } = await admin.from("webhook_deliveries").select("id, integration_id, event_type, event_id, payload, attempt").eq("id", job.delivery_id).maybeSingle()
  const { data: integration } = delivery
    ? await admin.from("integrations").select("id, status, config, encrypted_credentials").eq("id", delivery.integration_id).eq("organization_id", job.organization_id).maybeSingle()
    : { data: null }
  if (!delivery || !integration || integration.status !== "active") {
    await settle(admin, job.id, "failed", "integration_unavailable")
    return
  }
  const config = asRecord(integration.config)
  const url = typeof config.url === "string" ? config.url : ""
  const secret = readSecret(integration.encrypted_credentials)
  const urlIssue = url ? await assertPublicWebhookUrl(url) : "URL invalide."
  if (!url || !secret || urlIssue) {
    await admin.from("webhook_deliveries").update({ status: "failed", response_excerpt: "configuration_incomplete" }).eq("id", delivery.id)
    await settle(admin, job.id, "failed", "configuration_incomplete")
    return
  }
  await admin.from("webhook_deliveries").update({ status: "processing", attempt: job.attempts }).eq("id", delivery.id)
  const result = await deliverWebhook({
    url,
    secret,
    event: delivery.event_type,
    deliveryId: delivery.id,
    rawBody: JSON.stringify(delivery.payload),
    attempt: job.attempts,
  })
  const delivered = result.httpStatus !== null && result.httpStatus >= 200 && result.httpStatus < 300
  const status = delivered ? "delivered" : result.status === "dead" ? "dead" : "failed"
  await admin.from("webhook_deliveries").update({
    status,
    http_status: result.httpStatus,
    response_excerpt: result.excerpt,
    next_retry_at: result.delayMs === null ? null : new Date(Date.now() + result.delayMs).toISOString(),
    delivered_at: delivered ? new Date().toISOString() : null,
  }).eq("id", delivery.id)
  if (delivered) {
    const payload = asRecord(delivery.payload)
    const data = asRecord(payload.data ?? null)
    const lead = asRecord(data.lead ?? null)
    const leadId = typeof lead.id === "string" ? lead.id : null
    if (leadId) {
      await admin.from("lead_activities").insert({
        organization_id: job.organization_id,
        lead_id: leadId,
        kind: "webhook_delivered",
        summary: "Webhook livré",
      })
    }
    await settle(admin, job.id, "completed", null)
    return
  }
  if (result.status === "pending" && result.delayMs !== null) {
    await admin.from("integration_jobs").update({
      status: "pending",
      locked_at: null,
      last_error: `http_${result.httpStatus ?? "network"}`,
      next_run_at: new Date(Date.now() + result.delayMs).toISOString(),
    }).eq("id", job.id)
    return
  }
  if (status === "dead") {
    const { error: notificationError } = await admin.from("notifications").insert({
      organization_id: job.organization_id,
      type: "integration_failed",
      title: "Intégration en échec",
      message: "Un webhook n'a pas pu être livré.",
      dedupe_key: `delivery:${delivery.id}`,
      metadata: { delivery_id: delivery.id },
    })
    if (notificationError && notificationError.code !== "23505") console.error("notification.insert.failed")
  }
  await settle(admin, job.id, "failed", status)
}

async function runAutomation(admin: Admin, job: ClaimedJob) {
  const payload = asRecord(job.payload)
  const ruleId = typeof payload.ruleId === "string" ? payload.ruleId : ""
  const eventId = typeof payload.eventId === "string" ? payload.eventId : ""
  const leadId = typeof payload.leadId === "string" ? payload.leadId : null
  if (!ruleId || !eventId) {
    await settle(admin, job.id, "failed", "invalid_rule")
    return
  }
  const { data: existing } = await admin.from("automation_runs").select("id").eq("rule_id", ruleId).eq("event_id", eventId).maybeSingle()
  if (existing) {
    await settle(admin, job.id, "completed", null)
    return
  }
  const { data: rule } = await admin.from("automation_rules").select("id, enabled, conditions, action_type, action_config").eq("id", ruleId).eq("organization_id", job.organization_id).maybeSingle()
  if (!rule || !rule.enabled) {
    await recordRun(admin, job.organization_id, ruleId, eventId, "skipped", null)
    await settle(admin, job.id, "completed", null)
    return
  }
  const context = parseContext(payload.context)
  if (!conditionsMatch(parseConditions(rule.conditions), context)) {
    await recordRun(admin, job.organization_id, ruleId, eventId, "skipped", null)
    await settle(admin, job.id, "completed", null)
    return
  }
  const error = await executeAction(admin, job.organization_id, leadId, eventId, rule.action_type, rule.action_config)
  await recordRun(admin, job.organization_id, ruleId, eventId, error ? "failed" : "completed", error)
  await settle(admin, job.id, error ? "failed" : "completed", error)
}

async function executeAction(admin: Admin, organizationId: string, leadId: string | null, eventId: string, action: string, configValue: Json) {
  const config = asRecord(configValue)
  if (action === "add_tag") {
    const name = typeof config.tag === "string" ? config.tag.trim().slice(0, 50) : ""
    if (!leadId || !name) return "missing_target"
    const { data: existing } = await admin.from("lead_tags").select("id").eq("organization_id", organizationId).ilike("name", name).maybeSingle()
    let tagId = existing?.id ?? null
    if (!tagId) {
      const created = await admin.from("lead_tags").insert({ organization_id: organizationId, name, color: "#16324F" }).select("id").maybeSingle()
      tagId = created.data?.id ?? null
    }
    if (!tagId) return "tag_failed"
    const inserted = await admin.from("lead_tag_assignments").insert({ lead_id: leadId, tag_id: tagId })
    if (inserted.error && inserted.error.code !== "23505") return "tag_failed"
    if (!inserted.error) {
      await admin.from("lead_activities").insert({
        organization_id: organizationId,
        lead_id: leadId,
        kind: "tag_added",
        summary: `Automatisation : tag « ${name} » ajouté`.slice(0, 500),
      })
    }
    return null
  }
  if (action === "change_status") {
    const status = typeof config.status === "string" ? config.status : ""
    if (!leadId || !isLeadStatus(status)) return "missing_target"
    const updated = await admin.from("leads").update({ status }).eq("id", leadId).eq("organization_id", organizationId)
    if (updated.error) return "status_failed"
    await admin.from("lead_activities").insert({
      organization_id: organizationId,
      lead_id: leadId,
      kind: "status_changed",
      summary: `Automatisation : statut passé à ${status}`,
    })
    return null
  }
  if (action === "send_webhook") {
    const integrationId = typeof config.integrationId === "string" ? config.integrationId : ""
    if (!integrationId) return "missing_target"
    const { data: event } = await admin.from("integration_events").select("event_type, payload").eq("id", eventId).eq("organization_id", organizationId).maybeSingle()
    if (!event) return "missing_event"
    const delivery = await admin.from("webhook_deliveries").insert({
      organization_id: organizationId,
      integration_id: integrationId,
      event_type: event.event_type,
      event_id: eventId,
      payload: event.payload,
      status: "pending",
    }).select("id").maybeSingle()
    if (!delivery.data) return null
    await admin.from("integration_jobs").insert({
      organization_id: organizationId,
      delivery_id: delivery.data.id,
      kind: "webhook",
      payload: { eventId } as Json,
    })
    return null
  }
  if (action === "generate_report" || action === "send_report_email" || action === "generate_ai_analysis") {
    const { runReportAction } = await import("@/lib/reports/queue")
    return runReportAction({ organizationId, leadId, action })
  }
  if (action === "send_brevo_event") {
    if (!leadId) return "missing_target"
    const listId = typeof config.listId === "number" ? config.listId : null
    await admin.from("integration_jobs").insert({
      organization_id: organizationId,
      kind: "brevo",
      payload: { leadId, listId, eventId } as Json,
    })
    return null
  }
  return "unknown_action"
}

async function runBrevo(admin: Admin, job: ClaimedJob) {
  const payload = asRecord(job.payload)
  const leadId = typeof payload.leadId === "string" ? payload.leadId : ""
  const listId = typeof payload.listId === "number" ? payload.listId : null
  const { data: integration } = await admin.from("integrations").select("config, encrypted_credentials, status").eq("organization_id", job.organization_id).eq("provider", "brevo").eq("status", "active").limit(1).maybeSingle()
  const apiKey = integration ? readSecret(integration.encrypted_credentials) : null
  if (!integration || !apiKey || !leadId) {
    await settle(admin, job.id, "failed", "brevo_not_configured")
    return
  }
  const { data: lead } = await admin.from("leads").select("id, status, scorecard_id, respondent_id, session_id").eq("id", leadId).eq("organization_id", job.organization_id).maybeSingle()
  if (!lead?.respondent_id) {
    await settle(admin, job.id, "completed", "missing_email")
    return
  }
  const { data: person } = await admin.from("respondents").select("email, first_name, last_name, phone, whatsapp, country, city, company, job_title, consent_third_party").eq("id", lead.respondent_id).eq("organization_id", job.organization_id).maybeSingle()
  const { data: result } = lead.session_id
    ? await admin.from("assessment_results").select("overall_percent, result_range_id").eq("session_id", lead.session_id).maybeSingle()
    : { data: null }
  const { data: scorecard } = lead.scorecard_id
    ? await admin.from("scorecards").select("name").eq("id", lead.scorecard_id).maybeSingle()
    : { data: null }
  let resultLabel: string | null = null
  if (result?.result_range_id) {
    const { data: range } = await admin.from("result_ranges").select("label").eq("id", result.result_range_id).maybeSingle()
    resultLabel = range?.label ?? null
  }
  const allow = asRecord(integration.config).allow_result_consent === true
  const mapped = brevoContact({
    email: person?.email ?? null,
    firstName: person?.first_name ?? null,
    lastName: person?.last_name ?? null,
    phone: person?.phone ?? null,
    whatsapp: person?.whatsapp ?? null,
    country: person?.country ?? null,
    city: person?.city ?? null,
    company: person?.company ?? null,
    jobTitle: person?.job_title ?? null,
    score: result ? Number(result.overall_percent) : null,
    result: resultLabel,
    scorecard: scorecard?.name ?? null,
    status: lead.status,
    temperature: null,
    thirdPartyConsent: person?.consent_third_party === true,
  }, { allowResultConsent: allow })
  if ("skipped" in mapped) {
    await admin.from("lead_activities").insert({
      organization_id: job.organization_id,
      lead_id: leadId,
      kind: "brevo_skipped",
      summary: mapped.skipped === "missing_email" ? "Brevo ignoré : email absent" : "Brevo ignoré : consentement tiers absent",
    })
    await settle(admin, job.id, "completed", mapped.skipped ?? "missing_consent")
    return
  }
  const pushed = await pushBrevoContact({
    apiKey,
    listId: listId ?? numberOrNull(asRecord(integration.config).list_id),
    email: mapped.email,
    attributes: mapped.attributes,
  })
  if (!pushed.ok) {
    const retry = (pushed.status >= 500 || pushed.status === 429) && job.attempts < 6
    await admin.from("integration_jobs").update({
      status: retry ? "pending" : "failed",
      last_error: `brevo_${pushed.status}`,
      locked_at: null,
      next_run_at: new Date(Date.now() + (retry ? 60_000 : 0)).toISOString(),
    }).eq("id", job.id)
    return
  }
  await admin.from("lead_activities").insert({
    organization_id: job.organization_id,
    lead_id: leadId,
    kind: "brevo_synced",
    summary: "Synchronisé vers Brevo",
  })
  await settle(admin, job.id, "completed", null)
}

function readSecret(packed: string | null) {
  const secret = process.env.INTEGRATIONS_SECRET
  if (!packed || !secret) return null
  try {
    return decryptSecret(packed, secret)
  } catch {
    return null
  }
}

function numberOrNull(value: Json | undefined) {
  return typeof value === "number" ? value : null
}

async function recordRun(admin: Admin, organizationId: string, ruleId: string, eventId: string, status: string, error: string | null) {
  const { error: insertError } = await admin.from("automation_runs").insert({
    organization_id: organizationId,
    rule_id: ruleId,
    event_id: eventId,
    status,
    completed_at: new Date().toISOString(),
    error,
  })
  if (insertError && insertError.code !== "23505") console.error("automation.run.failed")
}

async function settle(admin: Admin, jobId: string, status: "completed" | "failed" | "pending", lastError: string | null) {
  await admin.from("integration_jobs").update({
    status,
    last_error: lastError,
    locked_at: null,
  }).eq("id", jobId)
}

type ClaimedJob = {
  id: string
  organization_id: string
  delivery_id: string | null
  kind: string
  payload: Json
  attempts: number
}

function asRecord(value: Json | undefined | null): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value
}

function parseContext(value: Json | undefined): AutomationContext {
  const row = asRecord(value ?? null)
  return {
    score: typeof row.score === "number" ? row.score : null,
    country: typeof row.country === "string" ? row.country : null,
    status: typeof row.status === "string" ? row.status : null,
    temperature: typeof row.temperature === "string" ? row.temperature : null,
    scorecardId: typeof row.scorecardId === "string" ? row.scorecardId : null,
    result: typeof row.result === "string" ? row.result : null,
    ctaClicked: row.ctaClicked === true,
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [],
  }
}
