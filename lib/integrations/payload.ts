import { WEBHOOK_API_VERSION, WEBHOOK_MAX_BYTES, type WebhookEventType } from "./version"

export type WebhookLead = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  country: string | null
  city: string | null
  company: string | null
  job_title: string | null
  status: string | null
  temperature: string | null
  scorecard: string | null
  assessment_score: number | null
  result: string | null
  tags: string[]
  utm: {
    source: string | null
    medium: string | null
    campaign: string | null
    content: string | null
    term: string | null
  }
}

const FORBIDDEN = ["anonymous_key", "token", "password", "service_role", "secret", "api_key", "cookie"]

export function buildWebhookBody(input: {
  id: string
  type: WebhookEventType
  createdAt: string
  organizationId: string
  lead?: WebhookLead | null
  report?: { id: string; status: string } | null
}) {
  return {
    id: input.id,
    version: WEBHOOK_API_VERSION,
    type: input.type,
    created_at: input.createdAt,
    organization: { id: input.organizationId },
    data: input.type === "webhook.test"
      ? { test: true }
      : { lead: input.lead ?? null, ...(input.report ? { report: input.report } : {}) },
  }
}

export function payloadIssue(body: unknown) {
  const raw = JSON.stringify(body)
  if (Buffer.byteLength(raw) > WEBHOOK_MAX_BYTES) return "Payload trop volumineux."
  const lowered = raw.toLowerCase()
  if (FORBIDDEN.some((word) => lowered.includes(word))) return "Payload refusé."
  return null
}
