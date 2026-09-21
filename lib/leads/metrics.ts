import { round1 } from "@/lib/leads/qualification"

export const SCORE_BUCKETS = [
  { label: "0–20", min: 0, max: 20 },
  { label: "21–40", min: 21, max: 40 },
  { label: "41–60", min: 41, max: 60 },
  { label: "61–80", min: 61, max: 80 },
  { label: "81–100", min: 81, max: 100 },
] as const

export function scoreBucket(percent: number) {
  return SCORE_BUCKETS.find((bucket) => percent >= bucket.min && percent <= bucket.max)?.label ?? SCORE_BUCKETS[0].label
}

export function fillScoreBuckets(rows: { label: string; count: number }[]) {
  const counts = new Map(rows.map((row) => [row.label, row.count]))
  return SCORE_BUCKETS.map((bucket) => ({ label: bucket.label, count: counts.get(bucket.label) ?? 0 }))
}

export function share(count: number, total: number) {
  if (total <= 0) return 0
  return round1((count / total) * 100)
}

export function resultShares(rows: { label: string; count: number }[]) {
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  return rows.map((row) => ({ ...row, percent: share(row.count, total) }))
}

export function funnelRates(steps: number[]) {
  return steps.map((count, index) => {
    const previous = steps[index - 1]
    return {
      count,
      rate: index === 0 || previous === undefined || previous <= 0 ? null : round1((count / previous) * 100),
    }
  })
}

export function conversionRate(ctaClicks: number, completed: number) {
  if (completed <= 0) return 0
  return round1((ctaClicks / completed) * 100)
}

export function ctaClickRate(ctaClicks: number, resultViews: number) {
  if (resultViews <= 0) return 0
  return round1((ctaClicks / resultViews) * 100)
}

export function periodDelta(current: number, previous: number) {
  if (previous <= 0) return current <= 0 ? 0 : null
  return round1(((current - previous) / previous) * 100)
}

export function aggregateCountries(
  rows: { country: string; leads: number; completions: number; score: number | null; ctaClicks: number }[],
) {
  const grouped = new Map<string, { leads: number; completions: number; scoreSum: number; scoreCount: number; ctaClicks: number }>()
  for (const row of rows) {
    const key = row.country.trim().toUpperCase() || "—"
    const current = grouped.get(key) ?? { leads: 0, completions: 0, scoreSum: 0, scoreCount: 0, ctaClicks: 0 }
    current.leads += row.leads
    current.completions += row.completions
    current.ctaClicks += row.ctaClicks
    if (row.score !== null) {
      current.scoreSum += row.score * row.leads
      current.scoreCount += row.leads
    }
    grouped.set(key, current)
  }
  return [...grouped.entries()]
    .map(([country, value]) => ({
      country,
      leads: value.leads,
      completions: value.completions,
      averageScore: value.scoreCount > 0 ? round1(value.scoreSum / value.scoreCount) : null,
      ctaClicks: value.ctaClicks,
    }))
    .sort((a, b) => b.leads - a.leads || a.country.localeCompare(b.country))
}

export function dropOff(started: number, questions: { title: string; answered: number }[]) {
  const steps = questions.map((question) => ({
    title: question.title,
    percent: started <= 0 ? 0 : round1((question.answered / started) * 100),
  }))
  let highest: { from: string; to: string; drop: number } | null = null
  for (let index = 1; index < steps.length; index += 1) {
    const previous = steps[index - 1]
    const current = steps[index]
    if (!previous || !current) continue
    const drop = round1(previous.percent - current.percent)
    if (!highest || drop > highest.drop) highest = { from: previous.title, to: current.title, drop }
  }
  return { steps, highest }
}

export function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const left = sorted[middle - 1]
  const right = sorted[middle]
  if (sorted.length % 2 === 1) return right ?? null
  if (left === undefined || right === undefined) return null
  return round1((left + right) / 2)
}

export function acceptedDurations(seconds: number[]) {
  return seconds.filter((value) => value >= 0 && value <= 24 * 60 * 60)
}

export function previousWindow(from: Date, to: Date) {
  const duration = Math.max(to.getTime() - from.getTime(), 0)
  return { from: new Date(from.getTime() - duration), to: from }
}
