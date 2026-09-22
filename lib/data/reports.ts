import { getMembership } from "@/lib/data/membership"
import type { ResolvedRange } from "@/lib/analytics/range"
import { reportEventCounts } from "@/lib/reports/metrics"
import { createClient } from "@/lib/supabase/server"

export async function getReportMetrics(range: ResolvedRange) {
  const empty = reportEventCounts([])
  const membership = await getMembership()
  if (!membership) return empty
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("report_events")
    .select("event_type")
    .eq("organization_id", membership.organization.id)
    .gte("created_at", range.from.toISOString())
    .lt("created_at", range.to.toISOString())
  if (error || !data) return empty
  return reportEventCounts(data.map((row) => row.event_type))
}
