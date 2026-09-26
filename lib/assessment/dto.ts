import { parseDisplayRule, type DisplayRule } from "@/lib/assessment/visibility"
import type { QuestionType } from "@/lib/validators/builder"

export type PublicOption = {
  id: string
  label: string
  value: string
}

export type PublicQuestion = {
  id: string
  type: QuestionType
  title: string
  description: string
  isRequired: boolean
  position: number
  scaleFrom: number
  scaleTo: number
  options: PublicOption[]
  displayRule: DisplayRule | null
}

export type PublicCategoryScore = {
  name: string
  percent: number
}

export type PublicResult = {
  percentage: number
  badge: string
  title: string
  description: string
  recommendation: string
  ctaLabel: string
  categories: PublicCategoryScore[]
  disclaimer: string
}

const questionTypes: QuestionType[] = [
  "single_choice",
  "multiple_choice",
  "yes_no",
  "scale_5",
  "scale_10",
  "short_text",
  "long_text",
  "number",
  "email",
  "phone",
  "country",
  "dropdown",
]

export function asQuestionType(value: string): QuestionType {
  return questionTypes.includes(value as QuestionType) ? (value as QuestionType) : "short_text"
}

export function toPublicQuestion(input: {
  id: string
  type: string
  title: string
  description: string | null
  isRequired: boolean
  position?: number
  settings: unknown
  options: { id: string; label: string; value: string | null; position: number }[]
}): PublicQuestion {
  const type = asQuestionType(input.type)
  const settings = input.settings && typeof input.settings === "object" && !Array.isArray(input.settings)
    ? input.settings as { scaleFrom?: unknown; scaleTo?: unknown }
    : {}
  const scaleFrom = typeof settings.scaleFrom === "number" ? settings.scaleFrom : 1
  const scaleTo = typeof settings.scaleTo === "number" ? settings.scaleTo : type === "scale_10" ? 10 : 5
  return {
    id: input.id,
    type,
    title: input.title,
    description: input.description ?? "",
    isRequired: input.isRequired,
    position: input.position ?? 0,
    scaleFrom,
    scaleTo,
    options: [...input.options]
      .sort((a, b) => a.position - b.position)
      .map((option) => ({ id: option.id, label: option.label, value: option.value ?? "" })),
    displayRule: parseDisplayRule(input.settings),
  }
}
