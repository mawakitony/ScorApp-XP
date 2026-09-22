export const SUPPORT_SESSION_MS = 30 * 60 * 1000
export const SUPPORT_REASON_MIN = 20
export const HEARTBEAT_EXPECTED_MS = 5 * 60 * 1000
export const HEARTBEAT_STALE_MS = 15 * 60 * 1000
export const RECENT_AUTH_MS = 30 * 60 * 1000
export const WOLOYEM_SLUG = "woloyem"

export function integrationHealth(input: { failures24h: number; dead: boolean }) {
  if (input.dead || input.failures24h >= 5) return "degraded" as const
  return "healthy" as const
}

export function rangeStart(range: string | undefined, now = Date.now()) {
  const days = range === "90" ? 90 : range === "30" ? 30 : range === "7" ? 7 : 1
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString()
}

export function searchTarget(query: string) {
  const value = query.trim()
  if (value.startsWith("cus_") || value.startsWith("sub_")) return "stripe" as const
  if (value.includes(".")) return "domain" as const
  return "organization" as const
}

export function pageWindow(page: number, size: number) {
  const safe = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  return { from: (safe - 1) * size, to: safe * size - 1, page: safe }
}

export function reasonIsValid(reason: string) {
  return reason.trim().length >= SUPPORT_REASON_MIN && reason.trim().length <= 500
}

export function supportExpiry(now = Date.now()) {
  return new Date(now + SUPPORT_SESSION_MS).toISOString()
}

export function supportIsOpen(input: { status: string; expiresAt: string; now?: number }) {
  if (input.status !== "active") return false
  const expires = new Date(input.expiresAt).getTime()
  return Number.isFinite(expires) && expires > (input.now ?? Date.now())
}

export function supportCanRead(input: { sessionOrgId: string; requestedOrgId: string; open: boolean }) {
  return input.open && input.sessionOrgId === input.requestedOrgId
}

export function canSuspendOrganization(input: { slug: string; allowed: boolean }) {
  return input.allowed && input.slug !== WOLOYEM_SLUG
}

export function canEditEntitlements(input: { slug: string; allowed: boolean }) {
  return input.allowed && input.slug !== WOLOYEM_SLUG
}

export function heartbeatState(lastSeenAt: string | null, now = Date.now()) {
  if (!lastSeenAt) return "unavailable" as const
  const seen = new Date(lastSeenAt).getTime()
  if (!Number.isFinite(seen)) return "unavailable" as const
  if (now - seen > HEARTBEAT_STALE_MS) return "degraded" as const
  return "healthy" as const
}

export function recentAuth(lastSignInAt: string | null, now = Date.now()) {
  if (!lastSignInAt) return false
  const at = new Date(lastSignInAt).getTime()
  return Number.isFinite(at) && now - at <= RECENT_AUTH_MS
}

export function maskEmail(email: string | null) {
  if (!email || !email.includes("@")) return "—"
  const [local, domain] = email.split("@")
  return `${local.slice(0, 1)}***@${domain}`
}

export function maskPhone(phone: string | null) {
  if (!phone) return "—"
  const digits = phone.replace(/\D/g, "")
  if (digits.length < 4) return "—"
  return `${phone.slice(0, Math.min(4, phone.length))} ** ** ${digits.slice(-2)}`
}

export type Money = { currency: string; amountCents: number | null; interval: "monthly" | "yearly"; plan: string; status: string }

export function summarizeMrr(rows: Money[]) {
  const buckets = new Map<string, number | null>()
  for (const row of rows) {
    if (row.plan === "internal" || row.status !== "active") continue
    const currency = row.currency.toUpperCase()
    if (!buckets.has(currency)) buckets.set(currency, 0)
    if (row.amountCents === null) {
      buckets.set(currency, null)
      continue
    }
    const current = buckets.get(currency)
    if (current === null) continue
    const monthly = row.interval === "yearly" ? row.amountCents / 12 : row.amountCents
    buckets.set(currency, (current ?? 0) + monthly)
  }
  return [...buckets.entries()].map(([currency, amountCents]) => ({
    currency,
    mrrCents: amountCents,
    arrCents: amountCents === null ? null : amountCents * 12,
  }))
}
