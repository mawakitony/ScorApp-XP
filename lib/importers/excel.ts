import ExcelJS from "exceljs"
import { QUESTIONNAIRE_IMPORT_BYTES, QUESTIONNAIRE_IMPORT_MAX_QUESTIONS } from "@/lib/security/limits"
import { questionTypes } from "@/lib/validators/builder"
import { categoryColumns, conditionColumns, conditionSheetColumns, eligibilityColumns, questionColumns, questionOptionalColumns, rangeColumns, scoringCategoryColumns, type ImportIssue, type ImportSource } from "@/lib/importers/model"
import { validateQuestionnaireTables } from "@/lib/importers/validate"

const TEMPLATE_NAME = "WOLOYEM-Score-Questionnaire-Template.xlsx"

const instructions = [
  "Modèle officiel WOLOYEM Score. Remplissez ce fichier puis réimportez-le dans le Question Builder.",
  "Ne renommez pas les colonnes.",
  "Une ligne = une question.",
  `Utilisez uniquement les types : ${questionTypes.join(", ")}.`,
  "TRUE ou FALSE pour les colonnes required et is_scored.",
  "Les scores sont numériques. Ils sont conservés tels quels, sans recalcul.",
  "Le nom de catégorie d'une question doit correspondre exactement à la feuille Categories.",
  "question_id est une référence locale (Q001). Ne la modifiez pas inutilement. Elle ne devient pas l'identifiant Supabase.",
  "Le format .xlsx est recommandé. Aucune macro n'est incluse.",
  "N'utilisez pas de formules. Toute cellule commençant par =, + ou @ est refusée.",
  "Affichage conditionnel : condition_mode = show_if ou hide_if, condition_question_id = question précédente, condition_operator = equals, not_equals, lt, lte, gt ou gte, condition_value = libellé ou nombre.",
  "Plusieurs conditions ET : une ligne par condition dans la feuille Conditions (question_id, condition_order, puis les mêmes colonnes). Si cette feuille contient la question, elle remplace les quatre colonnes de la ligne.",
  "Laissez les colonnes vides pour toujours afficher la question. Les anciens fichiers sans ces colonnes restent valides.",
  "scoring_category et option_N_value sont facultatives. La feuille Scoring Categories porte le poids et le score maximum. La feuille Eligibility Rules porte les règles obligatoires : une ligne par condition ET, même rule_id.",
  "range_id, question_id et rule_id exportés sont les identifiants de cette scorecard. Ne les copiez pas vers une autre scorecard.",
  `Limites : ${QUESTIONNAIRE_IMPORT_BYTES / 1_000_000} Mo et ${QUESTIONNAIRE_IMPORT_MAX_QUESTIONS} questions.`,
]

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1)
  header.font = { bold: true, color: { argb: "FF1F2933" } }
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3E6C8" } }
  header.alignment = { vertical: "middle" }
  sheet.views = [{ state: "frozen", ySplit: 1 }]
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } }
  sheet.columns.forEach((column) => {
    column.width = Math.min(36, Math.max(16, String(column.header ?? "").length + 4))
  })
}

export async function buildQuestionnaireTemplate() {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "WOLOYEM Score"
  const guide = workbook.addWorksheet("Instructions")
  guide.getColumn(1).width = 110
  instructions.forEach((line, index) => {
    guide.getCell(index + 1, 1).value = line
  })
  guide.getCell(1, 1).font = { bold: true, size: 14 }

  const questions = workbook.addWorksheet("Questions")
  questions.columns = [...questionColumns, ...conditionColumns].map((header) => ({ header, key: header }))
  questions.addRow({
    question_id: "Q001",
    order: 1,
    category: "Experience",
    question_type: "single_choice",
    question: "Combien d'années d'expérience avez-vous en gestion de projet ?",
    description: "Sélectionnez la réponse la plus proche.",
    required: true,
    is_scored: true,
    option_1: "Moins de 1 an",
    option_1_score: 0,
    option_2: "1 à 2 ans",
    option_2_score: 25,
    option_3: "3 à 5 ans",
    option_3_score: 60,
    option_4: "Plus de 5 ans",
    option_4_score: 100,
  })
  styleHeader(questions)
  for (let row = 2; row <= 501; row += 1) {
    questions.getCell(row, 4).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`"${questionTypes.join(",")}"`],
    }
    questions.getCell(row, 7).dataValidation = { type: "list", allowBlank: false, formulae: ['"TRUE,FALSE"'] }
    questions.getCell(row, 8).dataValidation = { type: "list", allowBlank: false, formulae: ['"TRUE,FALSE"'] }
  }

  const categories = workbook.addWorksheet("Categories")
  categories.columns = categoryColumns.map((header) => ({ header, key: header }))
  categories.addRow({
    category_id: "CAT001",
    name: "Experience",
    description: "Expérience en gestion de projet",
    weight: 40,
    order: 1,
    high_message: "Solide expérience",
    medium_message: "Bonne base",
    low_message: "Expérience à renforcer",
  })
  styleHeader(categories)

  const ranges = workbook.addWorksheet("Result Ranges")
  ranges.columns = rangeColumns.map((header) => ({ header, key: header }))
  ranges.addRow({
    min_score: 0,
    max_score: 39,
    label: "needs_preparation",
    title: "Préparation nécessaire",
    description: "Vous devez encore renforcer certains fondamentaux.",
    badge: "Needs Preparation",
    cta_label: "Découvrir nos formations",
    cta_url: "https://woloyem.com",
  })
  styleHeader(ranges)

  const bytes = await workbook.xlsx.writeBuffer()
  return { filename: TEMPLATE_NAME, bytes: Buffer.from(bytes) }
}

function formulaMessage(sheet: string, row: number, column: string): ImportIssue {
  return { row, column: `${sheet}.${column}`, message: "Les formules Excel ne sont pas acceptées. Saisissez une valeur." }
}

function readCell(cell: ExcelJS.Cell, sheet: string, column: string, issues: ImportIssue[]) {
  const value = cell.value
  if (value == null) return ""
  if (typeof value === "object" && ("formula" in value || "sharedFormula" in value)) {
    issues.push(formulaMessage(sheet, Number(cell.row), column))
    return ""
  }
  if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join("")
  }
  if (typeof value === "object" && "text" in value && "hyperlink" in value) return String(value.text)
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/^'(?=[=+@])/, "")
    if (trimmed.startsWith("=") || trimmed.startsWith("+") || trimmed.startsWith("@")) {
      issues.push(formulaMessage(sheet, Number(cell.row), column))
      return ""
    }
    return trimmed
  }
  return value
}

function sheetRows(sheet: ExcelJS.Worksheet | undefined, columns: readonly string[], issues: ImportIssue[], optional: readonly string[] = []) {
  if (!sheet) return []
  const header = sheet.getRow(1)
  const keys = columns.map((column, index) => {
    const found = String(header.getCell(index + 1).value ?? "").trim()
    if (found !== column) issues.push({ row: 1, column, message: `Colonne attendue "${column}", trouvée "${found || "(vide)"}".` })
    return column
  })
  const optionalIndex = new Map<string, number>()
  header.eachCell((cell, columnNumber) => {
    const name = String(cell.value ?? "").trim()
    if ((optional as readonly string[]).includes(name)) optionalIndex.set(name, columnNumber)
  })
  const rows: Record<string, unknown>[] = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const record: Record<string, unknown> = {}
    let empty = true
    keys.forEach((key, index) => {
      const value = readCell(row.getCell(index + 1), sheet.name, key, issues)
      if (value !== "" && value != null) empty = false
      record[key] = value
    })
    for (const [name, columnNumber] of optionalIndex) {
      const value = readCell(row.getCell(columnNumber), sheet.name, name, issues)
      if (value !== "" && value != null) empty = false
      record[name] = value
    }
    if (!empty) rows.push(record)
  })
  return rows
}

export async function parseQuestionnaireFile(input: { filename: string; bytes: Uint8Array; source?: ImportSource }) {
  const issues: ImportIssue[] = []
  if (input.bytes.byteLength <= 0 || input.bytes.byteLength > QUESTIONNAIRE_IMPORT_BYTES) {
    return { draft: null, issues: [{ row: 0, column: "file", message: "Le fichier dépasse 5 Mo ou est vide." }] }
  }
  const extension = input.filename.split(".").pop()?.toLowerCase() ?? ""
  if (extension !== "xlsx" && extension !== "csv") {
    return { draft: null, issues: [{ row: 0, column: "file", message: "Seuls les fichiers .xlsx et .csv sont acceptés." }] }
  }

  const workbook = new ExcelJS.Workbook()
  if (extension === "csv") {
    const text = new TextDecoder().decode(input.bytes)
    if (/^\s*[=+@]/m.test(text)) {
      return { draft: null, issues: [{ row: 0, column: "file", message: "Les formules Excel ne sont pas acceptées. Saisissez une valeur." }] }
    }
    const rows = parseCsv(text)
    const [header, ...body] = rows
    if (!header) return { draft: null, issues: [{ row: 1, column: "question_id", message: "Colonne obligatoire absente." }] }
    const questions = body.filter((row) => row.some((cell) => cell.trim())).map((row) => {
      const record: Record<string, unknown> = {}
      questionColumns.forEach((column, index) => {
        record[column] = row[index] ?? ""
      })
      header.forEach((name, index) => {
        if ((questionColumns as readonly string[]).includes(name) || (conditionColumns as readonly string[]).includes(name)) record[name] = row[index] ?? ""
      })
      return record
    })
    return validateQuestionnaireTables({
      source: input.source ?? "woloyem_excel",
      questions,
      categories: [],
      ranges: [],
    })
  }

  await workbook.xlsx.load(Buffer.from(input.bytes) as unknown as ExcelJS.Buffer)
  const questionsSheet = workbook.getWorksheet("Questions")
  const categoriesSheet = workbook.getWorksheet("Categories")
  const rangesSheet = workbook.getWorksheet("Result Ranges")
  const scoringSheet = workbook.getWorksheet("Scoring Categories")
  const conditionsSheet = workbook.getWorksheet("Conditions")
  const rulesSheet = workbook.getWorksheet("Eligibility Rules")
  const questions = sheetRows(questionsSheet, questionColumns, issues, [...conditionColumns, ...questionOptionalColumns])
  const categories = sheetRows(categoriesSheet, categoryColumns, issues)
  const ranges = sheetRows(rangesSheet, rangeColumns, issues, ["range_id"])
  const scoringCategories = sheetRows(scoringSheet, scoringCategoryColumns, issues)
  const conditions = sheetRows(conditionsSheet, conditionSheetColumns, issues)
  const eligibility = rulesSheet ? sheetRows(rulesSheet, eligibilityColumns, issues) : null
  if (issues.length > 0) return { draft: null, issues }
  return validateQuestionnaireTables({
    source: input.source ?? "woloyem_excel",
    questions,
    categories,
    ranges,
    scoringCategories,
    conditions,
    eligibility,
    sheets: { scoring: Boolean(scoringSheet), rules: Boolean(rulesSheet), ranges: Boolean(rangesSheet) },
  })
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted && char === '"' && text[index + 1] === '"') {
      cell += '"'
      index += 1
    } else if (char === '"') quoted = !quoted
    else if (char === "," && !quoted) {
      row.push(cell)
      cell = ""
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else cell += char
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

export { TEMPLATE_NAME }
