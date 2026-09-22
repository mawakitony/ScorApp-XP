import { explainWithoutChangingScore, sanitizeAiAnalysis } from "@/lib/ai/prompts"
import { participantDto, type ParticipantReport } from "./dto"

export function presentReport(snapshot: unknown, ai: unknown, revealName: boolean): ParticipantReport | null {
  if (!snapshot || typeof snapshot !== "object") return null
  const row = snapshot as ParticipantReport
  if (typeof row.overallPercent !== "number" || typeof row.scorecardTitle !== "string") return null
  const base = participantDto({ ...row, participantLabel: row.participantLabel || "Participant" })
  const explained = explainWithoutChangingScore(
    { ...base, officialPercent: base.overallPercent },
    sanitizeAiAnalysis(ai),
  )
  return participantDto({
    ...base,
    summary: explained.summary,
    strengths: explained.strengths,
    improvementAreas: explained.improvementAreas,
    recommendations: explained.recommendations,
    overallPercent: base.overallPercent,
    participantLabel: revealName ? base.participantLabel : "Participant",
  })
}
