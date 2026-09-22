export const WEBHOOK_API_VERSION = "2026-09-01"
export const WEBHOOK_TIMESTAMP_WINDOW_SECONDS = 5 * 60
export const WEBHOOK_TIMEOUT_MS = 10_000
export const WEBHOOK_MAX_BYTES = 64_000
export const JOB_BATCH_SIZE = 50
export const API_KEY_RATE_LIMIT = 100

export const WEBHOOK_EVENTS = [
  "lead.created",
  "lead.updated",
  "assessment.started",
  "assessment.completed",
  "assessment.result_created",
  "cta.clicked",
  "lead.converted",
  "report.ready",
  "webhook.test",
] as const

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number]

export const INTEGRATION_PROVIDERS = ["webhook", "brevo", "hubspot", "whatsapp", "zapier", "make", "n8n", "custom"] as const
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number]

export const IMPLEMENTED_PROVIDERS = ["webhook", "brevo"] as const

export const CONVERSION_TYPES = [
  "registration",
  "purchase",
  "booking",
  "application",
  "manual",
  "course_registration",
  "course_purchase",
  "bootcamp_registration",
  "exam_booking",
] as const

export type ConversionType = (typeof CONVERSION_TYPES)[number]

export const API_SCOPES = ["conversions:write", "leads:read", "events:write"] as const
export type ApiScope = (typeof API_SCOPES)[number]
