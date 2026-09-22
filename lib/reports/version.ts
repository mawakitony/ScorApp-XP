export const REPORT_AI_PROMPT_VERSION = "v1"
export const REPORT_SHARE_WINDOW_MS = 15 * 60 * 1000
export const REPORT_REGEN_WINDOW_MS = 3 * 60 * 1000
export const PDF_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000] as const
export const STRENGTH_MIN = 80
export const MODERATE_MIN = 60

export type ReportLanguage = "fr" | "en"
export type CategoryBand = "strength" | "moderate" | "improvement"
export type ReportType = "participant" | "admin"
export type AiMode = "disabled" | "manual" | "automatic"

export function categoryBand(percent: number): CategoryBand {
  if (percent >= STRENGTH_MIN) return "strength"
  if (percent >= MODERATE_MIN) return "moderate"
  return "improvement"
}

export function nextReportVersion(current: number | null) {
  return Math.max(0, current ?? 0) + 1
}

export function regenerationBlocked(lastCreatedAt: string | null, now: number, windowMs = REPORT_REGEN_WINDOW_MS) {
  if (!lastCreatedAt) return false
  const created = new Date(lastCreatedAt).getTime()
  if (!Number.isFinite(created)) return false
  return now - created < windowMs
}

export function pdfRetryPlan(attempt: number) {
  const delay = PDF_RETRY_DELAYS_MS[attempt - 1]
  if (delay === undefined) return { status: "dead" as const, delayMs: null }
  return { status: "pending" as const, delayMs: delay }
}
