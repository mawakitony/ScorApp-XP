import type { QuestionnaireDraft } from "@/lib/importers/model"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string) {
  return uuidPattern.test(value)
}

export function foreignReferenceMessage(draft: QuestionnaireDraft, ownedQuestionIds: ReadonlySet<string>, ownedRangeIds: ReadonlySet<string>, ownedRuleIds: ReadonlySet<string>) {
  for (const question of draft.questions) {
    if (isUuid(question.ref) && !ownedQuestionIds.has(question.ref)) {
      return "Une question de ce fichier n'appartient pas à cette scorecard."
    }
  }
  const knownQuestions = new Set([...ownedQuestionIds, ...draft.questions.map((question) => question.ref)])
  const conditions = [
    ...draft.questions.flatMap((question) => question.displays ?? []),
    ...(draft.rules ?? []).flatMap((rule) => rule.conditions.map((condition) => ({ sourceRef: condition.sourceRef }))),
  ]
  for (const condition of conditions) {
    if (isUuid(condition.sourceRef) && !knownQuestions.has(condition.sourceRef)) {
      return "Une condition vise une question hors de cette scorecard."
    }
  }
  for (const range of draft.ranges) {
    if (range.ref && isUuid(range.ref) && !ownedRangeIds.has(range.ref)) {
      return "Un palier de ce fichier n'appartient pas à cette scorecard."
    }
  }
  for (const rule of draft.rules ?? []) {
    if (isUuid(rule.ref) && !ownedRuleIds.has(rule.ref)) return "Une règle de ce fichier n'appartient pas à cette scorecard."
    const knownRange = ownedRangeIds.has(rule.target) || draft.ranges.some((range) => range.ref === rule.target || range.label.toLowerCase() === rule.target.toLowerCase())
    if (isUuid(rule.target) && !knownRange) return "Une règle obligatoire vise un résultat hors de cette scorecard."
  }
  return null
}
