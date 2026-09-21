export type RangeKey = "today" | "7d" | "30d" | "90d" | "custom"

export type ResolvedRange = {
  key: RangeKey
  from: Date
  to: Date
  fromInput: string
  toInput: string
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function parseDay(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function resolveRange(params: {
  range?: string
  from?: string
  to?: string
}): ResolvedRange {
  const now = new Date()
  const key: RangeKey =
    params.range === "today" ||
    params.range === "7d" ||
    params.range === "90d" ||
    params.range === "custom"
      ? params.range
      : "30d"

  if (key === "custom") {
    const from = parseDay(params.from)
    const to = parseDay(params.to)
    if (from && to && from <= to) {
      const exclusive = new Date(to)
      exclusive.setUTCDate(exclusive.getUTCDate() + 1)
      return {
        key,
        from,
        to: exclusive,
        fromInput: dateKey(from),
        toInput: dateKey(to),
      }
    }
  }

  if (key === "today") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    return { key, from, to: now, fromInput: dateKey(from), toInput: dateKey(now) }
  }

  const days = key === "7d" ? 7 : key === "90d" ? 90 : 30
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  return {
    key: key === "custom" ? "30d" : key,
    from,
    to: now,
    fromInput: dateKey(from),
    toInput: dateKey(now),
  }
}

export function fillDailyCounts(
  from: Date,
  to: Date,
  rows: { date: string; count: number }[],
) {
  const map = new Map(rows.map((row) => [row.date, row.count]))
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()))
  const series: { date: string; count: number }[] = []

  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10)
    series.push({ date, count: map.get(date) ?? 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return series
}
