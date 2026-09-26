import type { ImportMode, QuestionnaireDraft } from "@/lib/importers/model"
import { optionValue } from "@/lib/importers/validate"

export type StoredQuestion = {
  id: string
  title: string
  score: number
  category: string
}

export type ImportStore = {
  questions: StoredQuestion[]
  categories: string[]
  ranges: { label: string }[]
  history: { status: string }[]
}

export function applyImportPlan(store: ImportStore, draft: QuestionnaireDraft, mode: ImportMode): ImportStore {
  const next: ImportStore = {
    questions: store.questions.map((question) => ({ ...question })),
    categories: [...store.categories],
    ranges: store.ranges.map((range) => ({ ...range })),
    history: [...store.history],
  }
  try {
    if (mode === "replace") next.questions = []
    if (mode === "replace" && draft.ranges.length > 0) next.ranges = []
    if (mode === "update") {
      draft.questions.forEach((question) => {
        const existing = next.questions.find((item) => item.id === question.ref)
        const score = question.options.reduce((total, option) => total + option.score, 0)
        if (existing) {
          existing.title = question.title
          existing.score = score
          existing.category = question.category
        }
      })
    }
    for (const category of draft.categories) {
      if (!next.categories.includes(category.name)) next.categories.push(category.name)
    }
    const start = next.questions.length
    draft.questions.forEach((question, index) => {
      const score = question.options.reduce((total, option) => total + option.score, 0)
      if (!Number.isFinite(score)) throw new Error("score")
      if (mode === "update" && next.questions.some((item) => item.id === question.ref)) return
      next.questions.push({
        id: mode === "update" ? question.ref : `${question.ref}-${start + index}`,
        title: question.title,
        score,
        category: question.category,
      })
    })
    draft.ranges.forEach((range) => {
      if (mode === "update" && next.ranges.some((item) => item.label === range.label)) return
      next.ranges.push({ label: range.label })
    })
    if (draft.questions.some((question) => question.options.some((option) => !optionValue(option.label, option.position)))) {
      throw new Error("option")
    }
    next.history.push({ status: "imported" })
    return next
  } catch (error) {
    if (error instanceof Error && error.message === "forced-rollback") return store
    throw Object.assign(error instanceof Error ? error : new Error("import"), { rolledBack: store })
  }
}

export function applyImportOrRollback(store: ImportStore, draft: QuestionnaireDraft, mode: ImportMode, fail: boolean) {
  if (!fail) return { committed: applyImportPlan(store, draft, mode), rolledBack: false }
  try {
    const snapshot = applyImportPlan(store, draft, mode)
    if (snapshot.questions.length >= 0) throw new Error("forced-rollback")
    return { committed: snapshot, rolledBack: false }
  } catch (error) {
    const rolled = error instanceof Error && "rolledBack" in error ? (error as Error & { rolledBack: ImportStore }).rolledBack : store
    return { committed: rolled, rolledBack: true }
  }
}
