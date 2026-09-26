import { conditionMatches, operatorsForQuestion, type EligibilityOperator } from "@/lib/scoring/eligibility"

export type DisplayMode = "show_if" | "hide_if"

export type DisplayCondition = {
  questionId: string
  operator: EligibilityOperator
  value: string
}

export type DisplayRule = {
  mode: DisplayMode
  conditions: DisplayCondition[]
}

export type VisibilityOption = {
  id: string
  label: string
  value: string
}

export type VisibilityQuestion = {
  id: string
  position: number
  type: string
  options: VisibilityOption[]
  displayRule: DisplayRule | null
}

export type VisibilityAnswer = {
  questionId: string
  optionIds?: string[]
  scaleValue?: number
  valueText?: string
}

const displayOperators = ["eq", "neq", "lt", "lte", "gt", "gte"] as const

function isDisplayOperator(value: unknown): value is EligibilityOperator {
  return typeof value === "string" && (displayOperators as readonly string[]).includes(value)
}

export function parseDisplayRule(value: unknown): DisplayRule | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as { displayRule?: unknown }
  const rule = record.displayRule
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) return null
  const raw = rule as { mode?: unknown; conditions?: unknown }
  const mode = raw.mode === "show_if" || raw.mode === "hide_if" ? raw.mode : null
  if (!mode || !Array.isArray(raw.conditions)) return null
  const conditions = raw.conditions.flatMap((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return []
    const condition = item as { questionId?: unknown; operator?: unknown; value?: unknown }
    if (typeof condition.questionId !== "string" || typeof condition.value !== "string" || !isDisplayOperator(condition.operator)) return []
    if (!condition.value.trim()) return []
    return [{ questionId: condition.questionId, operator: condition.operator, value: condition.value }]
  })
  if (conditions.length === 0) return null
  return { mode, conditions }
}

export function displayRuleIssues(questions: VisibilityQuestion[]) {
  const byId = new Map(questions.map((question) => [question.id, question]))
  for (const question of questions) {
    const rule = question.displayRule
    if (!rule) continue
    if (rule.conditions.length === 0) return "Une condition d'affichage est incomplète."
    for (const condition of rule.conditions) {
      if (condition.questionId === question.id) return "Une question ne peut pas dépendre d'elle-même."
      const source = byId.get(condition.questionId)
      if (!source) return "La question source n'appartient pas à cette scorecard."
      if (source.position >= question.position) return "Une question ne peut dépendre que d'une question précédente."
      if (!operatorsForQuestion(source.type).includes(condition.operator)) return "Cet opérateur ne correspond pas au type de question."
    }
  }
  if (hasDisplayCycle(questions)) return "Les conditions d'affichage forment une boucle."
  return null
}

export function hasDisplayCycle(questions: VisibilityQuestion[]) {
  const byId = new Map(questions.map((question) => [question.id, question]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  function walk(id: string): boolean {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    for (const condition of byId.get(id)?.displayRule?.conditions ?? []) {
      if (walk(condition.questionId)) return true
    }
    visiting.delete(id)
    visited.add(id)
    return false
  }
  return questions.some((question) => walk(question.id))
}

export function isQuestionVisible(question: VisibilityQuestion, questions: VisibilityQuestion[], answers: VisibilityAnswer[]) {
  const rule = question.displayRule
  if (!rule || rule.conditions.length === 0) return true
  const applicable = rule.conditions.filter((condition) => {
    const source = questions.find((item) => item.id === condition.questionId)
    return Boolean(source && source.id !== question.id && source.position < question.position)
  })
  if (applicable.length === 0) return true
  const matched = applicable.every((condition) => {
    const source = questions.find((item) => item.id === condition.questionId)
    const answer = answers.find((item) => item.questionId === condition.questionId)
    if (!source) return false
    return conditionMatches(
      { ...condition, value: resolveConditionValue(condition.value, source) },
      { id: source.id, type: source.type },
      toRuleAnswer(source, answer),
    )
  })
  return rule.mode === "show_if" ? matched : !matched
}

export function visibleQuestions<T extends VisibilityQuestion>(questions: T[], answers: VisibilityAnswer[]) {
  return questions.filter((question) => isQuestionVisible(question, questions, answers))
}

export function visibleQuestionIds(questions: VisibilityQuestion[], answers: VisibilityAnswer[]) {
  return visibleQuestions(questions, answers).map((question) => question.id)
}

export function pruneHiddenAnswers<T extends { questionId: string }>(questions: VisibilityQuestion[], answers: T[]) {
  const visible = new Set(visibleQuestionIds(questions, answers))
  const removedIds = answers.filter((answer) => !visible.has(answer.questionId)).map((answer) => answer.questionId)
  return { answers: answers.filter((answer) => visible.has(answer.questionId)), removedIds }
}

export function blockingQuestion(questions: Array<VisibilityQuestion & { isRequired: boolean }>, answers: VisibilityAnswer[], answered: Set<string>) {
  return visibleQuestions(questions, answers).find((question) => question.isRequired && !answered.has(question.id)) ?? null
}

function resolveConditionValue(value: string, source: VisibilityQuestion) {
  const expected = value.trim().toLowerCase()
  const option = source.options.find((item) => item.id === value || item.value.trim().toLowerCase() === expected || item.label.trim().toLowerCase() === expected)
  return option?.id ?? value
}

function toRuleAnswer(source: VisibilityQuestion, answer: VisibilityAnswer | undefined) {
  if (!answer) return undefined
  const numeric = source.type === "number" || source.type === "scale_5" || source.type === "scale_10"
  const fromText = Number(answer.valueText)
  return {
    questionId: answer.questionId,
    optionIds: answer.optionIds,
    scaleValue: answer.scaleValue ?? (numeric && answer.valueText && Number.isFinite(fromText) ? fromText : undefined),
    valueText: answer.valueText,
  }
}
