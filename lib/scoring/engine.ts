export type ScoreRange = {
  id: string
  minPercent: number
  maxPercent: number
  label: string
}

export type WeightedPart = {
  percent: number
  weight: number
}

/**
 * Moteur de scoring pur.
 * Les seuils, poids et points vivent dans Supabase.
 * Les composants React ne portent pas de règles métier.
 */
export function toPercent(score: number, maxScore: number) {
  if (maxScore <= 0) return 0
  const value = (score / maxScore) * 100
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10
}

export function weightedAverage(parts: WeightedPart[]) {
  const weight = parts.reduce((sum, part) => sum + part.weight, 0)
  if (weight <= 0) return 0
  const total = parts.reduce((sum, part) => sum + part.percent * part.weight, 0)
  return Math.round((total / weight) * 10) / 10
}

export function matchResultRange<T extends ScoreRange>(percent: number, ranges: T[]) {
  const sorted = [...ranges].sort((a, b) => a.minPercent - b.minPercent || a.maxPercent - b.maxPercent)
  return (
    sorted.find((range) => percent >= range.minPercent && percent <= range.maxPercent) ?? null
  )
}

export type EngineOption = {
  id: string
  score: number
}

export type EngineChoice = {
  id: string
  label: string
  value: string
}

export type EngineQuestion = {
  id: string
  isScored: boolean
  scoringCategoryId: string | null
  type: string
  options: EngineOption[]
  scaleFrom?: number
  scaleTo?: number
  scoreFrom?: number
  scoreTo?: number
  displayRule?: { mode: "show_if" | "hide_if"; conditions: { questionId: string; operator: "eq" | "neq" | "lt" | "lte" | "gt" | "gte"; value: string }[] } | null
  choiceOptions?: EngineChoice[]
  position?: number
}

export type EngineAnswer = {
  questionId: string
  optionIds?: string[]
  scaleValue?: number
}

export type EngineCategory = {
  id: string
  weight: number
}

export type CategoryScore = {
  categoryId: string
  rawScore: number
  maxScore: number
  percent: number
  weight: number
}

export type AssessmentScore = {
  rawScore: number
  maxScore: number
  percentage: number
  categoryScores: CategoryScore[]
  weightedScore: number
  resultRange: ScoreRange | null
}

export function distributeScaleScores(count: number, minScore: number, maxScore: number) {
  if (count <= 0) return []
  if (count === 1) return [roundScore(maxScore)]
  return Array.from({ length: count }, (_, index) => {
    const value = minScore + ((maxScore - minScore) * index) / (count - 1)
    return roundScore(value)
  })
}

export function scaleScore(value: number, from: number, to: number, scoreFrom: number, scoreTo: number) {
  if (to === from) return roundScore(scoreTo)
  const ratio = (value - from) / (to - from)
  return roundScore(scoreFrom + ratio * (scoreTo - scoreFrom))
}

export function sumWeights(weights: number[]) {
  return roundScore(weights.reduce((sum, weight) => sum + weight, 0))
}

export function weightsMatchTarget(weights: number[], target = 100) {
  if (weights.length === 0) return true
  return Math.abs(sumWeights(weights) - target) < 0.05
}

export function rangeIssues(ranges: ScoreRange[]) {
  const issues: string[] = []
  const sorted = [...ranges].sort((a, b) => a.minPercent - b.minPercent || a.maxPercent - b.maxPercent)

  for (const range of sorted) {
    if (range.minPercent > range.maxPercent) {
      issues.push(`${range.label} : le minimum dépasse le maximum.`)
    }
  }

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index]
    if (!current) continue
    for (let nextIndex = index + 1; nextIndex < sorted.length; nextIndex += 1) {
      const next = sorted[nextIndex]
      if (!next) continue
      const overlaps = current.minPercent <= next.maxPercent && next.minPercent <= current.maxPercent
      if (overlaps) issues.push(`${current.label} et ${next.label} se chevauchent.`)
    }
  }

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index]
    if (!current || current.minPercent > current.maxPercent) continue
    const next = sorted.slice(index + 1).find((range) => range.minPercent <= range.maxPercent)
    if (next && next.minPercent > current.maxPercent + 1) {
      issues.push(`Un trou existe entre ${current.label} et ${next.label}.`)
    }
  }

  return issues
}

export function questionMaxScore(question: EngineQuestion) {
  if (!question.isScored) return 0
  if (question.type === "scale_5" || question.type === "scale_10") {
    return Math.max(question.scoreFrom ?? 0, question.scoreTo ?? 100)
  }
  if (question.options.length === 0) return 0
  if (question.type === "multiple_choice") {
    // Somme des points positifs. Les points négatifs réduisent le score obtenu
    // sans augmenter ce maximum, donc le pourcentage reste plafonné.
    return question.options.reduce((sum, option) => sum + Math.max(option.score, 0), 0)
  }
  return Math.max(...question.options.map((option) => option.score), 0)
}

export function answerScore(question: EngineQuestion, answer: EngineAnswer | undefined) {
  if (!question.isScored || !answer) return 0
  if (question.type === "scale_5" || question.type === "scale_10") {
    if (answer.scaleValue === undefined) return 0
    return scaleScore(
      answer.scaleValue,
      question.scaleFrom ?? (question.type === "scale_10" ? 1 : 1),
      question.scaleTo ?? (question.type === "scale_10" ? 10 : 5),
      question.scoreFrom ?? 0,
      question.scoreTo ?? 100,
    )
  }
  const selected = new Set(answer.optionIds ?? [])
  return question.options
    .filter((option) => selected.has(option.id))
    .reduce((sum, option) => sum + option.score, 0)
}

export function calculateAssessment(input: {
  questions: EngineQuestion[]
  answers: EngineAnswer[]
  categories: EngineCategory[]
  ranges: ScoreRange[]
}): AssessmentScore {
  const answers = new Map(input.answers.map((answer) => [answer.questionId, answer]))
  let rawScore = 0
  let maxScore = 0
  const grouped = new Map<string, { raw: number; max: number }>()

  for (const question of input.questions) {
    const earned = answerScore(question, answers.get(question.id))
    const maximum = questionMaxScore(question)
    rawScore += earned
    maxScore += maximum
    if (!question.scoringCategoryId || !question.isScored) continue
    const current = grouped.get(question.scoringCategoryId) ?? { raw: 0, max: 0 }
    current.raw += earned
    current.max += maximum
    grouped.set(question.scoringCategoryId, current)
  }

  const categoryScores = input.categories.map((category) => {
    const bucket = grouped.get(category.id) ?? { raw: 0, max: 0 }
    return {
      categoryId: category.id,
      rawScore: roundScore(bucket.raw),
      maxScore: roundScore(bucket.max),
      percent: toPercent(bucket.raw, bucket.max),
      weight: category.weight,
    }
  })

  const percentage = toPercent(rawScore, maxScore)
  const weightedScore = categoryScores.length > 0 ? weightedAverage(categoryScores) : percentage

  return {
    rawScore: roundScore(rawScore),
    maxScore: roundScore(maxScore),
    percentage,
    categoryScores,
    weightedScore,
    resultRange: matchResultRange(weightedScore, input.ranges),
  }
}

function roundScore(value: number) {
  return Math.round(value * 10) / 10
}
