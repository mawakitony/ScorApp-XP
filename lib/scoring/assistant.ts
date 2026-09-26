export type ScoringProposalItem = {
  existingId: string | null
  name: string
  weight: number
}

export type ScoringProposal = {
  items: ScoringProposalItem[]
  links: { questionId: string; categoryName: string }[]
}

export function splitWeights(count: number) {
  if (count <= 0) return []
  const base = Math.floor(100 / count)
  const remainder = 100 - base * count
  return Array.from({ length: count }, (_, index) => (index === count - 1 ? base + remainder : base))
}

export function proposeScoring(input: {
  scoringCategories: { id: string; name: string }[]
  questionCategories: { id: string; name: string }[]
  questions: { id: string; isScored: boolean; questionCategoryId: string | null; scoringCategoryId: string | null }[]
}): ScoringProposal {
  const scored = input.questions.filter((question) => question.isScored)
  if (input.scoringCategories.length > 0) {
    const weights = splitWeights(input.scoringCategories.length)
    const items = input.scoringCategories.map((category, index) => ({
      existingId: category.id,
      name: category.name,
      weight: weights[index] ?? 0,
    }))
    return {
      items,
      links: unmatchedLinks(scored, input.questionCategories, items),
    }
  }

  const names = [...new Set(scored.flatMap((question) => {
    const category = input.questionCategories.find((item) => item.id === question.questionCategoryId)
    return category ? [category.name.trim()] : ["Général"]
  }))]
  const labels = names.length > 0 ? names : ["Score"]
  const weights = splitWeights(labels.length)
  const items = labels.map((name, index) => ({ existingId: null, name, weight: weights[index] ?? 0 }))
  return { items, links: unmatchedLinks(scored, input.questionCategories, items) }
}

function unmatchedLinks(
  questions: { id: string; questionCategoryId: string | null; scoringCategoryId: string | null }[],
  questionCategories: { id: string; name: string }[],
  items: ScoringProposalItem[],
) {
  return questions.flatMap((question) => {
    if (question.scoringCategoryId) return []
    const category = questionCategories.find((item) => item.id === question.questionCategoryId)
    const name = category?.name.trim() ?? "Général"
    const match = items.find((item) => item.name.trim().toLowerCase() === name.toLowerCase())
    if (!match) return []
    return [{ questionId: question.id, categoryName: match.name }]
  })
}
