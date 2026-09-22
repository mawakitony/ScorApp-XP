import "server-only"

import { randomUUID } from "node:crypto"
import { leadTemperature } from "@/lib/leads/qualification"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Json } from "@/types/database"
import { hotLeadKey } from "./brevo"
import { buildWebhookBody, payloadIssue, type WebhookLead } from "./payload"
import { WEBHOOK_EVENTS, type WebhookEventType } from "./version"

type PublishInput = {
  organizationId: string
  type: WebhookEventType
  leadId?: string | null
  sessionId?: string | null
  scorecardId?: string | null
  report?: { id: string; status: string } | null
}

export async function publishIntegrationEvent(input: PublishInput) {
  try {
    await enqueue(input)
  } catch {
    console.error("integration.enqueue.failed")
  }
}

async function enqueue(input: PublishInput) {
  if (!WEBHOOK_EVENTS.includes(input.type) || input.type === "webhook.test") return
  const admin = createAdminClient()
  const snapshot = await loadSnapshot(admin, input)
  const eventId = `evt_${randomUUID().replaceAll("-", "")}`
  const createdAt = new Date().toISOString()
  const body = buildWebhookBody({
    id: eventId,
    type: input.type,
    createdAt,
    organizationId: input.organizationId,
    lead: snapshot.lead,
    report: input.report ?? null,
  })
  if (payloadIssue(body)) {
    console.error("integration.payload.rejected")
    return
  }

  const { error: eventError } = await admin.from("integration_events").insert({
    id: eventId,
    organization_id: input.organizationId,
    event_type: input.type,
    payload: body as Json,
  })
  if (eventError) return

  const { data: hooks } = await admin
    .from("integrations")
    .select("id, config, status")
    .eq("organization_id", input.organizationId)
    .eq("provider", "webhook")
    .eq("status", "active")

  for (const hook of hooks ?? []) {
    const config = record(hook.config)
    const events = Array.isArray(config.events) ? config.events.filter((item): item is string => typeof item === "string") : []
    if (!events.includes(input.type)) continue
    const deliveryBody = config.include_responses === true ? withResponseIds(body, snapshot.responseIds) : body
    if (payloadIssue(deliveryBody)) continue
    const delivery = await admin.from("webhook_deliveries").insert({
      organization_id: input.organizationId,
      integration_id: hook.id,
      event_type: input.type,
      event_id: eventId,
      payload: deliveryBody as Json,
      status: "pending",
    }).select("id").maybeSingle()
    if (!delivery.data) continue
    await admin.from("integration_jobs").insert({
      organization_id: input.organizationId,
      delivery_id: delivery.data.id,
      kind: "webhook",
      payload: { eventId, eventType: input.type } as Json,
    })
  }

  const { data: rules } = await admin
    .from("automation_rules")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("trigger", input.type)
    .eq("enabled", true)

  for (const rule of rules ?? []) {
    await admin.from("integration_jobs").insert({
      organization_id: input.organizationId,
      kind: "automation",
      payload: {
        eventId,
        eventType: input.type,
        ruleId: rule.id,
        leadId: snapshot.lead?.id ?? null,
        context: snapshot.context,
      } as Json,
    })
  }

  if (snapshot.lead && snapshot.context.temperature === "hot") {
    await notify(admin, input.organizationId, {
      type: "hot_lead",
      title: "Nouveau lead chaud",
      message: "Un lead vient d'atteindre la température chaude.",
      dedupeKey: hotLeadKey(snapshot.lead.id),
      metadata: { lead_id: snapshot.lead.id },
    })
  }
  if (input.type === "assessment.completed" && (snapshot.context.score ?? 0) >= 75) {
    await notify(admin, input.organizationId, {
      type: "high_score",
      title: "Score élevé",
      message: "Une évaluation s'est terminée avec un score élevé.",
      dedupeKey: `score:${input.sessionId ?? eventId}`,
      metadata: { session_id: input.sessionId ?? null },
    })
  }
  if (input.type === "cta.clicked") {
    await notify(admin, input.organizationId, {
      type: "cta_clicked",
      title: "CTA cliqué",
      message: "Un visiteur a cliqué sur un appel à l'action.",
      dedupeKey: `cta:${input.sessionId ?? eventId}`,
      metadata: { session_id: input.sessionId ?? null },
    })
  }
  if (input.type === "lead.converted" && snapshot.lead) {
    await notify(admin, input.organizationId, {
      type: "lead_converted",
      title: "Lead converti",
      message: "Une conversion réelle a été enregistrée.",
      dedupeKey: `converted:${snapshot.lead.id}:${eventId}`,
      metadata: { lead_id: snapshot.lead.id },
    })
  }
}

function withResponseIds(body: ReturnType<typeof buildWebhookBody>, responseIds: { question_id: string; option_ids: string[] }[]) {
  return { ...body, data: { ...body.data, responses: responseIds } }
}

function record(value: Json): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value
}

async function notify(admin: ReturnType<typeof createAdminClient>, organizationId: string, input: {
  type: string
  title: string
  message: string
  dedupeKey: string
  metadata: Json
}) {
  const { error } = await admin.from("notifications").insert({
    organization_id: organizationId,
    type: input.type,
    title: input.title,
    message: input.message,
    dedupe_key: input.dedupeKey,
    metadata: input.metadata,
  })
  if (error && error.code !== "23505") console.error("notification.insert.failed")
}

async function loadSnapshot(admin: ReturnType<typeof createAdminClient>, input: PublishInput) {
  const empty = {
    lead: null as WebhookLead | null,
    context: emptyContext(),
    responseIds: [] as { question_id: string; option_ids: string[] }[],
  }
  let leadId = input.leadId ?? null
  if (!leadId && input.sessionId) {
    const { data } = await admin.from("leads").select("id").eq("session_id", input.sessionId).eq("organization_id", input.organizationId).maybeSingle()
    leadId = data?.id ?? null
  }
  if (!leadId) return empty

  const { data: lead } = await admin.from("leads").select("id, status, source, scorecard_id, session_id, respondent_id").eq("id", leadId).eq("organization_id", input.organizationId).maybeSingle()
  if (!lead) return empty
  const [{ data: person }, { data: result }, { data: utm }, { data: assignments }, { data: clicks }, { data: scorecard }] = await Promise.all([
    lead.respondent_id
      ? admin.from("respondents").select("first_name, last_name, email, phone, whatsapp, country, city, company, job_title, consent_third_party").eq("id", lead.respondent_id).eq("organization_id", input.organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
    lead.session_id
      ? admin.from("assessment_results").select("overall_percent, result_range_id").eq("session_id", lead.session_id).maybeSingle()
      : Promise.resolve({ data: null }),
    lead.session_id
      ? admin.from("utm_tracking").select("utm_source, utm_medium, utm_campaign, utm_content, utm_term").eq("session_id", lead.session_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("lead_tag_assignments").select("tag_id").eq("lead_id", lead.id),
    lead.session_id
      ? admin.from("cta_clicks").select("id").eq("session_id", lead.session_id).limit(1)
      : Promise.resolve({ data: [] }),
    lead.scorecard_id
      ? admin.from("scorecards").select("name").eq("id", lead.scorecard_id).eq("organization_id", input.organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const tagIds = (assignments ?? []).map((row) => row.tag_id)
  const { data: tags } = tagIds.length
    ? await admin.from("lead_tags").select("name").in("id", tagIds).eq("organization_id", input.organizationId)
    : { data: [] }
  let resultLabel: string | null = null
  if (result?.result_range_id) {
    const { data: range } = await admin.from("result_ranges").select("label").eq("id", result.result_range_id).maybeSingle()
    resultLabel = range?.label ?? null
  }
  const score = result ? Number(result.overall_percent) : null
  const ctaClicked = (clicks ?? []).length > 0
  const tagNames = (tags ?? []).map((tag) => tag.name)
  const webhookLead: WebhookLead = {
    id: lead.id,
    first_name: person?.first_name ?? null,
    last_name: person?.last_name ?? null,
    email: person?.email ?? null,
    phone: person?.phone ?? null,
    whatsapp: person?.whatsapp ?? null,
    country: person?.country ?? null,
    city: person?.city ?? null,
    company: person?.company ?? null,
    job_title: person?.job_title ?? null,
    status: lead.status,
    temperature: leadTemperature(score, ctaClicked),
    scorecard: scorecard?.name ?? null,
    assessment_score: score,
    result: resultLabel,
    tags: tagNames,
    utm: {
      source: utm?.utm_source ?? lead.source,
      medium: utm?.utm_medium ?? null,
      campaign: utm?.utm_campaign ?? null,
      content: utm?.utm_content ?? null,
      term: utm?.utm_term ?? null,
    },
  }
  let responseIds: { question_id: string; option_ids: string[] }[] = []
  if (lead.session_id) {
    const { data: responses } = await admin.from("responses").select("question_id, option_id").eq("session_id", lead.session_id)
    const grouped = new Map<string, string[]>()
    for (const row of responses ?? []) {
      const current = grouped.get(row.question_id) ?? []
      if (row.option_id) current.push(row.option_id)
      grouped.set(row.question_id, current)
    }
    responseIds = [...grouped.entries()].map(([question_id, option_ids]) => ({ question_id, option_ids }))
  }
  return {
    lead: webhookLead,
    responseIds,
    context: {
      score,
      country: person?.country ?? null,
      status: lead.status,
      temperature: webhookLead.temperature,
      scorecardId: lead.scorecard_id,
      result: resultLabel,
      ctaClicked,
      tags: tagNames,
    },
  }
}

function emptyContext() {
  return {
    score: null,
    country: null,
    status: null,
    temperature: null,
    scorecardId: null,
    result: null,
    ctaClicked: false,
    tags: [] as string[],
  }
}
