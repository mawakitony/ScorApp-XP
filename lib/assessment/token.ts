import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

export function createSessionToken() {
  return randomBytes(32).toString("base64url")
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export function sessionTokensMatch(rawToken: string, storedHash: string) {
  const hashed = hashSessionToken(rawToken)
  const left = Buffer.from(hashed)
  const right = Buffer.from(storedHash)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

const publicSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function cookieName() {
  return "woloyem_assessment"
}

/** Le chemin du cookie est le slug réel, jamais le segment de route `[slug]`. */
export function sessionCookiePath(slug: string) {
  if (!publicSlug.test(slug)) return null
  return `/s/${slug}`
}
