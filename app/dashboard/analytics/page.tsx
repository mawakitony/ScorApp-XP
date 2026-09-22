import { Suspense } from "react"
import { ConversionSummary } from "@/components/analytics/conversions"
import { AnalyticsReport } from "@/components/analytics/report"
import { PeriodFilter } from "@/components/dashboard/period-filter"
import { resolveRange } from "@/lib/analytics/range"
import { getConversionAnalytics } from "@/lib/data/conversions"
import { getReportMetrics } from "@/lib/data/reports"
import { getCommercialAnalytics } from "@/lib/data/crm"

export const metadata = { title: "Analytics" }

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>
}) {
  const range = resolveRange(await searchParams)
  const [commercial, conversions, reports] = await Promise.all([getCommercialAnalytics(range), getConversionAnalytics(range), getReportMetrics(range)])

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
        <>
          <AnalyticsReport data={commercial.data} />
          <ConversionSummary
            ctaClicks={commercial.data.current.cta_clicks}
            leads={commercial.data.current.captured}
            conversions={conversions.conversions}
            values={conversions.values}
            byScorecard={conversions.byScorecard}
            byCampaign={conversions.byCampaign}
          />
          <section className="rounded-3xl border bg-card p-6">
            <h2 className="font-display text-2xl">Rapports</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-4 text-sm">
              <div><dt className="text-muted-foreground">Générés</dt><dd className="font-display text-3xl">{reports.reports_generated}</dd></div>
              <div><dt className="text-muted-foreground">Téléchargés</dt><dd className="font-display text-3xl">{reports.reports_downloaded}</dd></div>
              <div><dt className="text-muted-foreground">Partagés</dt><dd className="font-display text-3xl">{reports.reports_shared}</dd></div>
              <div><dt className="text-muted-foreground">Emails</dt><dd className="font-display text-3xl">{reports.report_email_sent}</dd></div>
            </dl>
          </section>
        </>
      )}
    </div>
  )
}
