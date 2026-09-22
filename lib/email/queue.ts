import "server-only"

import { createHash } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import type { EmailTemplate } from "@/lib/email/templates"
import type { Json } from "@/types/database"

export function recipientHash(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex")
}

export async function enqueueEmail(input: {
  organizationId: string
  template: EmailTemplate
  recipient: string
  locale: string
  idempotencyKey: string
  payload: Record<string, string>
}) {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from("email_jobs").insert({
      organization_id: input.organizationId,
      template: input.template,
      recipient: input.recipient.trim().toLowerCase(),
      recipient_hash: recipientHash(input.recipient),
      locale: input.locale === "en" ? "en" : "fr",
      idempotency_key: input.idempotencyKey,
      payload: input.payload as Json,
    })
    if (error && !/duplicate|unique/i.test(error.message)) return { queued: false as const }
    return { queued: true as const }
  } catch {
    return { queued: false as const }
  }
}
