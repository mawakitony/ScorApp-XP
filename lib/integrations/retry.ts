const RETRYABLE_STATUS = new Set([408, 429])

export const RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  12 * 60 * 60_000,
  24 * 60 * 60_000,
] as const

export function shouldRetry(input: { httpStatus: number | null; networkError: boolean }) {
  if (input.networkError) return true
  if (input.httpStatus === null) return true
  if (RETRYABLE_STATUS.has(input.httpStatus)) return true
  if (input.httpStatus >= 500) return true
  return false
}

/** `attempt` est le nombre d'échecs déjà constatés, à partir de 1. */
export function retryPlan(attempt: number, input: { httpStatus: number | null; networkError: boolean }) {
  if (!shouldRetry(input)) return { status: "failed" as const, delayMs: null }
  const delay = RETRY_DELAYS_MS[attempt - 1]
  if (delay === undefined) return { status: "dead" as const, delayMs: null }
  return { status: "pending" as const, delayMs: delay }
}
