import { Suspense } from "react"
import { notFound } from "next/navigation"
import { AnalyticsReport } from "@/components/analytics/report"
import { PeriodFilter } from "@/components/dashboard/period-filter"
import { resolveRange } from "@/lib/analytics/range"
import { getCommercialAnalytics, getQuestionStats } from "@/lib/data/crm"
import { ensureMembership } from "@/lib/data/membership"
import { getScorecard } from "@/lib/data/scorecards"
import { dropOff, share } from "@/lib/leads/metrics"
import { formatNumber, formatPercent } from "@/lib/format"

export const metadata = { title: "Analytics scorecard" }

const choiceTypes = new Set(["single_choice", "multiple_choice", "yes_no", "dropdown", "scale_5", "scale_10"])

export default async function ScorecardAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ range?: string; from?: string; to?: string }>
}) {
  const { id } = await params
  const membership = await ensureMembership()
  if (!membership) return null
  const scorecard = await getScorecard(membership.organization.id, id)
  if (!scorecard) notFound()
  const range = resolveRange(await searchParams)
  const [commercial, questions] = await Promise.all([
    getCommercialAnalytics(range, id),
    getQuestionStats(id, range),
  ])
  const stats = "data" in questions ? questions.data : null
  const flow = stats ? dropOff(stats.started, stats.questions.map((question) => ({ title: question.title, answered: question.answered }))) : null

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Scorecard</p>
          <h1 className="font-display text-4xl">{scorecard.name}</h1>
        </div>
        <Suspense fallback={null}>
          <PeriodFilter range={range.key} from={range.fromInput} to={range.toInput} />
        </Suspense>
      </div>
      {"error" in commercial ? <p className="rounded-2xl border px-5 py-4 text-sm">{commercial.error}</p> : <AnalyticsReport data={commercial.data} />}
      {stats && flow ? (
        <section className="space-y-4">
          <h2 className="font-display text-2xl">Questions</h2>
          {flow.highest && flow.highest.drop > 0 ? (
            <p className="rounded-2xl border bg-card px-5 py-4 text-sm">Highest drop-off : {flow.highest.from} → {flow.highest.to} ({formatPercent(flow.highest.drop)})</p>
          ) : null}
          <ol className="space-y-3">
            {flow.steps.map((step) => (
              <li key={step.title} className="text-sm">{step.title} → {formatPercent(step.percent)}</li>
            ))}
          </ol>
          {stats.questions.map((question) => (
            <article key={question.id} className="rounded-2xl border bg-card p-5">
              <h3 className="font-medium">{question.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{formatNumber(question.answered)} réponses</p>
              {choiceTypes.has(question.type) ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {question.options.map((option) => (
                    <li key={option.label} className="flex justify-between gap-3">
                      <span>{option.label}</span>
                      <span>{formatPercent(share(option.count, question.answered))}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">{"error" in questions ? questions.error : ""}</p>
      )}
    </div>
  )
}
