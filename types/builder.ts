import type { QuestionType } from "@/lib/validators/builder"
import type { Scorecard, ScorecardStatus } from "@/types/database"

export type QuestionSettings = {
  scaleFrom: number
  scaleTo: number
  scoreFrom: number
  scoreTo: number
}

export type BuilderOption = {
  id: string
  questionId: string
  label: string
  value: string
  score: number
  position: number
}

export type BuilderQuestion = {
  id: string
  questionCategoryId: string | null
  scoringCategoryId: string | null
  type: QuestionType
  title: string
  description: string
  isRequired: boolean
  isScored: boolean
  position: number
  settings: QuestionSettings
  options: BuilderOption[]
}

export type BuilderQuestionCategory = {
  id: string
  name: string
  description: string
  icon: string
  weight: number
  position: number
}

export type BuilderScoringCategory = {
  id: string
  name: string
  description: string
  weight: number
  maxScore: number
  highMessage: string
  mediumMessage: string
  lowMessage: string
  position: number
}

export type BuilderBenefit = {
  title: string
  description: string
  icon: string
}

export type BuilderTestimonial = {
  quote: string
  author: string
  role: string
}

export type BuilderPage = {
  eyebrow: string
  title: string
  subtitle: string
  description: string
  heroImageUrl: string
  ctaLabel: string
  estimatedTimeLabel: string
  showEstimatedTime: boolean
  showQuestionCount: boolean
  showPrivacy: boolean
  benefits: BuilderBenefit[]
  testimonial: BuilderTestimonial
}

export type LeadField = {
  enabled: boolean
  required: boolean
  label: string
  placeholder: string
}

export type LeadFieldKey =
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "whatsapp"
  | "company"
  | "job_title"
  | "country"
  | "city"

export type BuilderLeadForm = {
  timing: "before" | "during" | "before_results" | "after_results"
  consentRequired: boolean
  consentLabel: string
  privacyPolicyUrl: string
  fields: Record<LeadFieldKey, LeadField>
}

export type BuilderRange = {
  id: string
  minPercent: number
  maxPercent: number
  label: string
  title: string
  description: string
  badge: string
  position: number
  recommendationId: string | null
  recommendationTitle: string
  recommendationBody: string
  ctaLabel: string
  ctaUrl: string
}

export type BuilderBundle = {
  scorecard: Scorecard
  page: BuilderPage
  questions: BuilderQuestion[]
  questionCategories: BuilderQuestionCategory[]
  scoringCategories: BuilderScoringCategory[]
  ranges: BuilderRange[]
  leadForm: BuilderLeadForm
}

export type SaveState = {
  status: "idle" | "saving" | "saved" | "error"
  savedAt: number | null
}

export const choiceTypes: QuestionType[] = ["single_choice", "multiple_choice", "yes_no", "dropdown"]

export function isChoiceType(type: QuestionType) {
  return choiceTypes.includes(type)
}

export function defaultSettings(type: QuestionType): QuestionSettings {
  if (type === "scale_10") return { scaleFrom: 1, scaleTo: 10, scoreFrom: 0, scoreTo: 100 }
  return { scaleFrom: 1, scaleTo: 5, scoreFrom: 0, scoreTo: 100 }
}

export type { ScorecardStatus }
