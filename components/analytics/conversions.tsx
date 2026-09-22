import { formatNumber, formatPercent } from "@/lib/format"

export function ConversionSummary({
  ctaClicks,
  leads,
  conversions,
  values,
  byScorecard,
  byCampaign,
}: {
  ctaClicks: number
  leads: number
  conversions: number
  values: { currency: string; total: number }[]
  byScorecard: { name: string; currency: string; total: number }[]
  byCampaign: { name: string; currency: string; total: number }[]
}) {
  const rate = leads > 0 ? (conversions / leads) * 100 : 0
  return (
    <section className="rounded-3xl border bg-card p-6">
      <h2 className="font-display text-2xl">Conversions réelles</h2>
      <p className="mt-1 text-sm text-muted-foreground">Distinctes des clics CTA. Les devises ne sont pas converties.</p>
      <dl className="mt-4 grid gap-4 sm:grid-cols-4">
        <div><dt className="text-sm text-muted-foreground">Clics CTA</dt><dd className="font-display text-3xl">{formatNumber(ctaClicks)}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Leads convertis</dt><dd className="font-display text-3xl">{formatNumber(conversions)}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Taux réel</dt><dd className="font-display text-3xl">{formatPercent(rate)}</dd></div>
        <div>
          <dt className="text-sm text-muted-foreground">Valeur</dt>
          <dd className="font-display text-2xl">{values.length === 0 ? "—" : values.map((row) => `${formatNumber(row.total)} ${row.currency}${leads > 0 ? ` (${formatNumber(Math.round(row.total / leads))} / lead)` : ""}`).join(" · ")}</dd>
        </div>
      </dl>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ValueList title="Par scorecard" rows={byScorecard} />
        <ValueList title="Par campagne" rows={byCampaign} />
      </div>
    </section>
  )
}

function ValueList({ title, rows }: { title: string; rows: { name: string; currency: string; total: number }[] }) {
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      {rows.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Aucune valeur.</p> : (
        <ul className="mt-2 space-y-1 text-sm">
          {rows.map((row) => (
            <li key={`${row.name}-${row.currency}`} className="flex justify-between gap-3">
              <span>{row.name}</span>
              <span>{formatNumber(row.total)} {row.currency}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
