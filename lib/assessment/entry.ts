import "server-only"

import { headers } from "next/headers"
import { publicAccess, type PublicAccess } from "@/lib/assessment/access"
import { readPublishedDocument } from "@/lib/assessment/public-release"
import { isPlatformHost, normalizeDomain } from "@/lib/billing/domains"
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
  const organizationId = await publicOrganizationId()
  let query = admin.from("scorecards").select("*").eq("slug", slug)
  if (organizationId) query = query.eq("organization_id", organizationId)
  const { data: rows } = await query.limit(2)
  if (!rows || rows.length !== 1) return null
  const data = rows[0]
  const member = membership?.organization.id === data.organization_id
  const access = publicAccess(data.status, preview, member)
  if (access === "hidden") return null

  const { data: page } = await admin.from("scorecard_pages").select("*").eq("scorecard_id", data.id).maybeSingle()
  const release = await readPublishedDocument(admin, data.id)
  const { data: questionRows } = await admin.from("questions").select("archived_at").eq("scorecard_id", data.id)
  const liveCount = (questionRows ?? []).filter((row) => !row.archived_at).length
  const publishedPage = release?.page
  const publicPage = page && publishedPage
    ? { ...page, title: publishedPage.title, subtitle: publishedPage.subtitle, description: publishedPage.description, cta_text: publishedPage.ctaLabel }
    : page

  return {
    access,
    scorecard: {
      ...data,
      page: publicPage as ScorecardPage | null,
      questionCount: release ? release.questions.length : liveCount,
    },
  }
}

export async function publicOrganizationId() {
  const host = (await headers()).get("host") ?? ""
  if (isPlatformHost(host)) return null
  const domain = normalizeDomain(host.split(":")[0] ?? "")
  if (!domain || !isServiceRoleConfigured()) return null
  const admin = createAdminClient()
  const { data } = await admin.from("custom_domains").select("organization_id").eq("domain", domain).eq("status", "verified").maybeSingle()
  return data?.organization_id ?? null
}
