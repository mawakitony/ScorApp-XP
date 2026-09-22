import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export async function matchConversionTarget(
  organizationId: string,
  input: { leadId?: string | null; sessionId?: string | null; email?: string | null },
) {
  const admin = createAdminClient()
  if (input.leadId) {
    const { data } = await admin.from("leads").select("id, scorecard_id, session_id, organization_id").eq("id", input.leadId).maybeSingle()
    if (!data || data.organization_id !== organizationId) return null
    return { leadId: data.id, scorecardId: data.scorecard_id, sessionId: data.session_id }
  }
  if (input.sessionId) {
    const { data: session } = await admin.from("assessment_sessions").select("id, scorecard_id").eq("id", input.sessionId).maybeSingle()
    if (!session) return null
    const { data: scorecard } = await admin.from("scorecards").select("organization_id").eq("id", session.scorecard_id).maybeSingle()
    if (!scorecard || scorecard.organization_id !== organizationId) return null
    const { data: lead } = await admin.from("leads").select("id").eq("session_id", session.id).eq("organization_id", organizationId).maybeSingle()
    return { leadId: lead?.id ?? null, scorecardId: session.scorecard_id, sessionId: session.id }
  }
  if (input.email) {
    const { data: person } = await admin.from("respondents").select("id").eq("organization_id", organizationId).ilike("email", input.email).limit(1).maybeSingle()
    if (!person) return null
    const { data: lead } = await admin.from("leads").select("id, scorecard_id, session_id").eq("organization_id", organizationId).eq("respondent_id", person.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
    if (!lead) return null
    return { leadId: lead.id, scorecardId: lead.scorecard_id, sessionId: lead.session_id }
  }
  return { leadId: null, scorecardId: null, sessionId: null }
}
