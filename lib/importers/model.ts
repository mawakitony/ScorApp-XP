import { questionTypes, type QuestionType } from "@/lib/validators/builder"

export const importSources = ["woloyem_excel", "scoreapp_excel", "scoreapp_api"] as const
export type ImportSource = (typeof importSources)[number]
export type ImportMode = "add" | "replace" | "update"

export const choiceQuestionTypes: QuestionType[] = ["single_choice", "multiple_choice", "yes_no", "dropdown"]
export const optionFreeTypes: QuestionType[] = ["scale_5", "scale_10", "short_text", "long_text", "number", "email", "phone", "country"]

export const questionColumns = [
  "question_id",
  "order",
  "category",
  "question_type",
  "question",
  "description",
  "required",
  "is_scored",
  "option_1",
  "option_1_score",
  "option_2",
  "option_2_score",
  "option_3",
  "option_3_score",
  "option_4",
  "option_4_score",
  "option_5",
  "option_5_score",
  "option_6",
  "option_6_score",
] as const

export const conditionColumns = [
  "condition_mode",
  "condition_question_id",
  "condition_operator",
  "condition_value",
] as const

export const optionValueColumns = [
  "option_1_value",
  "option_2_value",
  "option_3_value",
  "option_4_value",
  "option_5_value",
  "option_6_value",
] as const

export const questionOptionalColumns = ["scoring_category", ...optionValueColumns] as const

export const conditionSheetColumns = [
  "question_id",
  "condition_order",
  "condition_mode",
  "condition_question_id",
  "condition_operator",
  "condition_value",
] as const

export type ImportDisplay = {
  mode: "show_if" | "hide_if"
  sourceRef: string
  operator: "eq" | "neq" | "lt" | "lte" | "gt" | "gte"
  value: string
}

export const categoryColumns = [
  "category_id",
  "name",
  "description",
  "weight",
  "order",
  "high_message",
  "medium_message",
  "low_message",
] as const

export const scoringCategoryColumns = [
  "scoring_category_id",
  "name",
  "description",
  "weight",
  "max_score",
  "order",
  "high_message",
  "medium_message",
  "low_message",
] as const

export const rangeColumns = [
  "min_score",
  "max_score",
  "label",
  "title",
  "description",
  "badge",
  "cta_label",
  "cta_url",
] as const

export const eligibilityColumns = [
  "rule_id",
  "name",
  "condition_order",
  "condition_question_id",
  "operator",
  "condition_value",
  "action",
  "target_result",
  "order",
] as const

export type ImportIssue = {
  row: number
  column: string
  message: string
}

export type ImportOption = {
  label: string
  value: string
  score: number
  position: number
}

export type ImportCategory = {
  ref: string
  name: string
  description: string
  weight: number
  order: number
  highMessage: string
  mediumMessage: string
  lowMessage: string
}

export type ImportQuestion = {
  ref: string
  order: number
  category: string
  scoringCategory: string
  type: QuestionType
  title: string
  description: string
  required: boolean
  isScored: boolean
  options: ImportOption[]
  display: ImportDisplay | null
  displays: ImportDisplay[]
}

export type ImportScoringCategory = {
  ref: string
  name: string
  description: string
  weight: number
  maxScore: number
  order: number
  highMessage: string
  mediumMessage: string
  lowMessage: string
}

export type ImportRange = {
  ref: string
  minScore: number
  maxScore: number
  label: string
  title: string
  description: string
  badge: string
  ctaLabel: string
  ctaUrl: string
}

export type ImportEligibilityRule = {
  ref: string
  name: string
  order: number
  action: "force_result" | "max_result"
  target: string
  conditions: { sourceRef: string; operator: ImportDisplay["operator"]; value: string }[]
}

export type QuestionnaireDraft = {
  source: ImportSource
  categories: ImportCategory[]
  scoringCategories: ImportScoringCategory[]
  questions: ImportQuestion[]
  ranges: ImportRange[]
  rules: ImportEligibilityRule[] | null
  sheets: { scoring: boolean; rules: boolean; ranges: boolean }
  unknownTypes: { row: number; rawType: string; title: string }[]
}

export type ImportPreview = {
  source: ImportSource
  questions: number
  categories: number
  scoringCategories: number
  scoringPercent: number | null
  scoringBalanced: boolean
  options: number
  scored: number
  unscored: number
  ranges: number
  conditionalQuestions: number
  eligibilityRules: number
  warnings: string[]
  suggestions: string[]
  rows: { order: number; question: string; type: QuestionType; category: string; options: number; scored: boolean }[]
}

export function isQuestionType(value: string): value is QuestionType {
  return (questionTypes as readonly string[]).includes(value)
}

export function previewOf(draft: QuestionnaireDraft): ImportPreview {
  const options = draft.questions.reduce((total, question) => total + question.options.length, 0)
  const scored = draft.questions.filter((question) => question.isScored).length
  const scoring = draft.scoringCategories.length > 0 ? draft.scoringCategories : draft.categories
  const scoringPercent = scoring.length > 0 ? Math.round(scoring.reduce((total, item) => total + item.weight, 0) * 10) / 10 : null
  const findings = importFindings(draft)
  return {
    source: draft.source,
    questions: draft.questions.length,
    categories: draft.categories.length,
    scoringCategories: draft.scoringCategories.length,
    scoringPercent,
    scoringBalanced: scoringPercent != null && Math.abs(scoringPercent - 100) < 0.05,
    options,
    scored,
    unscored: draft.questions.length - scored,
    ranges: draft.ranges.length,
    conditionalQuestions: draft.questions.filter((question) => (question.displays ?? []).length > 0 || question.display).length,
    eligibilityRules: draft.rules?.length ?? 0,
    warnings: findings.warnings,
    suggestions: findings.suggestions,
    rows: draft.questions.map((question) => ({
      order: question.order,
      question: question.title,
      type: question.type,
      category: question.category,
      options: question.options.length,
      scored: question.isScored,
    })),
  }
}

export function importFindings(draft: QuestionnaireDraft) {
  const warnings: string[] = []
  const suggestions: string[] = []
  const scoring = draft.scoringCategories.length > 0 ? draft.scoringCategories : draft.categories
  if (scoring.length > 0) {
    const total = scoring.reduce((sum, item) => sum + item.weight, 0)
    if (Math.abs(total - 100) >= 0.05) warnings.push(`Les poids totalisent ${Math.round(total * 10) / 10} % au lieu de 100 %.`)
  }
  warnings.push(...rangeFindings(draft.ranges))
  for (const question of draft.questions) {
    if (question.isScored && !question.scoringCategory && !question.category) {
      suggestions.push(`« ${question.title} » est notée sans catégorie de scoring.`)
    }
    if (!question.isScored && question.options.some((option) => option.score !== 0)) {
      suggestions.push(`« ${question.title} » a des scores alors qu'elle n'est pas notée.`)
    }
  }
  if (draft.questions.some((question) => question.isScored) && draft.ranges.length === 0 && !draft.sheets.ranges) {
    suggestions.push("Aucune plage de résultats dans le fichier. Les plages actuelles restent en place.")
  }
  return { warnings, suggestions }
}

export function rangeFindings(ranges: ImportRange[]) {
  if (ranges.length === 0) return []
  const warnings: string[] = []
  const sorted = [...ranges].sort((left, right) => left.minScore - right.minScore || left.maxScore - right.maxScore)
  if (sorted[0] && sorted[0].minScore > 0) warnings.push("Les plages ne commencent pas à 0.")
  const last = sorted[sorted.length - 1]
  if (last && last.maxScore < 100) warnings.push("Les plages ne couvrent pas jusqu'à 100.")
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index]
    const next = sorted[index + 1]
    if (!current || !next) continue
    if (next.minScore <= current.maxScore) warnings.push(`Les plages « ${current.label} » et « ${next.label} » se chevauchent.`)
    else if (next.minScore > current.maxScore + 1) warnings.push(`Un trou sépare « ${current.label} » et « ${next.label} ».`)
  }
  return warnings
}
