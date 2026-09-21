import { Suspense } from "react"
import Link from "next/link"
import { BarChart3, CheckCircle2, Flame, MousePointerClick, Timer, UserPlus, Users } from "lucide-react"
import { deltaLabel } from "@/components/analytics/report"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { OverviewCharts } from "@/components/dashboard/overview-charts"
import { PeriodFilter } from "@/components/dashboard/period-filter"
import { resolveRange } from "@/lib/analytics/range"
import { getCommercialAnalytics } from "@/lib/data/crm"
import { getOverview } from "@/lib/data/overview"
import { countryName } from "@/lib/geo/countries"
import { formatDate, formatNumber, formatPercent } from "@/lib/format"
import { conversionRate, ctaClickRate } from "@/lib/leads/metrics"

export const metadata = { title: "Dashboard" }

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>
}) {
  const params = await searchParams
  const range = resolveRange(params)
  const [overview, commercial] = await Promise.all([getOverview(range), getCommercialAnalytics(range)])

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Vue d&apos;ensemble</p>
          <h1 className="font-display text-4xl tracking-tight">Dashboard</h1>
        </div>
        <Suspense fallback={null}>
          <PeriodFilter range={range.key} from={range.fromInput} to={range.toInput} />
        </Suspense>
      </div>

      {"error" in commercial ? (
        <p className="rounded-2xl border bg-card px-5 py-4 text-sm">{commercial.error}</p>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Total Leads" value={formatNumber(commercial.data.current.leads)} hint={deltaLabel(commercial.data.current.leads, commercial.data.previous.leads)} icon={Users} />
            <KpiCard label="New Leads" value={formatNumber(commercial.data.current.new_leads)} hint={deltaLabel(commercial.data.current.new_leads, commercial.data.previous.new_leads)} icon={UserPlus} />
            <KpiCard label="Completed Assessments" value={formatNumber(commercial.data.current.completed)} hint={deltaLabel(commercial.data.current.completed, commercial.data.previous.completed)} icon={CheckCircle2} />
            <KpiCard label="Conversion Rate" value={formatPercent(conversionRate(commercial.data.current.cta_clicks, commercial.data.current.completed))} hint="Clics CTA / évaluations terminées" icon={BarChart3} />
            <KpiCard label="Average Score" value={formatPercent(commercial.data.current.average_score)} hint="Score d'évaluation moyen" icon={Timer} />
            <KpiCard label="Hot Leads" value={formatNumber(commercial.data.current.hot_leads)} hint={deltaLabel(commercial.data.current.hot_leads, commercial.data.previous.hot_leads)} icon={Flame} />
            <KpiCard label="CTA Click Rate" value={formatPercent(ctaClickRate(commercial.data.current.cta_clicks, commercial.data.current.viewed))} hint="Clics CTA / résultats vus" icon={MousePointerClick} />
          </section>
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="font-medium">Recent Hot Leads</h2>
            {commercial.data.hot_leads.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Aucun lead chaud sur la période.</p> : (
              <ul className="mt-4 divide-y text-sm">
                {commercial.data.hot_leads.map((lead) => (
                  <li key={lead.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <Link className="underline" href={`/dashboard/leads/${lead.id}`}>{lead.name}</Link>
                    <span>{lead.score === null ? "—" : formatPercent(lead.score)}</span>
                    <span>{lead.scorecard || "—"}</span>
                    <span>{lead.country ? countryName(lead.country) : "—"}</span>
                    <span>{lead.cta_clicked ? "CTA" : "—"}</span>
                    <span className="text-muted-foreground">{formatDate(lead.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {"error" in overview ? (
        <p className="rounded-2xl border bg-card px-5 py-4 text-sm">{overview.error}</p>
      ) : (
        <OverviewCharts data={overview.data} />
      )}
    </div>
  )
}
