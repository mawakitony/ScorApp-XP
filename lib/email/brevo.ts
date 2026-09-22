import "server-only"

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
  if (!response.ok) return { configured: true as const, ok: false as const }
  const body = await response.json() as { messageId?: string }
  return { configured: true as const, ok: true as const, messageId: body.messageId ?? null }
}
