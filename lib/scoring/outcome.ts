import { applyScoreRules, type StoredRule } from "@/lib/assessment/rules"
import { visibleQuestionIds, type VisibilityQuestion } from "@/lib/assessment/visibility"
import { applyEligibilityRules, type EligibilityRule, type RuleAnswer, type TriggeredRule } from "@/lib/scoring/eligibility"
import { calculateAssessment, matchResultRange, type EngineAnswer, type EngineCategory, type EngineQuestion, type ScoreRange } from "@/lib/scoring/engine"

export type AssessmentOutcome = {
  rawScore: number
  officialPercent: number
  matchedRange: ScoreRange | null
  finalRange: ScoreRange | null
  triggeredRules: TriggeredRule[]
  categoryScores: ReturnType<typeof calculateAssessment>["categoryScores"]
}

/** Même pipeline pour le questionnaire public et le testeur. */
export function resolveAssessment(input: {
  questions: EngineQuestion[]
  answers: Array<EngineAnswer & { valueText?: string }>
  categories: EngineCategory[]
  ranges: ScoreRange[]
  caps?: StoredRule[]
  rules?: EligibilityRule[]
}): AssessmentOutcome {
  const visible = new Set(visibleQuestionIds(toVisibilityQuestions(input.questions), input.answers))
  const questions = input.questions.filter((question) => visible.has(question.id))
  const scoringAnswers = input.answers.filter((answer) => visible.has(answer.questionId))
  const score = calculateAssessment({
    questions,
    answers: scoringAnswers,
    categories: input.categories,
    ranges: input.ranges,
  })
  const officialPercent = applyScoreRules(score.weightedScore, input.caps ?? [])
  const matchedRange = matchResultRange(officialPercent, input.ranges)
  const answers: RuleAnswer[] = scoringAnswers.map((answer) => ({
    questionId: answer.questionId,
    optionIds: answer.optionIds,
    scaleValue: answer.scaleValue,
    valueText: answer.valueText,
  }))
  const applied = applyEligibilityRules({
    matched: matchedRange,
    ranges: input.ranges,
    rules: input.rules ?? [],
    questions: questions.map((question) => ({ id: question.id, type: question.type })),
    answers,
  })
  return {
    rawScore: score.rawScore,
    officialPercent,
    matchedRange,
    finalRange: applied.finalRange,
    triggeredRules: applied.triggered,
    categoryScores: score.categoryScores,
  }
}

function toVisibilityQuestions(questions: EngineQuestion[]): VisibilityQuestion[] {
  return questions.map((question, index) => ({
    id: question.id,
    position: question.position ?? index,
    type: question.type,
    options: question.choiceOptions ?? question.options.map((option) => ({ id: option.id, label: option.id, value: option.id })),
    displayRule: question.displayRule ?? null,
  }))
}
