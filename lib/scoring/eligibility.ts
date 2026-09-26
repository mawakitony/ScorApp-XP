import { matchResultRange, type ScoreRange } from "@/lib/scoring/engine"

export const eligibilityOperators = ["eq", "neq", "lt", "lte", "gt", "gte"] as const
export type EligibilityOperator = (typeof eligibilityOperators)[number]

export type EligibilityAction = "force_result" | "max_result"

export type EligibilityCondition = {
  questionId: string
  operator: EligibilityOperator
  value: string
}

export type EligibilityRule = {
  id: string
  scorecardId: string
  conditions: EligibilityCondition[]
  action: EligibilityAction
  resultRangeId: string
}

export type RuleAnswer = {
  questionId: string
  optionIds?: string[]
  scaleValue?: number
  valueText?: string
}

export type RuleQuestion = {
  id: string
  type: string
}

export type TriggeredRule = {
  id: string
  action: EligibilityAction
  resultRangeId: string
}

const choiceTypes = new Set(["single_choice", "multiple_choice", "yes_no", "dropdown"])
const numericTypes = new Set(["scale_5", "scale_10", "number"])

export function operatorsForQuestion(type: string): EligibilityOperator[] {
  if (numericTypes.has(type)) return [...eligibilityOperators]
  return ["eq", "neq"]
}

export function isMoreRestrictive(candidate: ScoreRange, current: ScoreRange) {
  if (candidate.maxPercent !== current.maxPercent) return candidate.maxPercent < current.maxPercent
  return candidate.minPercent < current.minPercent
}

function mostRestrictive(ranges: ScoreRange[]) {
  return ranges.reduce<ScoreRange | null>((best, range) => {
    if (!best || isMoreRestrictive(range, best)) return range
    return best
  }, null)
}

function numericValue(answer: RuleAnswer | undefined) {
  if (!answer) return null
  if (typeof answer.scaleValue === "number" && Number.isFinite(answer.scaleValue)) return answer.scaleValue
  return null
}

export function conditionMatches(condition: EligibilityCondition, question: RuleQuestion | undefined, answer: RuleAnswer | undefined) {
  if (!question || !operatorsForQuestion(question.type).includes(condition.operator)) return false
  if (choiceTypes.has(question.type)) {
    const selected = new Set(answer?.optionIds ?? [])
    const has = selected.has(condition.value)
    if (condition.operator === "eq") return has
    if (condition.operator === "neq") return selected.size > 0 && !has
    return false
  }
  if (numericTypes.has(question.type)) {
    const current = numericValue(answer)
    const expected = Number(condition.value)
    if (current === null || !Number.isFinite(expected)) return false
    if (condition.operator === "eq") return current === expected
    if (condition.operator === "neq") return current !== expected
    if (condition.operator === "lt") return current < expected
    if (condition.operator === "lte") return current <= expected
    if (condition.operator === "gt") return current > expected
    if (condition.operator === "gte") return current >= expected
    return false
  }
  const text = (answer?.valueText ?? "").trim().toLowerCase()
  const expected = condition.value.trim().toLowerCase()
  if (condition.operator === "eq") return text.length > 0 && text === expected
  if (condition.operator === "neq") return text.length > 0 && text !== expected
  return false
}

export function ruleMatches(rule: EligibilityRule, questions: RuleQuestion[], answers: RuleAnswer[]) {
  if (rule.conditions.length === 0) return false
  const byQuestion = new Map(questions.map((question) => [question.id, question]))
  const byAnswer = new Map(answers.map((answer) => [answer.questionId, answer]))
  return rule.conditions.every((condition) => conditionMatches(condition, byQuestion.get(condition.questionId), byAnswer.get(condition.questionId)))
}

export function rulesForScorecard(rules: EligibilityRule[], scorecardId: string) {
  return rules.filter((rule) => rule.scorecardId === scorecardId)
}

export function applyEligibilityRules(input: {
  matched: ScoreRange | null
  ranges: ScoreRange[]
  rules: EligibilityRule[]
  questions: RuleQuestion[]
  answers: RuleAnswer[]
}) {
  const known = new Map(input.ranges.map((range) => [range.id, range]))
  const satisfied = input.rules.filter((rule) => known.has(rule.resultRangeId) && ruleMatches(rule, input.questions, input.answers))
  const forced = mostRestrictive(
    satisfied.filter((rule) => rule.action === "force_result").flatMap((rule) => {
      const range = known.get(rule.resultRangeId)
      return range ? [range] : []
    }),
  )
  const capped = mostRestrictive(
    satisfied.filter((rule) => rule.action === "max_result").flatMap((rule) => {
      const range = known.get(rule.resultRangeId)
      return range ? [range] : []
    }),
  )

  let finalRange = input.matched
  const triggered: TriggeredRule[] = []
  if (forced && (!finalRange || isMoreRestrictive(forced, finalRange))) finalRange = forced
  if (capped && (!finalRange || isMoreRestrictive(capped, finalRange))) finalRange = capped

  for (const rule of satisfied) {
    const range = known.get(rule.resultRangeId)
    if (!range || !finalRange || range.id !== finalRange.id) continue
    if (rule.action === "force_result" || rule.action === "max_result") {
      triggered.push({ id: rule.id, action: rule.action, resultRangeId: range.id })
    }
  }

  if (finalRange && input.matched && finalRange.id === input.matched.id && !forced && !capped) {
    return { finalRange: input.matched, triggered: [] as TriggeredRule[] }
  }
  return { finalRange, triggered }
}

export function matchOfficialRange(percent: number, ranges: ScoreRange[]) {
  return matchResultRange(percent, ranges)
}
