import { Suspense } from "react"
import { AnalyticsReport } from "@/components/analytics/report"
import { PeriodFilter } from "@/components/dashboard/period-filter"
import { resolveRange } from "@/lib/analytics/range"
import { getCommercialAnalytics } from "@/lib/data/crm"

export const metadata = { title: "Analytics" }

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>
}) {
  const range = resolveRange(await searchParams)
  const commercial = await getCommercialAnalytics(range)

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Performance</p>
          <h1 className="font-display text-4xl">Analytics</h1>
        </div>
        <Suspense fallback={null}>
          <PeriodFilter range={range.key} from={range.fromInput} to={range.toInput} />
        </Suspense>
      </div>
      {"error" in commercial ? (
        <p className="rounded-2xl border bg-card px-5 py-4 text-sm">{commercial.error}</p>
      ) : (
        <AnalyticsReport data={commercial.data} />
      )}
    </div>
  )
}
