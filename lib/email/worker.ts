import "server-only"

import { sendBrevoEmail } from "@/lib/email/brevo"
import { nextEmailAttempt, renderEmail, type EmailTemplate } from "@/lib/email/templates"
import { recordHeartbeat } from "@/lib/platform/heartbeat"
import { log } from "@/lib/observability/logger"
import { createAdminClient } from "@/lib/supabase/admin"

export async function processEmailJobs() {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data } = await admin.from("email_jobs").select("id, template, recipient, recipient_hash, locale, payload, attempts").eq("status", "pending").lte("next_run_at", now).order("next_run_at").limit(20)
  let sent = 0
  for (const job of data ?? []) {
    const claimed = await admin.from("email_jobs").update({ status: "processing", attempts: job.attempts + 1 }).eq("id", job.id).eq("status", "pending").select("id")
    if (!claimed.data?.length) continue
    const payload = record(job.payload)
    const message = renderEmail({ template: job.template as EmailTemplate, locale: job.locale, payload })
    const result = await sendBrevoEmail({ to: job.recipient, subject: message.subject, text: message.text })
    if (result.configured && result.ok) {
      await admin.from("email_jobs").update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: result.messageId, last_error: null }).eq("id", job.id)
      log("info", "email.sent", { template: job.template, recipient_hash: job.recipient_hash })
      sent += 1
      continue
    }
    const next = nextEmailAttempt(job.attempts)
    await admin.from("email_jobs").update({
      status: next.status === "dead" ? "dead" : "pending",
      next_run_at: next.nextRunAt ?? new Date().toISOString(),
      last_error: result.configured ? "provider_failed" : "not_configured",
    }).eq("id", job.id)
    log("warn", "email.retry", { template: job.template, recipient_hash: job.recipient_hash, status: next.status })
  }
  await recordHeartbeat("email_worker")
  return { sent }
}

function record(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => typeof item === "string" ? [[key, item]] : []))
}
