import { REPORT_AI_PROMPT_VERSION } from "@/lib/reports/version"

export { REPORT_AI_PROMPT_VERSION }

export const AI_GUARDRAILS = [
  "Ne recalcule aucun score.",
  "Ne modifie pas le score officiel, les scores de catégorie, la plage de résultat ni l'éligibilité.",
  "N'affirme pas une certification.",
  "Ne garantis pas une réussite à un examen.",
  "Ne prétends pas être PMI, PeopleCert ou un examinateur officiel.",
  "N'invente pas de critères absents des données.",
  "Ne transforme pas une estimation WOLOYEM en décision d'un organisme certificateur.",
  "Ne reformule pas le disclaimer pour le rendre plus affirmatif.",
].join(" ")

export type AIReportInput = {
  language: "fr" | "en"
  scorecardTitle: string
  overallPercent: number
  resultTitle: string
  categories: { name: string; percent: number }[]
  recommendations: string[]
  participantLabel: "Participant"
}

export type AIReportAnalysis = {
  summary: string
  strengths: string[]
  improvementAreas: string[]
  studyRecommendations: string[]
  nextSteps: string[]
}

const allowed = ["summary", "strengths", "improvementAreas", "studyRecommendations", "nextSteps"] as const

export function sanitizeAiAnalysis(value: unknown): AIReportAnalysis | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  const summary = typeof row.summary === "string" ? row.summary.trim() : ""
  if (!summary) return null
  return {
    summary,
    strengths: strings(row.strengths),
    improvementAreas: strings(row.improvementAreas),
    studyRecommendations: strings(row.studyRecommendations),
    nextSteps: strings(row.nextSteps),
  }
}

export function explainWithoutChangingScore<T extends { officialPercent: number; summary: string; strengths: string[]; improvementAreas: string[]; recommendations: string[] }>(
  base: T,
  ai: AIReportAnalysis | null,
): T {
  if (!ai) return base
  return {
    ...base,
    officialPercent: base.officialPercent,
    summary: ai.summary || base.summary,
    strengths: ai.strengths.length ? ai.strengths : base.strengths,
    improvementAreas: ai.improvementAreas.length ? ai.improvementAreas : base.improvementAreas,
    recommendations: ai.studyRecommendations.length ? ai.studyRecommendations : base.recommendations,
  }
}

export function aiPayload(input: AIReportInput) {
  return {
    promptVersion: REPORT_AI_PROMPT_VERSION,
    guardrails: AI_GUARDRAILS,
    language: input.language,
    scorecardTitle: input.scorecardTitle,
    overallPercent: input.overallPercent,
    resultTitle: input.resultTitle,
    categories: input.categories,
    recommendations: input.recommendations,
    participant: input.participantLabel,
  }
}

export function aiKeepsOfficialScore(officialPercent: number, analysis: AIReportAnalysis | null) {
  void analysis
  return officialPercent
}

function strings(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 8)
}

export const AI_OUTPUT_FIELDS = allowed
