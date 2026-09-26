import { defaultSettings } from "@/types/builder"
import type { Json } from "@/types/database"
import type { ImportQuestion, QuestionnaireDraft } from "@/lib/importers/model"
import { optionValue } from "@/lib/importers/validate"

function displaySettings(question: ImportQuestion) {
  const conditions = question.displays?.length ? question.displays : question.display ? [question.display] : []
  if (conditions.length === 0) return {}
  return {
    displayRule: {
      mode: conditions[0]?.mode,
      conditions: conditions.map((condition) => ({
        questionId: condition.sourceRef,
        operator: condition.operator,
        value: condition.value,
      })),
    },
  }
}

export function questionnairePayload(draft: QuestionnaireDraft): Json {
  return {
    categories: draft.categories.map((category) => ({
      name: category.name,
      description: category.description,
      weight: category.weight,
      order: category.order,
      highMessage: category.highMessage,
      mediumMessage: category.mediumMessage,
      lowMessage: category.lowMessage,
    })),
    questions: draft.questions.map((question) => ({
      category: question.category,
      type: question.type,
      title: question.title,
      description: question.description,
      required: question.required,
      isScored: question.isScored,
      order: question.order,
      scoringCategory: question.scoringCategory || question.category,
      settings: {
        ...(question.type === "scale_10" ? defaultSettings("scale_10") : defaultSettings(question.type)),
        ...displaySettings(question),
      },
      options: question.options.map((option) => ({
        label: option.label,
        value: option.value || optionValue(option.label, option.position),
        score: option.score,
        position: option.position,
      })),
    })),
    ranges: draft.ranges.map((range) => ({
      minScore: range.minScore,
      maxScore: range.maxScore,
      label: range.label,
      title: range.title,
      description: range.description,
      badge: range.badge,
      ctaLabel: range.ctaLabel,
      ctaUrl: range.ctaUrl,
    })),
  }
}
