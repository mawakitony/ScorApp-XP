import { fillDailyCounts, type ResolvedRange } from "@/lib/analytics/range"
import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"
import { overviewSchema, type Overview } from "@/lib/validators/scorecard"

export async function getOverview(range: ResolvedRange): Promise<
  { data: Overview } | { error: string }
> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase n'est pas configuré." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("dashboard_overview", {
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
  })

  if (error) {
    return { error: "Les indicateurs n'ont pas pu être chargés. Vérifiez que la migration Supabase est appliquée." }
  }

  const parsed = overviewSchema.safeParse(data)
  if (!parsed.success) {
    return { error: "Le format des indicateurs est inattendu." }
  }

  return {
    data: {
      ...parsed.data,
      leads_by_day: fillDailyCounts(range.from, range.to, parsed.data.leads_by_day),
    },
  }
}
