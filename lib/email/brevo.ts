import "server-only"

import { safeProviderFailure } from "@/lib/email/provider-error"

export async function sendBrevoEmail(input: { to: string; subject: string; text: string }) {
  const key = process.env.BREVO_API_KEY
  const sender = process.env.BREVO_SENDER_EMAIL
  if (!key || !sender) return { configured: false as const }
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: sender, name: process.env.BREVO_SENDER_NAME || "WOLOYEM Score" },
      to: [{ email: input.to }],
      subject: input.subject,
      textContent: input.text,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    const failure = await providerFailure(response, sender)
    return { configured: true as const, ok: false as const, failure: failure.text, status: failure.status, code: failure.code }
  }
  const body = await response.json() as { messageId?: string }
  return { configured: true as const, ok: true as const, messageId: body.messageId ?? null }
}

async function providerFailure(response: Response, sender: string) {
  let code = ""
  let message = ""
  try {
    const body = await response.json() as { code?: unknown; message?: unknown }
    if (typeof body.code === "string") code = body.code
    if (typeof body.message === "string") message = body.message
  } catch {
    code = ""
  }
  const requestId = response.headers.get("x-sib-request-id") || response.headers.get("sib-request-id") || response.headers.get("x-request-id") || ""
  return {
    status: response.status,
    code: /^[a-z0-9_]{1,40}$/i.test(code) ? code : "unknown",
    text: safeProviderFailure({ status: response.status, code, message, requestId, sender }),
  }
}
