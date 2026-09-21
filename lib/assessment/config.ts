export const SESSION_TTL_DAYS = 30
export const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60
export const START_LIMIT_PER_HOUR = 20
export const TEXT_LIMITS = {
  short_text: 255,
  long_text: 5000,
  email: 255,
  phone: 80,
  country: 2,
  number: 40,
  company: 255,
  job_title: 255,
  name: 80,
  city: 120,
  utm: 120,
  referrer: 500,
} as const

export const IDEMPOTENT_EVENTS = [
  "assessment_started",
  "lead_form_viewed",
  "lead_submitted",
  "assessment_completed",
] as const

export const REPEATABLE_EVENTS = [
  "landing_viewed",
  "question_answered",
  "result_viewed",
  "cta_clicked",
] as const
