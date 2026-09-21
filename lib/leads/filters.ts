import { isLeadStatus, LEAD_TEMPERATURES, type LeadStatus, type LeadTemperature } from "@/lib/leads/qualification"

export const PAGE_SIZES = [25, 50, 100] as const
export const LEAD_SORTS = ["newest", "oldest", "score_desc", "score_asc", "name", "country"] as const
export type LeadSort = (typeof LEAD_SORTS)[number]

export type LeadFilters = {
  query: string
  scorecardId: string | null
  status: LeadStatus | null
  temperature: LeadTemperature | null
  country: string | null
  tagId: string | null
  resultRangeId: string | null
  scoreMin: number | null
  scoreMax: number | null
  from: string | null
  to: string | null
  utmSource: string | null
  utmCampaign: string | null
  cta: "clicked" | "not_clicked" | null
  sort: LeadSort
  page: number
  size: (typeof PAGE_SIZES)[number]
  ids: string[]
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function text(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value
  const trimmed = raw?.trim() ?? ""
  return trimmed.length > 0 ? trimmed.slice(0, 120) : null
}

function numberOrNull(value: string | null) {
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.min(100, Math.max(0, parsed))
}

function day(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value
}

export function parseLeadFilters(input: Record<string, string | string[] | undefined>): LeadFilters {
  const statusRaw = text(input.status)
  const temperatureRaw = text(input.temperature)
  const sortRaw = text(input.sort)
  const sizeRaw = Number(text(input.size))
  const pageRaw = Number(text(input.page))
  const ctaRaw = text(input.cta)
  const ids = (Array.isArray(input.ids) ? input.ids.join(",") : input.ids ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => uuid.test(id))
    .slice(0, 100)
  return {
    query: text(input.q) ?? "",
    scorecardId: uuid.test(text(input.scorecard) ?? "") ? text(input.scorecard) : null,
    status: statusRaw && isLeadStatus(statusRaw) ? statusRaw : null,
    temperature: temperatureRaw && LEAD_TEMPERATURES.some((item) => item === temperatureRaw) ? (temperatureRaw as LeadTemperature) : null,
    country: text(input.country)?.toUpperCase().slice(0, 2) ?? null,
    tagId: uuid.test(text(input.tag) ?? "") ? text(input.tag) : null,
    resultRangeId: uuid.test(text(input.result) ?? "") ? text(input.result) : null,
    scoreMin: numberOrNull(text(input.min)),
    scoreMax: numberOrNull(text(input.max)),
    from: day(text(input.from)),
    to: day(text(input.to)),
    utmSource: text(input.source),
    utmCampaign: text(input.campaign),
    cta: ctaRaw === "clicked" || ctaRaw === "not_clicked" ? ctaRaw : null,
    sort: LEAD_SORTS.some((item) => item === sortRaw) ? (sortRaw as LeadSort) : "newest",
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1,
    size: PAGE_SIZES.some((item) => item === sizeRaw) ? (sizeRaw as (typeof PAGE_SIZES)[number]) : 25,
    ids,
  }
}

export function filtersToSearch(filters: LeadFilters) {
  const params = new URLSearchParams()
  if (filters.query) params.set("q", filters.query)
  if (filters.scorecardId) params.set("scorecard", filters.scorecardId)
  if (filters.status) params.set("status", filters.status)
  if (filters.temperature) params.set("temperature", filters.temperature)
  if (filters.country) params.set("country", filters.country)
  if (filters.tagId) params.set("tag", filters.tagId)
  if (filters.resultRangeId) params.set("result", filters.resultRangeId)
  if (filters.scoreMin !== null) params.set("min", String(filters.scoreMin))
  if (filters.scoreMax !== null) params.set("max", String(filters.scoreMax))
  if (filters.from) params.set("from", filters.from)
  if (filters.to) params.set("to", filters.to)
  if (filters.utmSource) params.set("source", filters.utmSource)
  if (filters.utmCampaign) params.set("campaign", filters.utmCampaign)
  if (filters.cta) params.set("cta", filters.cta)
  if (filters.sort !== "newest") params.set("sort", filters.sort)
  if (filters.page > 1) params.set("page", String(filters.page))
  if (filters.size !== 25) params.set("size", String(filters.size))
  return params
}
