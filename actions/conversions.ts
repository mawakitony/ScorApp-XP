"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { canEdit, getUser } from "@/lib/auth/session"
import { ensureMembership } from "@/lib/data/membership"
import { publishIntegrationEvent } from "@/lib/integrations/dispatch"
import { CONVERSION_TYPES } from "@/lib/integrations/version"
import { createClient } from "@/lib/supabase/server"

const schema = z.object({
  leadId: z.string().uuid(),
  conversionType: z.enum(CONVERSION_TYPES),
  value: z.string().trim().optional(),
  currency: z.string().trim().toUpperCase().optional(),
  reference: z.string().trim().max(120).optional(),
  comment: z.string().trim().max(500).optional(),
})

export async function markLeadConverted(input: {
  leadId: string
  conversionType: string
  value?: string
  currency?: string
  reference?: string
  comment?: string
}) {
  const membership = await ensureMembership()
  const user = await getUser()
  if (!membership || !user || !canEdit(membership.role)) return { error: "Permission refusée." }
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { error: "Conversion invalide." }
  const amount = parsed.data.value ? Number(parsed.data.value.replace(",", ".")) : null
  const currency = parsed.data.currency || null
  if ((amount === null) !== (currency === null) || (amount !== null && (!Number.isFinite(amount) || amount < 0)) || (currency && !/^[A-Z]{3}$/.test(currency))) {
    return { error: "Indiquez une valeur et une devise, ou aucune des deux." }
  }
  const supabase = await createClient()
  const { data: lead } = await supabase.from("leads").select("id, scorecard_id, session_id").eq("id", parsed.data.leadId).eq("organization_id", membership.organization.id).maybeSingle()
  if (!lead) return { error: "Lead introuvable." }
  const { error } = await supabase.from("conversions").insert({
    organization_id: membership.organization.id,
    lead_id: lead.id,
    scorecard_id: lead.scorecard_id,
    session_id: lead.session_id,
    conversion_type: parsed.data.conversionType,
    conversion_value: amount,
    currency,
    external_reference: parsed.data.reference || null,
    metadata: parsed.data.comment ? { comment: parsed.data.comment } : {},
  })
  if (error) return { error: error.code === "23505" ? "Cette référence existe déjà." : "Conversion non enregistrée." }
  await supabase.from("lead_activities").insert({
    organization_id: membership.organization.id,
    lead_id: lead.id,
    author_id: user.id,
    kind: "converted",
    summary: "Marqué comme converti",
  })
  await publishIntegrationEvent({
    organizationId: membership.organization.id,
    type: "lead.converted",
    leadId: lead.id,
    sessionId: lead.session_id,
    scorecardId: lead.scorecard_id,
  })
  revalidatePath(`/dashboard/leads/${lead.id}`)
  revalidatePath("/dashboard/analytics")
  return { ok: true as const }
}
