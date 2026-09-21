/** Température commerciale. Les seuils vivent ici pour rester remplaçables. */
export const TEMPERATURE_RULES = {
  hotScore: 75,
  warmScore: 40,
} as const

export const LEAD_STATUSES = ["new", "contacted", "qualified", "nurturing", "converted", "lost"] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_TEMPERATURES = ["cold", "warm", "hot"] as const
export type LeadTemperature = (typeof LEAD_TEMPERATURES)[number]

export const QUALITY_BANDS = { medium: 40, high: 70 } as const

/** Conversion commerciale de cette phase : un clic CTA, pas un achat. */
export const CONVERSION_KIND = "cta_click" as const

export const MAX_TAGS_PER_LEAD = 20
export const TAG_NAME_LIMIT = 50
export const NOTE_LIMIT = 5000
export const CSV_EXPORT_LIMIT = 5000
export const MAX_COMPLETION_SECONDS = 24 * 60 * 60

export function isLeadStatus(value: string): value is LeadStatus {
  return LEAD_STATUSES.some((status) => status === value)
}

export function leadTemperature(score: number | null, ctaClicked: boolean): LeadTemperature {
  if ((score !== null && score >= TEMPERATURE_RULES.hotScore) || ctaClicked) return "hot"
  if (score !== null && score >= TEMPERATURE_RULES.warmScore) return "warm"
  return "cold"
}

export function sameOrganization(left: string, right: string) {
  return left.length > 0 && left === right
}

export type CompletenessInput = {
  email?: string | null
  phone?: string | null
  country?: string | null
  company?: string | null
  jobTitle?: string | null
}

export type RequestedFields = {
  email: boolean
  phone: boolean
  country: boolean
  company: boolean
  jobTitle: boolean
}

function filled(value: string | null | undefined) {
  return Boolean(value?.trim())
}

/** Un champ non demandé par la scorecard ne baisse pas le taux. */
export function dataCompleteness(values: CompletenessInput, requested: RequestedFields) {
  const checks: boolean[] = []
  if (requested.email) checks.push(filled(values.email))
  if (requested.phone) checks.push(filled(values.phone))
  if (requested.country) checks.push(filled(values.country))
  if (requested.company) checks.push(filled(values.company))
  if (requested.jobTitle) checks.push(filled(values.jobTitle))
  if (checks.length === 0) return 100
  return round1((checks.filter(Boolean).length / checks.length) * 100)
}

/**
 * Qualité interne du lead. Distincte du score d'évaluation.
 * Le score d'évaluation est omis tant qu'il n'existe pas, pour ne pas le compter deux fois comme un zéro.
 */
export function leadQuality(input: {
  assessmentScore: number | null
  completed: boolean
  ctaClicked: boolean
  completeness: number
}) {
  const parts: { value: number; weight: number }[] = []
  if (input.assessmentScore !== null && Number.isFinite(input.assessmentScore)) {
    parts.push({ value: clamp(input.assessmentScore), weight: 50 })
  }
  parts.push({ value: input.completed ? 100 : 0, weight: 20 })
  parts.push({ value: input.ctaClicked ? 100 : 0, weight: 20 })
  parts.push({ value: clamp(input.completeness), weight: 10 })
  const weight = parts.reduce((sum, part) => sum + part.weight, 0)
  if (weight <= 0) return 0
  const total = parts.reduce((sum, part) => sum + part.value * part.weight, 0)
  return round1(total / weight)
}

export function qualityBand(score: number) {
  if (score >= QUALITY_BANDS.high) return "high" as const
  if (score >= QUALITY_BANDS.medium) return "medium" as const
  return "low" as const
}

export function round1(value: number) {
  return Math.round(value * 10) / 10
}

function clamp(value: number) {
  return Math.min(100, Math.max(0, value))
}
