"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { EmptyState } from "@/components/dashboard/empty-state"
import { formatChartDate, formatNumber } from "@/lib/format"
import type { Overview } from "@/lib/validators/scorecard"

const colors = ["#16324F", "#C4A15A", "#2F6F73", "#8C4A3A", "#6D7C59"]

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="mt-4 h-64 min-w-0 overflow-hidden">{children}</div>
    </section>
  )
}

export function OverviewCharts({ data }: { data: Overview }) {
  const leads = data.leads_by_day.map((row) => ({
    ...row,
    label: formatChartDate(row.date),
  }))
  const completion = data.completion_by_day.map((row) => ({
    ...row,
    label: formatChartDate(row.date),
    rate: row.started === 0 ? 0 : Math.round((row.completed / row.started) * 1000) / 10,
  }))
  const scores = data.score_by_day.map((row) => ({
    ...row,
    label: formatChartDate(row.date),
  }))
  const hasLeads = data.leads_by_day.some((row) => row.count > 0)
  const hasCompletion = data.completion_by_day.length > 0
  const hasScores = data.score_by_day.length > 0

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <ChartCard title="Leads par jour">
        {hasLeads ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={leads}>
              <CartesianGrid vertical={false} stroke="#E3DACB" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#5E6D7E" />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#5E6D7E" />
              <Tooltip />
              <Bar dataKey="count" name="Leads" fill="#16324F" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="Pas encore de leads" description="Les leads apparaîtront ici dès les premières évaluations." />
        )}
      </ChartCard>

      <ChartCard title="Taux de complétion">
        {hasCompletion ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={completion}>
              <CartesianGrid vertical={false} stroke="#E3DACB" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#5E6D7E" />
              <YAxis tick={{ fontSize: 12 }} stroke="#5E6D7E" />
              <Tooltip />
              <Line type="monotone" dataKey="started" name="Démarrées" stroke="#16324F" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="completed" name="Terminées" stroke="#C4A15A" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="Aucune session" description="Le taux de complétion se calcule quand des évaluations démarrent." />
        )}
      </ChartCard>

      <ChartCard title="Score moyen">
        {hasScores ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={scores}>
              <CartesianGrid vertical={false} stroke="#E3DACB" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#5E6D7E" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#5E6D7E" />
              <Tooltip />
              <Line type="monotone" dataKey="average" name="Score %" stroke="#2F6F73" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="Aucun score" description="Le score moyen s'affichera après les premières évaluations terminées." />
        )}
      </ChartCard>

      <ChartCard title="Répartition des résultats">
        {data.result_distribution.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data.result_distribution} dataKey="count" nameKey="label" innerRadius={55} outerRadius={85}>
                {data.result_distribution.map((entry, index) => (
                  <Cell key={entry.label} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="Pas de répartition" description="Les statuts de résultat apparaîtront selon les seuils de chaque scorecard." />
        )}
      </ChartCard>

      <ChartCard title="Top scorecards">
        {data.top_scorecards.length > 0 ? (
          <ul className="space-y-3">
            {data.top_scorecards.map((scorecard) => (
              <li key={scorecard.id} className="flex min-w-0 items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{scorecard.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {formatNumber(scorecard.leads)} leads · {formatNumber(scorecard.completed)} résultats
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Aucune scorecard" description="Créez une première scorecard pour suivre ses performances." />
        )}
      </ChartCard>

      <ChartCard title="Sources des leads">
        {data.sources.length > 0 ? (
          <ul className="space-y-3">
            {data.sources.map((source) => (
              <li key={source.source} className="flex items-center justify-between text-sm">
                <span className="capitalize">{source.source}</span>
                <span className="text-muted-foreground">{formatNumber(source.count)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Sources à venir"
            description="Les paramètres UTM et le referrer seront enregistrés avec chaque lead."
          />
        )}
      </ChartCard>
    </div>
  )
}
