"use server"

import {
  completeVisitorAssessment,
  markLeadFormViewed,
  saveVisitorAnswer,
  startSession,
  submitVisitorLead,
} from "@/lib/assessment/store"
import type { AnswerDraft } from "@/lib/assessment/answers"

export async function startAssessment(input: {
  slug: string
  honeypot?: string
  referrer?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  utmTerm?: string
}) {
  const result = await startSession({
    slug: input.slug,
    honeypot: input.honeypot ?? "",
    referrer: input.referrer ?? "",
    utmSource: input.utmSource ?? "",
    utmMedium: input.utmMedium ?? "",
    utmCampaign: input.utmCampaign ?? "",
    utmContent: input.utmContent ?? "",
    utmTerm: input.utmTerm ?? "",
  })
  if (result.error || !result.sessionId) return { error: result.error ?? "Cette action n'a pas pu aboutir." }
  return { href: `/s/${input.slug}/assessment` }
}

export async function saveAssessmentAnswer(slug: string, questionId: string, answer: AnswerDraft) {
  return saveVisitorAnswer(slug, questionId, answer)
}

export async function submitAssessmentLead(slug: string, values: Record<string, string>, consent: boolean, honeypot: string) {
  return submitVisitorLead(slug, values, consent, honeypot)
}

export async function finishAssessment(slug: string) {
  const result = await completeVisitorAssessment(slug)
  if (result.error || !result.sessionId) return { error: result.error ?? "Le résultat n'a pas pu être calculé." }
  return { href: `/s/${slug}/results/${result.sessionId}` }
}

export async function noteLeadForm(slug: string) {
  await markLeadFormViewed(slug)
}
