import "server-only"

import { publicAccess, type PublicAccess } from "@/lib/assessment/access"
import { isServiceRoleConfigured } from "@/lib/env"
import { getMembership } from "@/lib/data/membership"
import { getVisibleScorecard, type PublicScorecard } from "@/lib/data/scorecards"
import { createAdminClient } from "@/lib/supabase/admin"
import type { ScorecardPage } from "@/types/database"

export type PublicEntry = {
  scorecard: PublicScorecard
  access: PublicAccess
}

export async function getPublicEntry(slug: string, preview: boolean): Promise<PublicEntry | null> {
  const membership = await getMembership()

  if (!isServiceRoleConfigured()) {
    const scorecard = await getVisibleScorecard(slug, preview)
    if (!scorecard) return null
    const member = membership?.organization.id === scorecard.organization_id
    return { scorecard, access: publicAccess(scorecard.status, preview, member) }
  }

  const admin = createAdminClient()
  const { data } = await admin.from("scorecards").select("*").eq("slug", slug).maybeSingle()
  if (!data) return null
  const member = membership?.organization.id === data.organization_id
  const access = publicAccess(data.status, preview, member)
  if (access === "hidden") return null

  const { data: page } = await admin.from("scorecard_pages").select("*").eq("scorecard_id", data.id).maybeSingle()
  const { count } = await admin.from("questions").select("id", { count: "exact", head: true }).eq("scorecard_id", data.id)

  return {
    access,
    scorecard: {
      ...data,
      page: page as ScorecardPage | null,
      questionCount: count ?? 0,
    },
  }
}
