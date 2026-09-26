import type { BuilderQuestion } from "@/types/builder"
import type { EngineQuestion } from "@/lib/scoring/engine"

export function toEngineQuestion(question: BuilderQuestion): EngineQuestion {
  return {
    id: question.id,
    isScored: question.isScored,
    scoringCategoryId: question.scoringCategoryId,
    type: question.type,
    options: question.options.map((option) => ({ id: option.id, score: option.score })),
    scaleFrom: question.settings.scaleFrom,
    scaleTo: question.settings.scaleTo,
    scoreFrom: question.settings.scoreFrom,
    scoreTo: question.settings.scoreTo,
    displayRule: question.displayRule,
    choiceOptions: question.options.map((option) => ({ id: option.id, label: option.label, value: option.value })),
    position: question.position,
  }
}
