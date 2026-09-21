import { canEdit } from "@/lib/auth/session"
import { ensureMembership } from "@/lib/data/membership"
import { createClient } from "@/lib/supabase/server"

export async function requireScorecardEditor(scorecardId: string) {
  const membership = await ensureMembership()
  if (!membership || !canEdit(membership.role)) {
    return { error: "Vous n'avez pas la permission de modifier cette scorecard." as const }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("scorecards")
    .select("id, organization_id")
    .eq("id", scorecardId)
    .eq("organization_id", membership.organization.id)
    .maybeSingle()

  if (error || !data) return { error: "Scorecard introuvable." as const }
  return { supabase, organizationId: data.organization_id, scorecardId: data.id }
}
