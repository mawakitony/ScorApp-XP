// Credentials are encrypted with AES-256-GCM before storage.
// The key is SHA-256(INTEGRATIONS_SECRET). The plaintext never goes in a column, a log, or a Client Component.
// Service role reads the ciphertext and decrypts only while sending.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

export function encryptSecret(plain: string, secret: string) {
  const key = createHash("sha256").update(secret).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`
}

export function decryptSecret(packed: string, secret: string) {
  const [ivRaw, tagRaw, dataRaw] = packed.split(".")
  if (!ivRaw || !tagRaw || !dataRaw) throw new Error("credential_invalid")
  const key = createHash("sha256").update(secret).digest()
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64url"))
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, "base64url")), decipher.final()]).toString("utf8")
}
