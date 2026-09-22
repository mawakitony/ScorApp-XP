import { createHash, randomBytes } from "node:crypto"

export function createInviteToken() {
  const token = randomBytes(32).toString("base64url")
  return { token, hash: hashInviteToken(token) }
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export function inviteExpiry(days = 7, now = Date.now()) {
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString()
}

export function invitationIsActive(input: { acceptedAt: string | null; expiresAt: string; now?: number }) {
  if (input.acceptedAt) return false
  const expires = new Date(input.expiresAt).getTime()
  return Number.isFinite(expires) && expires > (input.now ?? Date.now())
}
