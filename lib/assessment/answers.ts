import { TEXT_LIMITS } from "@/lib/assessment/config"
import { isCountryCode } from "@/lib/geo/countries"
import type { QuestionType } from "@/lib/validators/builder"

export type AnswerDraft = {
  optionIds: string[]
  scaleValue?: number
  text: string
}

export type AnswerQuestion = {
  id: string
  type: QuestionType
  isRequired: boolean
  optionIds: string[]
  scaleFrom: number
  scaleTo: number
}

export function validateAnswer(question: AnswerQuestion, answer: AnswerDraft) {
  if (question.type === "single_choice" || question.type === "yes_no" || question.type === "dropdown") {
    if (answer.optionIds.length !== 1) return "Choisissez une réponse."
    if (!question.optionIds.includes(answer.optionIds[0] ?? "")) return "Cette réponse n'appartient pas à la question."
    return null
  }

  if (question.type === "multiple_choice") {
    if (answer.optionIds.length === 0) return "Choisissez au moins une réponse."
    if (new Set(answer.optionIds).size !== answer.optionIds.length) return "Réponse invalide."
    if (answer.optionIds.some((id) => !question.optionIds.includes(id))) return "Cette réponse n'appartient pas à la question."
    return null
  }

  if (question.type === "scale_5" || question.type === "scale_10") {
    if (answer.scaleValue === undefined || !Number.isInteger(answer.scaleValue)) return "Choisissez une valeur."
    if (answer.scaleValue < question.scaleFrom || answer.scaleValue > question.scaleTo) return "Valeur hors échelle."
    return null
  }

  const text = answer.text.trim()
  if (!text) return "Cette réponse est vide."

  if (question.type === "short_text" && text.length > TEXT_LIMITS.short_text) return "Réponse trop longue."
  if (question.type === "long_text" && text.length > TEXT_LIMITS.long_text) return "Réponse trop longue."
  if (question.type === "email") {
    if (text.length > TEXT_LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return "Email invalide."
  }
  if (question.type === "phone" && text.length > TEXT_LIMITS.phone) return "Numéro trop long."
  if (question.type === "number" && !Number.isFinite(Number(text))) return "Nombre invalide."
  if (question.type === "country" && !isCountryCode(text)) return "Pays invalide."
  return null
}

export function resumeIndex(questions: { id: string; isRequired: boolean }[], answered: Set<string>) {
  const required = questions.findIndex((question) => question.isRequired && !answered.has(question.id))
  if (required >= 0) return required
  const missing = questions.findIndex((question) => !answered.has(question.id))
  if (missing >= 0) return missing
  return questions.length
}

export function isSessionExpired(expiresAt: string, now = Date.now()) {
  return new Date(expiresAt).getTime() <= now
}

export function isMutableSession(status: string, expiresAt: string, now = Date.now()) {
  return status !== "completed" && status !== "abandoned" && !isSessionExpired(expiresAt, now)
}
