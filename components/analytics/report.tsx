import Link from "next/link"
import { countryName } from "@/lib/geo/countries"
import { conversionRate, ctaClickRate, fillScoreBuckets, funnelRates, periodDelta, resultShares, share } from "@/lib/leads/metrics"
import { formatNumber, formatPercent } from "@/lib/format"

type Report = {
  current: { page_views: number; started: number; captured: number; completed: number; viewed: number; cta_clicks: number }
  score_buckets: { label: string; count: number }[]
  result_distribution: { label: string; count: number }[]
  countries: { country: string; leads: number; completions: number; average_score: number | null; cta_clicks: number }[]
  sources: Channel[]
  campaigns: Channel[]
  mediums: Channel[]
  scorecards: { id: string; name: string; views: number; starts: number; leads: number; completed: number; average_score: number | null; cta_clicks: number }[]
  cta_ranges: { label: string; count: number }[]
  cta_destinations: { url: string; count: number }[]
  completion: { median_seconds: number | null; average_seconds: number | null; sample: number }
}

type Channel = { name: string; sessions: number; leads: number; completions: number; cta_clicks: number }

const funnelLabels = ["Landing views", "Assessment starts", "Lead submitted", "Assessment completed", "Result viewed", "CTA clicked"]

export function AnalyticsReport({ data }: { data: Report }) {
  const steps = [data.current.page_views, data.current.started, data.current.captured, data.current.completed, data.current.viewed, data.current.cta_clicks]
  const rates = funnelRates(steps)
  const buckets = fillScoreBuckets(data.score_buckets)
  const bucketTotal = buckets.reduce((sum, bucket) => sum + bucket.count, 0)
  const results = resultShares(data.result_distribution)
  const maxBucket = Math.max(...buckets.map((bucket) => bucket.count), 1)

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-display text-2xl">Funnel</h2>
        <ol className="mt-4 max-w-xl space-y-3">
          {rates.map((step, index) => (
            <li key={funnelLabels[index]} className="rounded-2xl border bg-card px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <span>{funnelLabels[index]}</span>
                <span className="font-display text-2xl">{formatNumber(step.count)}</span>
              </div>
              {step.rate !== null ? <p className="text-sm text-muted-foreground">{formatPercent(step.rate)} de l&apos;étape précédente</p> : null}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-muted-foreground">
          Temps de complétion médian {duration(data.completion.median_seconds)} · moyenne {duration(data.completion.average_seconds)}.
          Les sessions de plus de 24 heures sont exclues ({formatNumber(data.completion.sample)} sessions retenues).
        </p>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border bg-card p-5">
          <h2 className="font-medium">Score distribution</h2>
          <ul className="mt-4 space-y-3">
            {buckets.map((bucket) => (
              <li key={bucket.label}>
                <div className="flex justify-between text-sm"><span>{bucket.label}</span><span>{formatNumber(bucket.count)}</span></div>
                <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(bucket.count / maxBucket) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">{formatNumber(bucketTotal)} résultats</p>
        </article>
        <article className="rounded-2xl border bg-card p-5">
          <h2 className="font-medium">Result distribution</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {results.length === 0 ? <li className="text-muted-foreground">Aucun résultat sur la période.</li> : null}
            {results.map((row) => (
              <li key={row.label} className="flex justify-between gap-3"><span>{row.label}</span><span>{formatPercent(row.percent)}</span></li>
            ))}
          </ul>
        </article>
      </section>
      <DataTable
        title="Top countries"
        columns={["Pays", "Leads", "Completions", "Score moyen", "CTA"]}
        rows={data.countries.map((row) => [countryLabel(row.country), formatNumber(row.leads), formatNumber(row.completions), formatPercent(row.average_score), formatNumber(row.cta_clicks)])}
      />
      <ChannelTable title="Top sources" rows={data.sources} />
      <ChannelTable title="Top campaigns" rows={data.campaigns} />
      <ChannelTable title="Top mediums" rows={data.mediums} />
      <section className="overflow-x-auto rounded-2xl border">
        <h2 className="px-5 pt-5 font-medium">Scorecards</h2>
        <table className="mt-3 w-full min-w-[760px] text-left text-sm">
          <thead className="text-muted-foreground"><tr>{["Scorecard", "Views", "Starts", "Leads", "Completed", "Conversion", "Avg Score", "CTA"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
          <tbody>
            {data.scorecards.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-4 py-3"><Link className="underline" href={`/dashboard/scorecards/${row.id}/analytics`}>{row.name}</Link></td>
                <td className="px-4 py-3">{formatNumber(row.views)}</td>
                <td className="px-4 py-3">{formatNumber(row.starts)}</td>
                <td className="px-4 py-3">{formatNumber(row.leads)}</td>
                <td className="px-4 py-3">{formatNumber(row.completed)}</td>
                <td className="px-4 py-3">{formatPercent(conversionRate(row.cta_clicks, row.completed))}</td>
                <td className="px-4 py-3">{formatPercent(row.average_score)}</td>
                <td className="px-4 py-3">{formatNumber(row.cta_clicks)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border bg-card p-5 text-sm">
          <h2 className="font-medium">CTA</h2>
          <p className="mt-3 font-display text-3xl">{formatNumber(data.current.cta_clicks)}</p>
          <p className="text-muted-foreground">CTR {formatPercent(ctaClickRate(data.current.cta_clicks, data.current.viewed))}</p>
        </article>
        <List title="Par résultat" rows={data.cta_ranges.map((row) => `${row.label} · ${formatNumber(row.count)} · ${formatPercent(share(row.count, data.current.cta_clicks))}`)} />
        <List title="Destinations" rows={data.cta_destinations.map((row) => `${row.url} · ${formatNumber(row.count)}`)} />
      </section>
    </div>
  )
}

export function deltaLabel(current: number, previous: number) {
  const delta = periodDelta(current, previous)
  if (delta === null) return "Nouvelle activité sur la période"
  const sign = delta > 0 ? "+" : ""
  return `${sign}${formatPercent(delta)} vs période précédente`
}

function countryLabel(code: string) {
  if (code === "—") return code
  try { return countryName(code) } catch { return code }
}

function duration(seconds: number | null) {
  if (seconds === null) return "—"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

function ChannelTable({ title, rows }: { title: string; rows: Report["sources"] }) {
  return (
    <DataTable
      title={title}
      columns={["Nom", "Sessions", "Leads", "Completions", "Conversion", "CTA"]}
      rows={rows.map((row) => [row.name, formatNumber(row.sessions), formatNumber(row.leads), formatNumber(row.completions), formatPercent(row.sessions > 0 ? (row.cta_clicks / row.sessions) * 100 : 0), formatNumber(row.cta_clicks)])}
    />
  )
}

function DataTable({ title, columns, rows }: { title: string; columns: string[]; rows: string[][] }) {
  return (
    <section className="overflow-x-auto rounded-2xl border">
      <h2 className="px-5 pt-5 font-medium">{title}</h2>
      {rows.length === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground">Aucune donnée sur la période.</p> : (
        <table className="mt-3 w-full min-w-[640px] text-left text-sm">
          <thead className="text-muted-foreground"><tr>{columns.map((column) => <th key={column} className="px-4 py-3 font-medium">{column}</th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.join("|")} className="border-t">{row.map((cell) => <td key={cell} className="px-4 py-3">{cell}</td>)}</tr>)}</tbody>
        </table>
      )}
    </section>
  )
}

function List({ title, rows }: { title: string; rows: string[] }) {
  return (
    <article className="rounded-2xl border bg-card p-5 text-sm">
      <h2 className="font-medium">{title}</h2>
      <ul className="mt-3 space-y-2">{rows.length === 0 ? <li className="text-muted-foreground">—</li> : rows.map((row) => <li key={row}>{row}</li>)}</ul>
    </article>
  )
}
