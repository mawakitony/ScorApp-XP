import { createHmac, timingSafeEqual } from "node:crypto"
import { WEBHOOK_TIMESTAMP_WINDOW_SECONDS } from "./version"

export function signWebhook(secret: string, timestamp: string, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")
}

export function webhookSignatureHeader(secret: string, timestamp: string, rawBody: string) {
  return `v1=${signWebhook(secret, timestamp, rawBody)}`
}

export function signaturesMatch(expected: string, received: string) {
  const left = Buffer.from(expected)
  const right = Buffer.from(received)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function timestampIsFresh(timestamp: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const value = Number(timestamp)
  if (!Number.isFinite(value)) return false
  return Math.abs(nowSeconds - value) <= WEBHOOK_TIMESTAMP_WINDOW_SECONDS
}
