export function monthPeriod(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

export function usageLevel(used: number, limit: number | null): "ok" | "warn80" | "warn90" | "full" {
  if (limit === null || limit <= 0) return used > 0 && limit === 0 ? "full" : "ok"
  const ratio = used / limit
  if (ratio >= 1) return "full"
  if (ratio >= 0.9) return "warn90"
  if (ratio >= 0.8) return "warn80"
  return "ok"
}

export function quotaAllows(used: number, limit: number | null) {
  if (limit === null) return true
  return used < limit
}

export const MONTHLY_METRICS = ["assessment_starts", "leads", "ai_generations", "api_requests", "webhook_deliveries", "reports"] as const
