import ExcelJS from "exceljs"
import type { BuilderBundle } from "@/types/builder"
import {
  categoryColumns,
  conditionColumns,
  conditionSheetColumns,
  eligibilityColumns,
  questionColumns,
  questionOptionalColumns,
  rangeColumns,
  scoringCategoryColumns,
  type ImportDisplay,
} from "@/lib/importers/model"

const questionHeaders = [...questionColumns, ...questionOptionalColumns, ...conditionColumns]

type WorkbookOption = { label: string; value: string; score: number }
type WorkbookQuestion = {
  id: string
  order: number
  category: string
  scoringCategory: string
  type: string
  title: string
  description: string
  required: boolean
  scored: boolean
  options: WorkbookOption[]
  displays: ImportDisplay[]
}

export type ScorecardWorkbook = {
  title: string
  questions: WorkbookQuestion[]
  categories: { id: string; name: string; description: string; weight: number; order: number }[]
  scoringCategories: { id: string; name: string; description: string; weight: number; maxScore: number; order: number; highMessage: string; mediumMessage: string; lowMessage: string }[]
  ranges: { id: string; min: number; max: number; label: string; title: string; description: string; badge: string; ctaLabel: string; ctaUrl: string }[]
  rules: { id: string; name: string; order: number; action: "force_result" | "max_result"; target: string; conditions: { sourceRef: string; operator: ImportDisplay["operator"]; value: string }[] }[]
}

function cell(value: string | number | boolean) {
  if (typeof value === "string" && /^[=+@\t\r]/.test(value)) return `'${value}`
  return value
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1)
  header.font = { bold: true }
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3E6C8" } }
  sheet.views = [{ state: "frozen", ySplit: 1 }]
  sheet.columns.forEach((column) => {
    column.width = Math.min(36, Math.max(16, String(column.header ?? "").length + 4))
  })
}

function conditionLabel(questions: WorkbookQuestion[], sourceRef: string, value: string) {
  const source = questions.find((question) => question.id === sourceRef)
  const option = source?.options.find((item) => item.value === value || item.label.trim().toLowerCase() === value.trim().toLowerCase())
  return option?.label ?? value
}

export function workbookFromBundle(bundle: BuilderBundle): ScorecardWorkbook {
  const categoryName = new Map(bundle.questionCategories.map((category) => [category.id, category.name]))
  const scoringName = new Map(bundle.scoringCategories.map((category) => [category.id, category.name]))
  const questions: WorkbookQuestion[] = bundle.questions.map((question) => ({
    id: question.id,
    order: question.position + 1,
    category: question.questionCategoryId ? categoryName.get(question.questionCategoryId) ?? "" : "",
    scoringCategory: question.scoringCategoryId ? scoringName.get(question.scoringCategoryId) ?? "" : "",
    type: question.type,
    title: question.title,
    description: question.description,
    required: question.isRequired,
    scored: question.isScored,
    options: question.options.map((option) => ({ label: option.label, value: option.value || option.id, score: option.score })),
    displays: (question.displayRule?.conditions ?? []).map((condition) => ({
      mode: question.displayRule?.mode ?? "show_if",
      sourceRef: condition.questionId,
      operator: condition.operator,
      value: condition.value,
    })),
  }))
  const optionLabel = (questionId: string, value: string) => {
    const question = questions.find((item) => item.id === questionId)
    const option = question?.options.find((item) => item.value === value || item.label.trim().toLowerCase() === value.trim().toLowerCase())
    return option?.label ?? value
  }
  for (const question of questions) {
    question.displays = question.displays.map((display) => ({ ...display, value: optionLabel(display.sourceRef, display.value) }))
  }
  return {
    title: bundle.scorecard.name,
    questions,
    categories: bundle.questionCategories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      weight: category.weight,
      order: category.position + 1,
    })),
    scoringCategories: bundle.scoringCategories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      weight: category.weight,
      maxScore: category.maxScore,
      order: category.position + 1,
      highMessage: category.highMessage,
      mediumMessage: category.mediumMessage,
      lowMessage: category.lowMessage,
    })),
    ranges: [...bundle.ranges].sort((left, right) => left.position - right.position).map((range) => ({
      id: range.id,
      min: range.minPercent,
      max: range.maxPercent,
      label: range.label,
      title: range.title,
      description: range.description,
      badge: range.badge,
      ctaLabel: range.ctaLabel,
      ctaUrl: range.ctaUrl,
    })),
    rules: bundle.rules.map((rule, index) => ({
      id: rule.id,
      name: `Règle ${index + 1}`,
      order: index + 1,
      action: rule.action,
      target: rule.resultRangeId,
      conditions: rule.conditions.map((condition) => ({
        sourceRef: condition.questionId,
        operator: condition.operator,
        value: optionLabel(condition.questionId, condition.value),
      })),
    })),
  }
}

export async function buildScorecardWorkbook(input: ScorecardWorkbook) {
  for (const question of input.questions) {
    if (question.options.length > 6) return { error: `« ${question.title} » a ${question.options.length} options. Le fichier Excel en conserve 6. Réduisez-les avant d'exporter.` }
    if (question.displays.length > 8) return { error: `« ${question.title} » a ${question.displays.length} conditions. L'export est interrompu pour ne pas en perdre.` }
  }
  for (const rule of input.rules) {
    if (rule.conditions.length > 8) return { error: `${rule.name} a plus de 8 conditions. L'export est interrompu pour ne pas en perdre.` }
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = "WOLOYEM Score"
  const guide = workbook.addWorksheet("Instructions")
  guide.getColumn(1).width = 110
  ;[
    "Export WOLOYEM Score. Modifiez ce fichier puis réimportez-le avec « Mettre à jour le questionnaire existant ».",
    "Ne renommez pas les colonnes. N'utilisez pas de formules.",
    "Les identifiants permettent de reconnaître les questions de cette scorecard. Une question absente du fichier n'est pas supprimée sans confirmation.",
    "Plusieurs conditions ET : feuille Conditions, une ligne par condition, même question_id.",
    "Règles obligatoires : une ligne par condition, même identifiant de règle. Action : force_result (Forcer le résultat) ou max_result (Résultat maximum).",
  ].forEach((line, index) => {
    guide.getCell(index + 1, 1).value = line
  })

  const questions = workbook.addWorksheet("Questions")
  questions.columns = questionHeaders.map((header) => ({ header, key: header }))
  input.questions.forEach((question) => {
    const first = question.displays[0]
    const row: Record<string, string | number | boolean> = {
      question_id: question.id,
      order: question.order,
      category: cell(question.category),
      scoring_category: cell(question.scoringCategory),
      question_type: question.type,
      question: cell(question.title),
      description: cell(question.description),
      required: question.required,
      is_scored: question.scored,
      condition_mode: first?.mode ?? "",
      condition_question_id: first?.sourceRef ?? "",
      condition_operator: first ? operatorLabel(first.operator) : "",
      condition_value: first ? cell(conditionLabel(input.questions, first.sourceRef, first.value)) : "",
    }
    question.options.forEach((option, index) => {
      const slot = index + 1
      row[`option_${slot}`] = cell(option.label)
      row[`option_${slot}_score`] = option.score
      row[`option_${slot}_value`] = cell(option.value)
    })
    questions.addRow(row)
  })
  styleHeader(questions)

  const categories = workbook.addWorksheet("Categories")
  categories.columns = categoryColumns.map((header) => ({ header, key: header }))
  input.categories.forEach((category) => {
    categories.addRow({
      category_id: category.id,
      name: cell(category.name),
      description: cell(category.description),
      weight: category.weight,
      order: category.order,
      high_message: "",
      medium_message: "",
      low_message: "",
    })
  })
  styleHeader(categories)

  const scoring = workbook.addWorksheet("Scoring Categories")
  scoring.columns = scoringCategoryColumns.map((header) => ({ header, key: header }))
  input.scoringCategories.forEach((category) => {
    scoring.addRow({
      scoring_category_id: category.id,
      name: cell(category.name),
      description: cell(category.description),
      weight: category.weight,
      max_score: category.maxScore,
      order: category.order,
      high_message: cell(category.highMessage),
      medium_message: cell(category.mediumMessage),
      low_message: cell(category.lowMessage),
    })
  })
  styleHeader(scoring)

  const ranges = workbook.addWorksheet("Result Ranges")
  ranges.columns = [...rangeColumns, "range_id"].map((header) => ({ header, key: header }))
  input.ranges.forEach((range) => {
    ranges.addRow({
      min_score: range.min,
      max_score: range.max,
      label: cell(range.label),
      title: cell(range.title),
      description: cell(range.description),
      badge: cell(range.badge),
      cta_label: cell(range.ctaLabel),
      cta_url: cell(range.ctaUrl),
      range_id: range.id,
    })
  })
  styleHeader(ranges)

  const conditions = workbook.addWorksheet("Conditions")
  conditions.columns = conditionSheetColumns.map((header) => ({ header, key: header }))
  for (const question of input.questions) {
    question.displays.forEach((display, index) => {
      conditions.addRow({
        question_id: question.id,
        condition_order: index + 1,
        condition_mode: display.mode,
        condition_question_id: display.sourceRef,
        condition_operator: operatorLabel(display.operator),
        condition_value: cell(conditionLabel(input.questions, display.sourceRef, display.value)),
      })
    })
  }
  styleHeader(conditions)

  const rules = workbook.addWorksheet("Eligibility Rules")
  rules.columns = eligibilityColumns.map((header) => ({ header, key: header }))
  for (const rule of input.rules) {
    rule.conditions.forEach((condition, index) => {
      rules.addRow({
        rule_id: rule.id,
        name: cell(rule.name),
        condition_order: index + 1,
        condition_question_id: condition.sourceRef,
        operator: operatorLabel(condition.operator),
        condition_value: cell(conditionLabel(input.questions, condition.sourceRef, condition.value)),
        action: rule.action,
        target_result: rule.target,
        order: rule.order,
      })
    })
  }
  styleHeader(rules)

  const bytes = await workbook.xlsx.writeBuffer()
  const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40) || "questionnaire"
  return { filename: `WOLOYEM-${slug}.xlsx`, bytes: Buffer.from(bytes) }
}

function operatorLabel(operator: ImportDisplay["operator"]) {
  if (operator === "eq") return "equals"
  if (operator === "neq") return "not_equals"
  return operator
}
