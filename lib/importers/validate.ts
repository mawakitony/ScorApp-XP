import { z } from "zod"
import { slugify } from "@/lib/format"
import { operatorsForQuestion, type EligibilityOperator } from "@/lib/scoring/eligibility"
import { QUESTIONNAIRE_IMPORT_MAX_QUESTIONS } from "@/lib/security/limits"
import { questionTypes } from "@/lib/validators/builder"
import {
  categoryColumns,
  choiceQuestionTypes,
  eligibilityColumns,
  isQuestionType,
  optionFreeTypes,
  questionColumns,
  rangeColumns,
  scoringCategoryColumns,
  type ImportCategory,
  type ImportDisplay,
  type ImportEligibilityRule,
  type ImportIssue,
  type ImportQuestion,
  type ImportRange,
  type ImportScoringCategory,
  type QuestionnaireDraft,
} from "@/lib/importers/model"

const booleanSchema = z.union([
  z.boolean(),
  z.enum(["TRUE", "FALSE", "true", "false", "1", "0"]),
]).transform((value) => value === true || value === "TRUE" || value === "true" || value === "1")

const scoreSchema = z.number().finite()

function issue(row: number, column: string, message: string): ImportIssue {
  return { row, column, message }
}

function cell(row: Record<string, unknown>, key: string) {
  return row[key]
}

function text(value: unknown) {
  if (value == null) return ""
  return String(value).trim()
}

function parseBoolean(value: unknown, row: number, column: string, issues: ImportIssue[]) {
  if (value == null || value === "") {
    issues.push(issue(row, column, "Indiquez TRUE ou FALSE."))
    return false
  }
  const parsed = booleanSchema.safeParse(value)
  if (!parsed.success) {
    issues.push(issue(row, column, `La valeur "${text(value)}" n'est pas un booléen TRUE/FALSE.`))
    return false
  }
  return parsed.data
}

function parseNumber(value: unknown, row: number, column: string, issues: ImportIssue[], required: boolean) {
  if (value == null || value === "") {
    if (required) issues.push(issue(row, column, "Un nombre est requis."))
    return null
  }
  const numeric = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."))
  const parsed = scoreSchema.safeParse(numeric)
  if (!parsed.success) {
    issues.push(issue(row, column, `La valeur "${text(value)}" n'est pas un nombre valide.`))
    return null
  }
  return parsed.data
}

function requireColumns(rows: Record<string, unknown>[], columns: readonly string[], sheetRow: number, issues: ImportIssue[]) {
  if (rows.length === 0) return
  const keys = new Set(Object.keys(rows[0] ?? {}))
  for (const column of columns) {
    if (!keys.has(column)) issues.push(issue(sheetRow, column, "Colonne obligatoire absente."))
  }
}

export function validateQuestionnaireTables(input: {
  source: QuestionnaireDraft["source"]
  questions: Record<string, unknown>[]
  categories: Record<string, unknown>[]
  ranges: Record<string, unknown>[]
  scoringCategories?: Record<string, unknown>[]
  conditions?: Record<string, unknown>[]
  eligibility?: Record<string, unknown>[] | null
  sheets?: QuestionnaireDraft["sheets"]
}): { draft: QuestionnaireDraft | null; issues: ImportIssue[] } {
  const issues: ImportIssue[] = []
  const sheets = input.sheets ?? {
    scoring: Boolean(input.scoringCategories),
    rules: input.eligibility != null,
    ranges: input.ranges.length > 0,
  }
  requireColumns(input.questions, questionColumns, 1, issues)
  requireColumns(input.categories, categoryColumns, 1, issues)
  if (input.ranges.length > 0) requireColumns(input.ranges, rangeColumns, 1, issues)
  if ((input.scoringCategories ?? []).length > 0) requireColumns(input.scoringCategories ?? [], scoringCategoryColumns, 1, issues)
  if ((input.conditions ?? []).length > 0) requireColumns(input.conditions ?? [], ["question_id", "condition_order", "condition_mode", "condition_question_id", "condition_operator", "condition_value"], 1, issues)
  if ((input.eligibility ?? []).length > 0) requireColumns(input.eligibility ?? [], eligibilityColumns, 1, issues)
  if (issues.length > 0) return { draft: null, issues }

  if (input.questions.length > QUESTIONNAIRE_IMPORT_MAX_QUESTIONS) {
    issues.push(issue(input.questions.length, "question", `500 questions maximum. ${input.questions.length} détectées.`))
  }

  const categories: ImportCategory[] = []
  const categoryNames = new Set<string>()
  input.categories.forEach((row, index) => {
    const line = index + 2
    const name = text(cell(row, "name"))
    if (name.length < 2) issues.push(issue(line, "name", "Le nom de catégorie est requis."))
    if (categoryNames.has(name)) issues.push(issue(line, "name", `Catégorie "${name}" en double.`))
    categoryNames.add(name)
    const weight = parseNumber(cell(row, "weight"), line, "weight", issues, true)
    const order = parseNumber(cell(row, "order"), line, "order", issues, true)
    if (weight != null && (weight <= 0 || weight > 100)) issues.push(issue(line, "weight", "Le poids doit être compris entre 0 et 100, exclu de 0."))
    categories.push({
      ref: text(cell(row, "category_id")) || `CAT${String(index + 1).padStart(3, "0")}`,
      name,
      description: text(cell(row, "description")),
      weight: weight ?? 1,
      order: order ?? index + 1,
      highMessage: text(cell(row, "high_message")),
      mediumMessage: text(cell(row, "medium_message")),
      lowMessage: text(cell(row, "low_message")),
    })
  })

  const seenRefs = new Set<string>()
  const seenOrders = new Set<number>()
  const questions: ImportQuestion[] = []
  input.questions.forEach((row, index) => {
    const line = index + 2
    const ref = text(cell(row, "question_id")) || `Q${String(index + 1).padStart(3, "0")}`
    if (seenRefs.has(ref)) issues.push(issue(line, "question_id", `Identifiant "${ref}" en double.`))
    seenRefs.add(ref)
    const order = parseNumber(cell(row, "order"), line, "order", issues, true)
    if (order != null && (!Number.isInteger(order) || order < 1)) issues.push(issue(line, "order", "L'ordre doit être un entier supérieur ou égal à 1."))
    if (order != null && seenOrders.has(order)) issues.push(issue(line, "order", `Ordre ${order} en double.`))
    if (order != null) seenOrders.add(order)
    const rawType = text(cell(row, "question_type"))
    if (!isQuestionType(rawType)) {
      issues.push(issue(line, "question_type", `Type "${rawType}" invalide. Valeurs autorisées : ${questionTypes.join(", ")}.`))
    }
    const title = text(cell(row, "question"))
    if (title.length < 2) issues.push(issue(line, "question", "La question ne peut pas être vide."))
    const category = text(cell(row, "category"))
    if (category && !categoryNames.has(category)) issues.push(issue(line, "category", `Catégorie "${category}" introuvable.`))
    const type = isQuestionType(rawType) ? rawType : "short_text"
    const options: ImportQuestion["options"] = []
    for (let slot = 1; slot <= 6; slot += 1) {
      const label = text(cell(row, `option_${slot}`))
      const rawScore = cell(row, `option_${slot}_score`)
      const hasScore = rawScore != null && rawScore !== ""
      if (!label && hasScore) {
        parseNumber(rawScore, line, `option_${slot}_score`, issues, true)
        issues.push(issue(line, `option_${slot}`, "Un score est indiqué sans libellé d'option."))
      }
      if (!label) continue
      const score = parseNumber(rawScore, line, `option_${slot}_score`, issues, true)
      options.push({ label, value: text(cell(row, `option_${slot}_value`)), score: score ?? 0, position: options.length })
    }
    if (choiceQuestionTypes.includes(type) && options.length < 2) {
      issues.push(issue(line, "option_1", "Une question à choix requiert au moins deux options."))
    }
    if (optionFreeTypes.includes(type) && options.length > 0) {
      issues.push(issue(line, "option_1", "Ce type de question n'accepte pas d'options."))
    }
    questions.push({
      ref,
      order: order ?? index + 1,
      category,
      scoringCategory: text(cell(row, "scoring_category")),
      type,
      title,
      description: text(cell(row, "description")),
      required: parseBoolean(cell(row, "required"), line, "required", issues),
      isScored: parseBoolean(cell(row, "is_scored"), line, "is_scored", issues),
      options,
      display: null,
      displays: [],
    })
  })
  questions.forEach((question, index) => {
    const row = input.questions[index]
    if (!row) return
    const single = parseDisplay(row, index + 2, question, questions, issues)
    question.display = single
    question.displays = single ? [single] : []
  })
  applyConditionSheet(input.conditions ?? [], questions, issues)

  const ranges: ImportRange[] = []
  input.ranges.forEach((row, index) => {
    const line = index + 2
    const minScore = parseNumber(cell(row, "min_score"), line, "min_score", issues, true)
    const maxScore = parseNumber(cell(row, "max_score"), line, "max_score", issues, true)
    if (minScore != null && (minScore < 0 || minScore > 100)) issues.push(issue(line, "min_score", "Le score minimum doit être compris entre 0 et 100."))
    if (maxScore != null && (maxScore < 0 || maxScore > 100)) issues.push(issue(line, "max_score", "Le score maximum doit être compris entre 0 et 100."))
    if (minScore != null && maxScore != null && minScore > maxScore) issues.push(issue(line, "max_score", "Le maximum doit être supérieur ou égal au minimum."))
    const label = text(cell(row, "label"))
    const title = text(cell(row, "title"))
    if (label.length < 2) issues.push(issue(line, "label", "Le libellé de palier est requis."))
    if (title.length < 2) issues.push(issue(line, "title", "Le titre de palier est requis."))
    const ctaUrl = text(cell(row, "cta_url"))
    if (ctaUrl && !z.string().url().safeParse(ctaUrl).success) issues.push(issue(line, "cta_url", "Indiquez une URL valide."))
    ranges.push({
      ref: text(cell(row, "range_id")),
      minScore: minScore ?? 0,
      maxScore: maxScore ?? 0,
      label,
      title,
      description: text(cell(row, "description")),
      badge: text(cell(row, "badge")),
      ctaLabel: text(cell(row, "cta_label")),
      ctaUrl,
    })
  })

  const scoringCategories = parseScoringCategories(input.scoringCategories ?? [], issues)
  const rules = input.eligibility == null ? null : parseEligibility(input.eligibility, questions, ranges, issues)

  if (input.questions.length === 0) issues.push(issue(2, "question", "Aucune question à importer."))
  if (issues.length > 0) return { draft: null, issues }
  return {
    draft: { source: input.source, categories, scoringCategories, questions, ranges, rules, sheets, unknownTypes: [] },
    issues: [],
  }
}

const operatorAliases: Record<string, EligibilityOperator> = {
  equals: "eq",
  eq: "eq",
  not_equals: "neq",
  neq: "neq",
  lt: "lt",
  lte: "lte",
  gt: "gt",
  gte: "gte",
}

function parseDisplay(row: Record<string, unknown>, line: number, current: ImportQuestion, questions: ImportQuestion[], issues: ImportIssue[]): ImportDisplay | null {
  const mode = text(cell(row, "condition_mode")).toLowerCase()
  const sourceRef = text(cell(row, "condition_question_id"))
  const operatorText = text(cell(row, "condition_operator")).toLowerCase()
  const value = text(cell(row, "condition_value"))
  if (!mode && !sourceRef && !operatorText && !value) return null
  if (mode === "always") return null
  if (mode !== "show_if" && mode !== "hide_if") {
    issues.push(issue(line, "condition_mode", "Utilisez show_if, hide_if, ou laissez vide."))
    return null
  }
  const operator = operatorAliases[operatorText]
  if (!operator) issues.push(issue(line, "condition_operator", "Opérateur inconnu. Utilisez equals, not_equals, lt, lte, gt ou gte."))
  if (!value) issues.push(issue(line, "condition_value", "Indiquez la valeur de la condition."))
  const source = questions.find((question) => question.ref === sourceRef)
  if (!source) issues.push(issue(line, "condition_question_id", "La question source est introuvable dans ce fichier."))
  else if (current && source.order >= current.order) issues.push(issue(line, "condition_question_id", "La condition doit viser une question précédente."))
  else if (operator && !operatorsForQuestion(source.type).includes(operator)) issues.push(issue(line, "condition_operator", "Cet opérateur ne correspond pas au type de question."))
  else if (choiceQuestionTypes.includes(source.type) && value && !source.options.some((option) => option.label.trim().toLowerCase() === value.toLowerCase())) {
    issues.push(issue(line, "condition_value", "La valeur doit correspondre au libellé d'une option de la question précédente."))
  }
  if (!operator || !source) return null
  return { mode, sourceRef, operator, value }
}

function applyConditionSheet(rows: Record<string, unknown>[], questions: ImportQuestion[], issues: ImportIssue[]) {
  const grouped = new Map<string, { order: number; display: ImportDisplay }[]>()
  rows.forEach((row, index) => {
    const line = index + 2
    const ref = text(cell(row, "question_id"))
    const current = questions.find((question) => question.ref === ref)
    if (!current) {
      issues.push(issue(line, "question_id", "Question inconnue dans la feuille Conditions."))
      return
    }
    const order = parseNumber(cell(row, "condition_order"), line, "condition_order", issues, true) ?? index + 1
    const display = parseDisplay(row, line, current, questions, issues)
    if (!display) return
    const list = grouped.get(ref) ?? []
    list.push({ order, display })
    grouped.set(ref, list)
  })
  for (const [ref, list] of grouped) {
    const question = questions.find((item) => item.ref === ref)
    if (!question) continue
    const sorted = list.sort((left, right) => left.order - right.order).map((item) => item.display)
    const mode = sorted[0]?.mode
    if (sorted.some((item) => item.mode !== mode)) {
      issues.push(issue(question.order + 1, "condition_mode", "Les conditions d'une question utilisent un seul mode, combinées par ET."))
      continue
    }
    question.displays = sorted
    question.display = sorted[0] ?? null
  }
}

function parseScoringCategories(rows: Record<string, unknown>[], issues: ImportIssue[]): ImportScoringCategory[] {
  const names = new Set<string>()
  return rows.map((row, index) => {
    const line = index + 2
    const name = text(cell(row, "name"))
    if (name.length < 2) issues.push(issue(line, "name", "Le nom de la catégorie de scoring est requis."))
    if (names.has(name)) issues.push(issue(line, "name", `Catégorie de scoring « ${name} » en double.`))
    names.add(name)
    const weight = parseNumber(cell(row, "weight"), line, "weight", issues, true)
    const maxScore = parseNumber(cell(row, "max_score"), line, "max_score", issues, true)
    const order = parseNumber(cell(row, "order"), line, "order", issues, true)
    if (weight != null && (weight <= 0 || weight > 100)) issues.push(issue(line, "weight", "Le poids doit être compris entre 0 et 100, exclu de 0."))
    if (maxScore != null && maxScore <= 0) issues.push(issue(line, "max_score", "Le score maximum doit être supérieur à 0."))
    return {
      ref: text(cell(row, "scoring_category_id")) || `SC${String(index + 1).padStart(3, "0")}`,
      name,
      description: text(cell(row, "description")),
      weight: weight ?? 1,
      maxScore: maxScore ?? 100,
      order: order ?? index + 1,
      highMessage: text(cell(row, "high_message")),
      mediumMessage: text(cell(row, "medium_message")),
      lowMessage: text(cell(row, "low_message")),
    }
  })
}

const actionAliases: Record<string, "force_result" | "max_result"> = {
  force_result: "force_result",
  force: "force_result",
  "force result": "force_result",
  max_result: "max_result",
  maximum: "max_result",
  "maximum result": "max_result",
}

function parseEligibility(rows: Record<string, unknown>[], questions: ImportQuestion[], ranges: ImportRange[], issues: ImportIssue[]): ImportEligibilityRule[] {
  const grouped = new Map<string, { order: number; row: Record<string, unknown>; line: number }[]>()
  rows.forEach((row, index) => {
    const line = index + 2
    const ref = text(cell(row, "rule_id")) || `R${String(index + 1).padStart(3, "0")}`
    const order = parseNumber(cell(row, "condition_order"), line, "condition_order", issues, true) ?? index + 1
    const list = grouped.get(ref) ?? []
    list.push({ order, row, line })
    grouped.set(ref, list)
  })
  const rules: ImportEligibilityRule[] = []
  for (const [ref, list] of grouped) {
    const sorted = list.sort((left, right) => left.order - right.order)
    const first = sorted[0]
    if (!first) continue
    const action = actionAliases[text(cell(first.row, "action")).toLowerCase()]
    if (!action) issues.push(issue(first.line, "action", "Choisissez Forcer le résultat ou Résultat maximum."))
    const target = text(cell(first.row, "target_result"))
    if (!target) issues.push(issue(first.line, "target_result", "Indiquez le résultat visé."))
    else if (!ranges.some((range) => range.ref === target || range.label.toLowerCase() === target.toLowerCase())) {
      issues.push(issue(first.line, "target_result", "Ce résultat est introuvable dans le fichier."))
    }
    const ruleOrder = parseNumber(cell(first.row, "order"), first.line, "order", issues, true) ?? rules.length + 1
    const conditions = sorted.flatMap((item) => {
      const operator = operatorAliases[text(cell(item.row, "operator")).toLowerCase()]
      const sourceRef = text(cell(item.row, "condition_question_id"))
      const value = text(cell(item.row, "condition_value"))
      const source = questions.find((question) => question.ref === sourceRef)
      if (!operator) issues.push(issue(item.line, "operator", "Opérateur inconnu."))
      if (!value) issues.push(issue(item.line, "condition_value", "Indiquez la valeur de la condition."))
      if (!source) issues.push(issue(item.line, "condition_question_id", "La question source est introuvable dans ce fichier."))
      else if (operator && !operatorsForQuestion(source.type).includes(operator)) issues.push(issue(item.line, "operator", "Cet opérateur ne correspond pas au type de question."))
      else if (choiceQuestionTypes.includes(source.type) && value && !source.options.some((option) => option.label.trim().toLowerCase() === value.toLowerCase() || option.value.trim().toLowerCase() === value.toLowerCase())) {
        issues.push(issue(item.line, "condition_value", "La valeur doit correspondre à une option de la question."))
      }
      if (!operator || !source || !value) return []
      return [{ sourceRef, operator, value }]
    })
    if (!action || conditions.length === 0) continue
    rules.push({
      ref,
      name: text(cell(first.row, "name")) || `Règle ${rules.length + 1}`,
      order: ruleOrder,
      action,
      target,
      conditions,
    })
  }
  return rules.sort((left, right) => left.order - right.order)
}

const draftSchema = z.object({
  source: z.enum(["woloyem_excel", "scoreapp_excel", "scoreapp_api"]),
  categories: z.array(z.object({
    ref: z.string().max(80),
    name: z.string().trim().min(2).max(80),
    description: z.string().max(300),
    weight: z.number().positive().max(100),
    order: z.number().int(),
    highMessage: z.string().max(500),
    mediumMessage: z.string().max(500),
    lowMessage: z.string().max(500),
  })).max(100),
  scoringCategories: z.array(z.object({
    ref: z.string().max(80),
    name: z.string().trim().min(2).max(80),
    description: z.string().max(300),
    weight: z.number().positive().max(100),
    maxScore: z.number().positive().max(10000),
    order: z.number().int(),
    highMessage: z.string().max(500),
    mediumMessage: z.string().max(500),
    lowMessage: z.string().max(500),
  })).max(100).optional().default([]),
  questions: z.array(z.object({
    ref: z.string().max(80),
    order: z.number().int().min(1),
    category: z.string().max(80),
    scoringCategory: z.string().max(80).optional().default(""),
    type: z.enum(questionTypes),
    title: z.string().trim().min(2).max(300),
    description: z.string().max(800),
    required: z.boolean(),
    isScored: z.boolean(),
    options: z.array(z.object({
      label: z.string().trim().min(1).max(200),
      value: z.string().max(120).optional().default(""),
      score: z.number().finite(),
      position: z.number().int().min(0),
    })).max(6),
    display: z.object({
      mode: z.enum(["show_if", "hide_if"]),
      sourceRef: z.string().trim().min(1).max(80),
      operator: z.enum(["eq", "neq", "lt", "lte", "gt", "gte"]),
      value: z.string().trim().min(1).max(200),
    }).nullable().default(null),
    displays: z.array(z.object({
      mode: z.enum(["show_if", "hide_if"]),
      sourceRef: z.string().trim().min(1).max(80),
      operator: z.enum(["eq", "neq", "lt", "lte", "gt", "gte"]),
      value: z.string().trim().min(1).max(200),
    })).max(8).optional().default([]),
  })).min(1).max(500),
  ranges: z.array(z.object({
    ref: z.string().max(80).optional().default(""),
    minScore: z.number().min(0).max(100),
    maxScore: z.number().min(0).max(100),
    label: z.string().trim().min(2).max(80),
    title: z.string().trim().min(2).max(180),
    description: z.string().max(600),
    badge: z.string().max(40),
    ctaLabel: z.string().max(80),
    ctaUrl: z.string().max(400),
  })).max(20),
  rules: z.array(z.object({
    ref: z.string().max(80),
    name: z.string().max(120),
    order: z.number().int(),
    action: z.enum(["force_result", "max_result"]),
    target: z.string().min(1).max(80),
    conditions: z.array(z.object({
      sourceRef: z.string().min(1).max(80),
      operator: z.enum(["eq", "neq", "lt", "lte", "gt", "gte"]),
      value: z.string().min(1).max(200),
    })).min(1).max(8),
  })).max(30).nullable().optional().default(null),
  sheets: z.object({
    scoring: z.boolean(),
    rules: z.boolean(),
    ranges: z.boolean(),
  }).optional().default({ scoring: false, rules: false, ranges: false }),
  unknownTypes: z.array(z.object({
    row: z.number().int(),
    rawType: z.string().max(80),
    title: z.string().max(300),
  })).max(500),
}).superRefine((draft, context) => {
  const names = new Set(draft.categories.map((category) => category.name))
  const orders = new Set<number>()
  draft.questions.forEach((question, index) => {
    if (orders.has(question.order)) context.addIssue({ code: "custom", message: `Ligne ${index + 2}, order : Ordre ${question.order} en double.` })
    orders.add(question.order)
    if (question.category && !names.has(question.category)) {
      context.addIssue({ code: "custom", message: `Ligne ${index + 2}, category : Catégorie "${question.category}" introuvable.` })
    }
    if (choiceQuestionTypes.includes(question.type) && question.options.length < 2) {
      context.addIssue({ code: "custom", message: `Ligne ${index + 2}, option_1 : Une question à choix requiert au moins deux options.` })
    }
    if (optionFreeTypes.includes(question.type) && question.options.length > 0) {
      context.addIssue({ code: "custom", message: `Ligne ${index + 2}, option_1 : Ce type de question n'accepte pas d'options.` })
    }
  })
})

export function parseImportDraft(value: unknown) {
  return draftSchema.safeParse(value)
}

export function optionValue(label: string, index: number) {
  return slugify(label) || `option-${index + 1}`
}
