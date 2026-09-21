import "server-only"

import { previousWindow } from "@/lib/leads/metrics"
import { CSV_EXPORT_LIMIT } from "@/lib/leads/qualification"
import { analyticsSchema, leadListSchema, questionStatsSchema } from "@/lib/leads/schema"
import type { LeadFilters } from "@/lib/leads/filters"
import type { ResolvedRange } from "@/lib/analytics/range"
import { ensureMembership } from "@/lib/data/membership"
import { createClient } from "@/lib/supabase/server"

function dayBound(day: string, end: boolean) {
  const date = new Date(`${day}T00:00:00.000Z`)
  if (end) date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString()
}

export async function queryLeads(filters: LeadFilters, exportAll = false) {
  const membership = await ensureMembership()
  if (!membership) return { error: "Accès refusé." as const, rows: [], total: 0 }
  const supabase = await createClient()
  const limit = exportAll ? CSV_EXPORT_LIMIT : filters.size
  const offset = exportAll ? 0 : (filters.page - 1) * filters.size
  const { data, error } = await supabase.rpc("list_org_leads", {
    p_query: filters.query || null,
    p_scorecard: filters.scorecardId,
    p_status: filters.status,
    p_temperature: filters.temperature,
    p_country: filters.country,
    p_tag: filters.tagId,
    p_range: filters.resultRangeId,
    p_score_min: filters.scoreMin,
    p_score_max: filters.scoreMax,
    p_from: filters.from ? dayBound(filters.from, false) : null,
    p_to: filters.to ? dayBound(filters.to, true) : null,
    p_utm_source: filters.utmSource,
    p_utm_campaign: filters.utmCampaign,
    p_cta: filters.cta,
    p_sort: filters.sort,
    p_limit: limit,
    p_offset: offset,
    p_ids: filters.ids.length > 0 ? filters.ids : null,
  })
  if (error) return { error: "Les leads n'ont pas pu être chargés." as const, rows: [], total: 0 }
  const parsed = leadListSchema.safeParse(data)
  if (!parsed.success) return { error: "Le format des leads est inattendu." as const, rows: [], total: 0 }
  return { error: null, rows: parsed.data.rows, total: parsed.data.total, truncated: exportAll && parsed.data.total > CSV_EXPORT_LIMIT }
}

export async function getCommercialAnalytics(range: ResolvedRange, scorecardId?: string) {
  const membership = await ensureMembership()
  if (!membership) return { error: "Accès refusé." as const }
  const previous = previousWindow(range.from, range.to)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("analytics_overview", {
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
    p_prev_from: previous.from.toISOString(),
    p_prev_to: previous.to.toISOString(),
    p_scorecard: scorecardId ?? null,
  })
  if (error) return { error: "Les indicateurs n'ont pas pu être chargés. Vérifiez que la migration CRM est appliquée." as const }
  const parsed = analyticsSchema.safeParse(data)
  if (!parsed.success) return { error: "Le format des indicateurs est inattendu." as const }
  return { data: parsed.data }
}

export async function getQuestionStats(scorecardId: string, range: ResolvedRange) {
  const membership = await ensureMembership()
  if (!membership) return { error: "Accès refusé." as const }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("scorecard_question_stats", {
    p_scorecard: scorecardId,
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
  })
  if (error) return { error: "Les questions n'ont pas pu être analysées." as const }
  const parsed = questionStatsSchema.safeParse(data)
  if (!parsed.success) return { error: "Le format des questions est inattendu." as const }
  return { data: parsed.data }
}

export async function loadLeadFacets() {
  const membership = await ensureMembership()
  if (!membership) return { tags: [], ranges: [], countries: [] as string[], sources: [] as string[], campaigns: [] as string[] }
  const supabase = await createClient()
  const [tags, ranges, people, utm] = await Promise.all([
    supabase.from("lead_tags").select("id, name, color").eq("organization_id", membership.organization.id).order("name"),
    supabase.from("result_ranges").select("id, label").order("label"),
    supabase.from("respondents").select("country").eq("organization_id", membership.organization.id).limit(2000),
    supabase.from("utm_tracking").select("utm_source, utm_campaign").limit(2000),
  ])
  const countries = [...new Set((people.data ?? []).map((row) => row.country?.toUpperCase() ?? "").filter(Boolean))].sort()
  const sources = [...new Set((utm.data ?? []).map((row) => row.utm_source?.trim() ?? "").filter(Boolean))].sort()
  const campaigns = [...new Set((utm.data ?? []).map((row) => row.utm_campaign?.trim() ?? "").filter(Boolean))].sort()
  return { tags: tags.data ?? [], ranges: ranges.data ?? [], countries, sources, campaigns }
}
