export function maskEmail(email: string) {
  const at = email.indexOf("@")
  if (at <= 0 || at === email.length - 1) return "masked"
  return `${email.slice(0, 1)}***@${email.slice(at + 1)}`
}

export function safeProviderFailure(input: { status: number; code: string; message: string; requestId: string; sender: string }) {
  const status = Number.isInteger(input.status) && input.status >= 100 && input.status <= 599 ? input.status : 0
  const code = /^[a-z0-9_]{1,40}$/i.test(input.code) ? input.code : "unknown"
  const requestId = /^[A-Za-z0-9_-]{6,80}$/.test(input.requestId) ? input.requestId : ""
  const message = cleanProviderMessage(input.message)
  const parts = [`provider_failed:${status}:${code}`]
  if (requestId) parts.push(`request=${requestId}`)
  if (message) parts.push(`message=${message}`)
  parts.push(`sender=${maskEmail(input.sender)}`)
  return parts.join(" ").slice(0, 300)
}

function cleanProviderMessage(value: string) {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) => maskEmail(email))
    .replace(/\b(api-key|authorization|bearer)\b\s*[:=]?\s*\S+/gi, "$1 [redacted]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180)
}
