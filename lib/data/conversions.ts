import { getMembership } from "@/lib/data/membership"
import { valuesByCurrency } from "@/lib/integrations/conversion"
import type { ResolvedRange } from "@/lib/analytics/range"
import { createClient } from "@/lib/supabase/server"

export async function getConversionAnalytics(range: ResolvedRange) {
  const membership = await getMembership()
  if (!membership) return { conversions: 0, values: [] as { currency: string; total: number }[], byScorecard: [] as { name: string; currency: string; total: number }[], byCampaign: [] as { name: string; currency: string; total: number }[], byCountry: [] as { name: string; count: number }[] }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("conversions")
    .select("lead_id, scorecard_id, conversion_value, currency")
    .eq("organization_id", membership.organization.id)
    .gte("converted_at", range.from.toISOString())
    .lt("converted_at", range.to.toISOString())
  if (error || !data) return { conversions: 0, values: [], byScorecard: [], byCampaign: [], byCountry: [] }

  const leadIds = [...new Set(data.flatMap((row) => (row.lead_id ? [row.lead_id] : [])))]
  const scorecardIds = [...new Set(data.flatMap((row) => (row.scorecard_id ? [row.scorecard_id] : [])))]
  const [{ data: leads }, { data: scorecards }] = await Promise.all([
    leadIds.length ? supabase.from("leads").select("id, source, session_id, respondent_id").in("id", leadIds).eq("organization_id", membership.organization.id) : Promise.resolve({ data: [] }),
    scorecardIds.length ? supabase.from("scorecards").select("id, name").in("id", scorecardIds).eq("organization_id", membership.organization.id) : Promise.resolve({ data: [] }),
  ])
  const sessionIds = (leads ?? []).flatMap((lead) => (lead.session_id ? [lead.session_id] : []))
  const respondentIds = (leads ?? []).flatMap((lead) => (lead.respondent_id ? [lead.respondent_id] : []))
  const [{ data: utm }, { data: people }] = await Promise.all([
    sessionIds.length ? supabase.from("utm_tracking").select("session_id, utm_campaign").in("session_id", sessionIds) : Promise.resolve({ data: [] }),
    respondentIds.length ? supabase.from("respondents").select("id, country").in("id", respondentIds).eq("organization_id", membership.organization.id) : Promise.resolve({ data: [] }),
  ])

  const scorecardName = new Map((scorecards ?? []).map((row) => [row.id, row.name]))
  const leadMeta = new Map((leads ?? []).map((lead) => [lead.id, lead]))
  const campaignBySession = new Map((utm ?? []).map((row) => [row.session_id, row.utm_campaign ?? "direct"]))
  const countryByPerson = new Map((people ?? []).map((row) => [row.id, row.country ?? "Inconnu"]))
  const values = valuesByCurrency(data.map((row) => ({ currency: row.currency, value: row.conversion_value === null ? null : Number(row.conversion_value) })))
  const byScorecard = group(data, (row) => scorecardName.get(row.scorecard_id ?? "") ?? "Sans scorecard")
  const byCampaign = group(data, (row) => {
    const lead = row.lead_id ? leadMeta.get(row.lead_id) : null
    return lead?.session_id ? campaignBySession.get(lead.session_id) ?? lead.source ?? "direct" : "direct"
  })
  const countries = new Map<string, number>()
  for (const row of data) {
    const lead = row.lead_id ? leadMeta.get(row.lead_id) : null
    const name = lead?.respondent_id ? countryByPerson.get(lead.respondent_id) ?? "Inconnu" : "Inconnu"
    countries.set(name, (countries.get(name) ?? 0) + 1)
  }
  return {
    conversions: data.length,
    values,
    byScorecard,
    byCampaign,
    byCountry: [...countries.entries()].map(([name, count]) => ({ name, count })),
  }
}

function group(
  rows: { lead_id: string | null; scorecard_id: string | null; conversion_value: number | null; currency: string | null }[],
  nameOf: (row: { lead_id: string | null; scorecard_id: string | null; conversion_value: number | null; currency: string | null }) => string,
) {
  const grouped = new Map<string, number>()
  for (const row of rows) {
    if (row.conversion_value === null || !row.currency) continue
    const key = `${nameOf(row)}|${row.currency.toUpperCase()}`
    grouped.set(key, (grouped.get(key) ?? 0) + Number(row.conversion_value))
  }
  return [...grouped.entries()].map(([key, total]) => {
    const [name, currency] = key.split("|")
    return { name: name ?? "—", currency: currency ?? "", total }
  })
}
