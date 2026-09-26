import assert from "node:assert/strict"
import test from "node:test"
import ExcelJS from "exceljs"
import { applyImportOrRollback, type ImportStore } from "./apply.ts"
import { buildQuestionnaireTemplate, parseQuestionnaireFile } from "./excel.ts"
import { questionnairePayload } from "./payload.ts"
import { mapScoreAppAnswerType, mapScoreAppQuestions } from "./scoreapp.ts"
import { validateQuestionnaireTables } from "./validate.ts"
import { QUESTIONNAIRE_IMPORT_BYTES } from "../security/limits.ts"
import { questionColumns } from "./model.ts"

async function workbookBytes(fill: (sheet: ExcelJS.Worksheet, categories: ExcelJS.Worksheet) => void) {
  const workbook = new ExcelJS.Workbook()
  const questions = workbook.addWorksheet("Questions")
  questions.addRow([...questionColumns])
  const categories = workbook.addWorksheet("Categories")
  categories.addRow(["category_id", "name", "description", "weight", "order", "high_message", "medium_message", "low_message"])
  workbook.addWorksheet("Result Ranges").addRow(["min_score", "max_score", "label", "title", "description", "badge", "cta_label", "cta_url"])
  fill(questions, categories)
  const bytes = await workbook.xlsx.writeBuffer()
  return new Uint8Array(bytes)
}

function row(values: Partial<Record<(typeof questionColumns)[number], string | number | boolean>>) {
  return questionColumns.map((column) => values[column] ?? "")
}

test("the official template parses and keeps example scores", async () => {
  const file = await buildQuestionnaireTemplate()
  assert.equal(file.filename, "WOLOYEM-Score-Questionnaire-Template.xlsx")
  const parsed = await parseQuestionnaireFile({ filename: file.filename, bytes: new Uint8Array(file.bytes) })
  assert.equal(parsed.issues.length, 0)
  assert.equal(parsed.draft?.questions[0]?.options.map((option) => option.score).join(","), "0,25,60,100")
  assert.equal(parsed.draft?.categories[0]?.name, "Experience")
  assert.equal(parsed.draft?.ranges[0]?.minScore, 0)
  assert.equal(parsed.draft?.ranges[0]?.maxScore, 39)
  const payload = questionnairePayload(parsed.draft!)
  const question = (payload as { questions: { options: { score: number }[] }[] }).questions[0]
  assert.deepEqual(question.options.map((option) => option.score), [0, 25, 60, 100])
})

test("missing column, invalid type, invalid score, missing category and duplicate order are named", async () => {
  const missing = await workbookBytes((sheet) => {
    sheet.getRow(1).getCell(1).value = "id"
  })
  const missingParsed = await parseQuestionnaireFile({ filename: "q.xlsx", bytes: missing })
  assert.match(missingParsed.issues[0]?.message ?? "", /Colonne attendue/)

  const invalid = await validateQuestionnaireTables({
    source: "woloyem_excel",
    categories: [{ category_id: "CAT001", name: "Experience", description: "", weight: 40, order: 1, high_message: "", medium_message: "", low_message: "" }],
    ranges: [],
    questions: [
      Object.fromEntries(row({ question_id: "Q001", order: 1, category: "Leadership", question_type: "matrix", question: "Question assez longue", required: "TRUE", is_scored: "TRUE", option_2_score: "fort" }).map((value, index) => [questionColumns[index], value])),
      Object.fromEntries(row({ question_id: "Q002", order: 1, category: "Experience", question_type: "short_text", question: "Autre question", required: "TRUE", is_scored: "FALSE" }).map((value, index) => [questionColumns[index], value])),
    ],
  })
  assert.equal(invalid.draft, null)
  assert.ok(invalid.issues.some((item) => item.column === "question_type" && item.row === 2))
  assert.ok(invalid.issues.some((item) => item.column === "option_2_score" && item.message.includes("fort")))
  assert.ok(invalid.issues.some((item) => item.column === "category" && item.message.includes("Leadership")))
  assert.ok(invalid.issues.some((item) => item.column === "order" && item.message.includes("double")))
})

test("multiple choice, yes/no and unscored text are accepted", () => {
  const parsed = validateQuestionnaireTables({
    source: "woloyem_excel",
    categories: [],
    ranges: [],
    questions: [
      Object.fromEntries(row({ question_id: "Q001", order: 1, question_type: "multiple_choice", question: "Quels outils utilisez-vous ?", required: "TRUE", is_scored: "TRUE", option_1: "Excel", option_1_score: 10, option_2: "Sheets", option_2_score: 5 }).map((value, index) => [questionColumns[index], value])),
      Object.fromEntries(row({ question_id: "Q002", order: 2, question_type: "yes_no", question: "Avez-vous déjà dirigé un projet ?", required: "TRUE", is_scored: "TRUE", option_1: "Oui", option_1_score: 100, option_2: "Non", option_2_score: 0 }).map((value, index) => [questionColumns[index], value])),
      Object.fromEntries(row({ question_id: "Q003", order: 3, question_type: "short_text", question: "Un commentaire libre", required: "FALSE", is_scored: "FALSE" }).map((value, index) => [questionColumns[index], value])),
    ],
  })
  assert.equal(parsed.issues.length, 0)
  assert.equal(parsed.draft?.questions[1]?.type, "yes_no")
  assert.equal(parsed.draft?.questions[2]?.isScored, false)
  assert.equal(parsed.draft?.questions[2]?.options.length, 0)
})

test("five hundred questions is the limit and an oversized file is refused", async () => {
  const questions = Array.from({ length: 501 }, (_, index) => Object.fromEntries(row({
    question_id: `Q${index + 1}`,
    order: index + 1,
    question_type: "short_text",
    question: `Question numéro ${index + 1}`,
    required: "FALSE",
    is_scored: "FALSE",
  }).map((value, position) => [questionColumns[position], value])))
  const limited = validateQuestionnaireTables({ source: "woloyem_excel", categories: [], ranges: [], questions })
  assert.equal(limited.draft, null)
  assert.match(limited.issues.map((item) => item.message).join(" "), /500/)
  const oversized = await parseQuestionnaireFile({ filename: "big.xlsx", bytes: new Uint8Array(QUESTIONNAIRE_IMPORT_BYTES + 1) })
  assert.match(oversized.issues[0]?.message ?? "", /5 Mo/)
})

test("a formula cell is rejected and never evaluated", async () => {
  const bytes = await workbookBytes((sheet, categories) => {
    categories.addRow(["CAT001", "Experience", "Desc", 40, 1, "", "", ""])
    sheet.addRow(row({ question_id: "Q001", order: 1, category: "Experience", question_type: "short_text", question: "Question sans formule", required: true, is_scored: false }))
    sheet.getCell("E2").value = { formula: "1+1", result: 2 }
  })
  const parsed = await parseQuestionnaireFile({ filename: "formula.xlsx", bytes })
  assert.equal(parsed.draft, null)
  assert.match(parsed.issues.map((item) => item.message).join(" "), /formule/i)
})

test("add keeps existing questions and replace can roll back to the previous list", () => {
  const store: ImportStore = { questions: [{ id: "old", title: "Ancienne", score: 3, category: "" }], categories: [], ranges: [], history: [] }
  const draft = validateQuestionnaireTables({
    source: "woloyem_excel",
    categories: [],
    ranges: [],
    questions: [Object.fromEntries(row({ question_id: "Q001", order: 1, question_type: "short_text", question: "Nouvelle question", required: "TRUE", is_scored: "FALSE" }).map((value, index) => [questionColumns[index], value]))],
  }).draft!
  const added = applyImportOrRollback(store, draft, "add", false)
  assert.equal(added.rolledBack, false)
  assert.equal(added.committed.questions.length, 2)
  assert.equal(added.committed.questions[0]?.title, "Ancienne")
  const replaced = applyImportOrRollback(store, draft, "replace", true)
  assert.equal(replaced.rolledBack, true)
  assert.deepEqual(replaced.committed.questions, store.questions)
})

test("ScoreApp maps documented answer types and keeps unknown types visible", () => {
  assert.equal(mapScoreAppAnswerType("yesno"), "yes_no")
  assert.equal(mapScoreAppAnswerType("single_choice"), "single_choice")
  assert.equal(mapScoreAppAnswerType("text"), "short_text")
  assert.equal(mapScoreAppAnswerType("matrix"), null)
  const mapped = mapScoreAppQuestions([
    { id: "1", question: "How satisfied are you with our customer service?", answer_type: "yesno", order: 1, required: true, categories: [{ title: "Customer Service", order: 1 }], options: [{ option: "Yes", option_value: "3", order: 1 }, { option: "No", option_value: "0", order: 2 }] },
    { id: "2", question: "What could we improve?", answer_type: "heatmap", order: 2, required: false, options: [] },
  ])
  assert.equal(mapped.draft.questions[0]?.type, "yes_no")
  assert.deepEqual(mapped.draft.questions[0]?.options.map((option) => option.score), [3, 0])
  assert.equal(mapped.draft.unknownTypes[0]?.rawType, "heatmap")
  assert.match(mapped.issues[0]?.message ?? "", /Unsupported question type/)
})
