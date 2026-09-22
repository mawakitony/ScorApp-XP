import { createHash, randomBytes } from "node:crypto"
import { API_SCOPES, type ApiScope } from "./version"

export function generateApiKey() {
  const secret = `wls_live_${randomBytes(24).toString("base64url")}`
  return { secret, prefix: secret.slice(0, 16), hash: hashApiKey(secret) }
}

export function hashApiKey(secret: string) {
  return createHash("sha256").update(secret).digest("hex")
}

export function hasScope(scopes: string[], required: ApiScope) {
  return scopes.includes(required) && API_SCOPES.includes(required)
}

export function rateLimitExceeded(count: number, limit = 100) {
  return count >= limit
}
