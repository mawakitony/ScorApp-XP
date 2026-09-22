const SECRET_KEYS = ["encrypted_credentials", "secret_hash", "token_hash", "key_hash", "payload", "anonymous_key"]

export function stripSecrets(row: Record<string, unknown>) {
  const copy: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (SECRET_KEYS.includes(key)) continue
    if (typeof value === "string" && /sk_live|sk_test|service_role|AI_API_KEY/i.test(value)) continue
    copy[key] = value
  }
  return copy
}

export function credentialState(encrypted: string | null | undefined, revokedAt?: string | null) {
  if (revokedAt) return "revoked" as const
  return encrypted ? "configured" as const : "not_configured" as const
}
