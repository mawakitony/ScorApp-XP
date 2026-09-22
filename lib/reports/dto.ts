import type { CategoryBand, ReportLanguage, ReportType } from "./version"

export type ReportCategory = {
  name: string
  percent: number
  band: CategoryBand
}

export type ParticipantReport = {
  language: ReportLanguage
  brandName: string
  website: string
  contactEmail: string
  footer: string
  scorecardTitle: string
  participantLabel: string
  generatedAt: string
  overallPercent: number
  badge: string
  resultTitle: string
  summary: string
  categories: ReportCategory[]
  strengths: string[]
  improvementAreas: string[]
  recommendations: string[]
  ctaLabel: string
  disclaimer: string
}

export type AdminReport = ParticipantReport & {
  internal: true
  leadStatus: string | null
  temperature: string | null
  quality: number | null
  source: string | null
  campaign: string | null
  email: string | null
  phone: string | null
  notes: string[]
  answers: { question: string; answer: string; awarded: number | null }[]
}

const participantFields = [
  "language",
  "brandName",
  "website",
  "contactEmail",
  "footer",
  "scorecardTitle",
  "participantLabel",
  "generatedAt",
  "overallPercent",
  "badge",
  "resultTitle",
  "summary",
  "categories",
  "strengths",
  "improvementAreas",
  "recommendations",
  "ctaLabel",
  "disclaimer",
] as const

export function participantDto(source: ParticipantReport): ParticipantReport {
  const copy = {} as ParticipantReport
  for (const field of participantFields) {
    copy[field] = source[field] as never
  }
  return copy
}

export function adminDto(source: AdminReport): AdminReport {
  return { ...participantDto(source), ...adminOnly(source) }
}

function adminOnly(source: AdminReport): Omit<AdminReport, keyof ParticipantReport> {
  return {
    internal: true,
    leadStatus: source.leadStatus,
    temperature: source.temperature,
    quality: source.quality,
    source: source.source,
    campaign: source.campaign,
    email: source.email,
    phone: source.phone,
    notes: source.notes,
    answers: source.answers,
  }
}

export function reportAccess(input: {
  reportType: ReportType
  reportOrganizationId: string
  viewerOrganizationId: string | null
  sameSession: boolean
  editor: boolean
}) {
  const sameOrg = Boolean(input.viewerOrganizationId) && input.viewerOrganizationId === input.reportOrganizationId
  if (!sameOrg && !input.sameSession) return "denied" as const
  if (input.reportType === "admin") {
    if (sameOrg && input.editor) return "admin" as const
    return "denied" as const
  }
  if (input.sameSession || sameOrg) return "participant" as const
  return "denied" as const
}

export function pdfFilename(scorecardTitle: string, internal: boolean) {
  const slug = scorecardTitle
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "Assessment"
  if (internal) return "WOLOYEM-Lead-Assessment-Internal.pdf"
  return `WOLOYEM-${slug}-Assessment-Report.pdf`
}
