import type { QuestionnaireDraft } from "@/lib/importers/model"

export type DiffStatus = "added" | "modified" | "removed" | "unchanged"

export type DiffLine = {
  status: DiffStatus
  text: string
}

export type ImportCatalog = {
  questions: {
    id: string
    order: number
    title: string
    description: string
    type: string
    required: boolean
    scored: boolean
    category: string
    scoringCategory: string
    options: { label: string; score: number }[]
    conditions: string
  }[]
  categories: { name: string; weight: number }[]
  scoringCategories: { name: string; weight: number; maxScore: number }[]
  ranges: { id: string; label: string; min: number; max: number; title: string }[]
  rules: { id: string; action: string; target: string; conditions: string }[]
}

function code(order: number) {
  return `Q${String(order).padStart(2, "0")}`
}

export function diffImport(catalog: ImportCatalog, draft: QuestionnaireDraft): DiffLine[] {
  const lines: DiffLine[] = []
  const incoming = new Set(draft.questions.map((question) => question.ref))

  for (const question of draft.questions) {
    const current = catalog.questions.find((item) => item.id === question.ref)
    const label = code(question.order)
    if (!current) {
      lines.push({ status: "added", text: `${label} — nouvelle question` })
      continue
    }
    const details: string[] = []
    if (current.title !== question.title || current.description !== question.description) details.push("texte modifié")
    if (current.type !== question.type) details.push("type modifié")
    if (current.required !== question.required) details.push("obligation modifiée")
    if (current.scored !== question.isScored) details.push("notation modifiée")
    if (current.category !== question.category || current.scoringCategory !== (question.scoringCategory || question.category)) details.push("catégorie modifiée")
    const incomingConditions = (question.displays ?? []).map((display) => `${display.mode}|${display.sourceRef}|${display.operator}|${display.value}`).join(";")
    if ((current.conditions ?? "") !== incomingConditions) details.push("affichage modifié")
    const scoreChange = optionScoreChange(current.options, question.options)
    if (scoreChange) details.push(scoreChange)
    else if (current.options.map((option) => option.label).join("|") !== question.options.map((option) => option.label).join("|")) details.push("options modifiées")
    lines.push(details.length > 0 ? { status: "modified", text: `${label} — ${details.join(" · ")}` } : { status: "unchanged", text: `${label} — inchangée` })
  }

  catalog.questions.forEach((question, index) => {
    if (incoming.has(question.id)) return
    lines.push({ status: "removed", text: `${code(question.order || index + 1)} — absente du fichier` })
  })

  if (draft.sheets.ranges) {
    const incomingRanges = new Set(draft.ranges.flatMap((range) => [range.ref, range.label]))
    for (const range of draft.ranges) {
      const current = catalog.ranges.find((item) => item.id === range.ref || item.label === range.label)
      if (!current) lines.push({ status: "added", text: `Palier ${range.label} — nouveau` })
      else if (current.min !== range.minScore || current.max !== range.maxScore || current.title !== range.title) {
        lines.push({ status: "modified", text: `Palier ${range.label} — bornes ou titre modifiés` })
      }
    }
    for (const range of catalog.ranges) {
      if (incomingRanges.has(range.id) || incomingRanges.has(range.label)) continue
      lines.push({ status: "removed", text: `Palier ${range.label} — absent du fichier` })
    }
  }

  if (draft.rules) {
    const incomingRules = new Set(draft.rules.map((rule) => rule.ref))
    for (const rule of draft.rules) {
      const current = catalog.rules.find((item) => item.id === rule.ref)
      if (!current) lines.push({ status: "added", text: `${rule.name} — nouvelle règle obligatoire` })
      else if (current.action !== rule.action || current.target !== rule.target || current.conditions !== rule.conditions.map((condition) => `${condition.sourceRef}|${condition.operator}|${condition.value}`).join(";")) {
        lines.push({ status: "modified", text: `${rule.name} — règle obligatoire modifiée` })
      }
    }
    for (const rule of catalog.rules) {
      if (incomingRules.has(rule.id)) continue
      lines.push({ status: "removed", text: `Règle obligatoire — absente du fichier` })
    }
  }

  return lines
}

function optionScoreChange(current: { label: string; score: number }[], incoming: { label: string; score: number }[]) {
  for (const option of incoming) {
    const previous = current.find((item) => item.label === option.label)
    if (previous && previous.score !== option.score) return `score option modifié : ${previous.score} → ${option.score}`
  }
  return ""
}

export function keptIds(existingIds: string[], incomingIds: string[], removeMissing: boolean) {
  if (removeMissing) return existingIds.filter((id) => incomingIds.includes(id))
  return existingIds
}
