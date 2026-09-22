import { createHash, randomBytes } from "node:crypto"

export function createShareToken() {
  const token = randomBytes(32).toString("base64url")
  return { token, hash: hashShareToken(token) }
}

export function hashShareToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export function shareIsActive(input: { revokedAt: string | null; expiresAt: string; now?: number }) {
  if (input.revokedAt) return false
  const expires = new Date(input.expiresAt).getTime()
  return Number.isFinite(expires) && expires > (input.now ?? Date.now())
}

export function shareExpiry(days: 1 | 7 | 30, now = Date.now()) {
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString()
}
