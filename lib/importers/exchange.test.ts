import assert from "node:assert/strict"
import test from "node:test"
import ExcelJS from "exceljs"
import { keptIds, diffImport, type ImportCatalog } from "./diff.ts"
import { buildScorecardWorkbook, type ScorecardWorkbook } from "./export.ts"
import { parseQuestionnaireFile } from "./excel.ts"
import { foreignReferenceMessage } from "./ownership.ts"
import { validateQuestionnaireTables } from "./validate.ts"
import { questionColumns } from "./model.ts"
import { resolveAssessment } from "../scoring/outcome.ts"
import type { EngineQuestion } from "../scoring/engine.ts"
import type { EligibilityRule } from "../scoring/eligibility.ts"

const q1 = "11111111-1111-4111-8111-111111111111"
const q2 = "22222222-2222-4222-8222-222222222222"
const low = "33333333-3333-4333-8333-333333333333"
const high = "44444444-4444-4444-8444-444444444444"
const ruleId = "55555555-5555-4555-8555-555555555555"
const other = "99999999-9999-4999-8999-999999999999"

function fixture(): ScorecardWorkbook {
  return {
    title: "Eligibilite PMP",
    questions: [
      {
        id: q1,
        order: 1,
        category: "Etudes",
        scoringCategory: "Etudes",
        type: "single_choice",
        title: "Quel est votre niveau d'etudes ?",
        description: "Choisissez un parcours.",
        required: true,
        scored: true,
        options: [
          { label: "Bachelor", value: "bachelor", score: 90 },
          { label: "Secondaire", value: "secondaire", score: 90 },
        ],
        displays: [],
      },
      {
        id: q2,
        order: 2,
        category: "Etudes",
        scoringCategory: "Etudes",
        type: "single_choice",
        title: "Combien d'heures de formation ?",
        description: "",
        required: true,
        scored: true,
        options: [
          { label: "Moins de 35", value: "under", score: 40 },
          { label: "35 ou plus", value: "over", score: 100 },
        ],
        displays: [
          { mode: "show_if", sourceRef: q1, operator: "eq", value: "Bachelor" },
          { mode: "show_if", sourceRef: q1, operator: "neq", value: "Secondaire" },
        ],
      },
    ],
    categories: [{ id: "cat-etudes", name: "Etudes", description: "Parcours", weight: 100, order: 1 }],
    scoringCategories: [{
      id: "score-etudes",
      name: "Etudes",
      description: "Parcours",
      weight: 100,
      maxScore: 100,
      order: 1,
      highMessage: "Solide",
      mediumMessage: "Correct",
      lowMessage: "A renforcer",
    }],
    ranges: [
      { id: low, min: 0, max: 49, label: "prepare", title: "Preparation", description: "A renforcer", badge: "Prepare", ctaLabel: "Voir", ctaUrl: "https://woloyem.com" },
      { id: high, min: 50, max: 100, label: "ready", title: "Pret", description: "Eligible", badge: "Pret", ctaLabel: "Continuer", ctaUrl: "https://woloyem.com" },
    ],
    rules: [{
      id: ruleId,
      name: "Plafond secondaire",
      order: 1,
      action: "max_result",
      target: low,
      conditions: [
        { sourceRef: q1, operator: "eq", value: "Secondaire" },
        { sourceRef: q1, operator: "neq", value: "Bachelor" },
      ],
    }],
  }
}

test("export then import keeps questions, scores, categories, scoring, ranges, conditions and rules", async () => {
  const file = await buildScorecardWorkbook(fixture())
  assert.ok(!("error" in file))
  if ("error" in file) return
  const parsed = await parseQuestionnaireFile({ filename: file.filename, bytes: new Uint8Array(file.bytes) })
  assert.equal(parsed.issues.length, 0, parsed.issues.map((item) => item.message).join(" "))
  const draft = parsed.draft
  assert.ok(draft)
  if (!draft) return
  assert.equal(draft.questions.length, 2)
  assert.equal(draft.questions[0]?.ref, q1)
  assert.deepEqual(draft.questions[0]?.options.map((option) => [option.label, option.value, option.score]), [["Bachelor", "bachelor", 90], ["Secondaire", "secondaire", 90]])
  assert.equal(draft.categories[0]?.name, "Etudes")
  assert.equal(draft.categories[0]?.weight, 100)
  assert.equal(draft.scoringCategories[0]?.weight, 100)
  assert.equal(draft.scoringCategories[0]?.maxScore, 100)
  assert.equal(draft.scoringCategories[0]?.highMessage, "Solide")
  assert.deepEqual(draft.ranges.map((range) => [range.ref, range.minScore, range.maxScore, range.label]), [[low, 0, 49, "prepare"], [high, 50, 100, "ready"]])
  assert.equal(draft.questions[1]?.displays.length, 2)
  assert.equal(draft.questions[1]?.displays[0]?.mode, "show_if")
  assert.equal(draft.questions[1]?.displays[1]?.operator, "neq")
  assert.equal(draft.rules?.length, 1)
  assert.equal(draft.rules?.[0]?.action, "max_result")
  assert.equal(draft.rules?.[0]?.conditions.length, 2)
  assert.equal(draft.rules?.[0]?.target, low)
})

test("an old workbook without the new columns still imports and shows every question", () => {
  const parsed = validateQuestionnaireTables({
    source: "woloyem_excel",
    categories: [],
    ranges: [],
    questions: [Object.fromEntries(questionColumns.map((column, index) => [column, ["Q001", 1, "", "short_text", "Question ancienne toujours visible", "", "TRUE", "FALSE"][index] ?? ""]))],
  })
  assert.equal(parsed.issues.length, 0)
  assert.equal(parsed.draft?.questions[0]?.displays.length, 0)
  assert.equal(parsed.draft?.rules, null)
  assert.equal(parsed.draft?.scoringCategories.length, 0)
})

test("an unknown question and a foreign scorecard id are refused", () => {
  const unknown = validateQuestionnaireTables({
    source: "woloyem_excel",
    categories: [],
    ranges: [],
    questions: [Object.fromEntries(questionColumns.map((column, index) => [column, ["Q001", 1, "", "short_text", "Question sans condition", "", "FALSE", "FALSE"][index] ?? ""]))],
    conditions: [{ question_id: "Q999", condition_order: 1, condition_mode: "show_if", condition_question_id: "Q001", condition_operator: "equals", condition_value: "oui" }],
  })
  assert.match(unknown.issues.map((item) => item.message).join(" "), /inconnue/i)

  const draft = validateQuestionnaireTables({
    source: "woloyem_excel",
    categories: [],
    ranges: [],
    questions: [Object.fromEntries(questionColumns.map((column, index) => [column, [other, 1, "", "short_text", "Question d'une autre organisation", "", "FALSE", "FALSE"][index] ?? ""]))],
  }).draft
  assert.ok(draft)
  assert.match(foreignReferenceMessage(draft!, new Set([q1]), new Set(), new Set()) ?? "", /scorecard/)
})

test("exported formula text is stored as text and never executed", async () => {
  const source = fixture()
  source.questions[0]!.title = "=1+1"
  const file = await buildScorecardWorkbook(source)
  assert.ok(!("error" in file))
  if ("error" in file) return
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(Buffer.from(file.bytes) as unknown as ExcelJS.Buffer)
  const value = workbook.getWorksheet("Questions")?.getRow(2).getCell(5).value
  assert.equal(typeof value, "string")
  assert.equal(String(value).startsWith("'"), true)
  assert.equal(typeof value === "object" && value !== null && "formula" in value, false)
  const parsed = await parseQuestionnaireFile({ filename: file.filename, bytes: new Uint8Array(file.bytes) })
  assert.equal(parsed.draft, null)
  assert.match(parsed.issues.map((item) => item.message).join(" "), /formule/i)
})

test("a missing question stays unless removal is confirmed, and a changed score is visible", () => {
  const catalog: ImportCatalog = {
    questions: [
      { id: q1, order: 1, title: "Niveau", description: "", type: "single_choice", required: true, scored: true, category: "Etudes", scoringCategory: "Etudes", options: [{ label: "Bachelor", score: 70 }], conditions: "" },
      { id: "55555555-5555-4555-8555-555555555551", order: 5, title: "Absente", description: "", type: "short_text", required: false, scored: false, category: "", scoringCategory: "", options: [], conditions: "" },
    ],
    categories: [],
    scoringCategories: [],
    ranges: [],
    rules: [],
  }
  const parsed = validateQuestionnaireTables({
    source: "woloyem_excel",
    categories: [{ category_id: "CAT", name: "Etudes", description: "", weight: 100, order: 1, high_message: "", medium_message: "", low_message: "" }],
    ranges: [],
    questions: [Object.fromEntries(questionColumns.map((column, index) => [column, [q1, 3, "Etudes", "single_choice", "Niveau modifie", "", "TRUE", "TRUE", "Bachelor", 80, "Secondaire", 10][index] ?? ""]))],
  })
  assert.ok(parsed.draft)
  const lines = diffImport(catalog, parsed.draft!)
  assert.ok(lines.some((line) => line.status === "modified" && line.text.includes("70 → 80")))
  assert.ok(lines.some((line) => line.status === "removed" && line.text.includes("absente")))
  const existing = catalog.questions.map((question) => question.id)
  assert.deepEqual(keptIds(existing, [q1], false), existing)
  assert.deepEqual(keptIds(existing, [q1], true), [q1])
})

test("the same answers keep the same score and the same final result after a round trip", async () => {
  const source = fixture()
  const file = await buildScorecardWorkbook(source)
  assert.ok(!("error" in file))
  if ("error" in file) return
  const parsed = await parseQuestionnaireFile({ filename: file.filename, bytes: new Uint8Array(file.bytes) })
  assert.equal(parsed.issues.length, 0, parsed.issues.map((item) => item.message).join(" "))
  const bachelor = outcome(source, "bachelor", "over")
  const importedBachelor = outcome(parsed.draft!, "bachelor", "over")
  assert.equal(importedBachelor.officialPercent, bachelor.officialPercent)
  assert.equal(importedBachelor.finalRange?.label, bachelor.finalRange?.label)
  const secondary = outcome(source, "secondaire", "over")
  const importedSecondary = outcome(parsed.draft!, "secondaire", "over")
  assert.equal(importedSecondary.officialPercent, secondary.officialPercent)
  assert.equal(importedSecondary.finalRange?.id, low)
  assert.equal(importedSecondary.finalRange?.label, secondary.finalRange?.label)
  assert.notEqual(secondary.finalRange?.id, high)
})

function outcome(source: ScorecardWorkbook | NonNullable<Awaited<ReturnType<typeof parseQuestionnaireFile>>["draft"]>, education: string, hours: string) {
  const questions = "questions" in source && source.questions[0] && "scored" in source.questions[0]
    ? engineFromWorkbook(source as ScorecardWorkbook)
    : engineFromDraft(source as NonNullable<Awaited<ReturnType<typeof parseQuestionnaireFile>>["draft"]>)
  const visibleHours = education === "bachelor"
  return resolveAssessment({
    questions: questions.questions,
    categories: [{ id: "Etudes", name: "Etudes", weight: 100 }],
    ranges: questions.ranges,
    rules: questions.rules,
    answers: [
      { questionId: q1, optionIds: [education] },
      ...(visibleHours ? [{ questionId: q2, optionIds: [hours] }] : []),
    ],
  })
}

function engineFromWorkbook(source: ScorecardWorkbook) {
  return {
    questions: source.questions.map(toEngine),
    ranges: source.ranges.map((range) => ({ id: range.id, minPercent: range.min, maxPercent: range.max, label: range.label })),
    rules: source.rules.map((rule) => ({
      id: rule.id,
      scorecardId: "card",
      action: rule.action,
      resultRangeId: rule.target,
      conditions: rule.conditions.map((condition) => ({ ...condition, questionId: condition.sourceRef, value: optionId(source, condition.sourceRef, condition.value) })),
    })) satisfies EligibilityRule[],
  }
}

function engineFromDraft(draft: NonNullable<Awaited<ReturnType<typeof parseQuestionnaireFile>>["draft"]>) {
  const questions = draft.questions.map((question) => toEngine({
    id: question.ref,
    order: question.order,
    category: question.category,
    scoringCategory: question.scoringCategory || question.category,
    type: question.type,
    title: question.title,
    description: question.description,
    required: question.required,
    scored: question.isScored,
    options: question.options.map((option) => ({ label: option.label, value: option.value || option.label, score: option.score })),
    displays: question.displays,
  }))
  return {
    questions,
    ranges: draft.ranges.map((range) => ({ id: range.ref, minPercent: range.minScore, maxPercent: range.maxScore, label: range.label })),
    rules: (draft.rules ?? []).map((rule) => ({
      id: rule.ref,
      scorecardId: "card",
      action: rule.action,
      resultRangeId: rule.target,
      conditions: rule.conditions.map((condition) => ({ questionId: condition.sourceRef, operator: condition.operator, value: optionIdValue(draft, condition.sourceRef, condition.value) })),
    })) satisfies EligibilityRule[],
  }
}

function toEngine(question: ScorecardWorkbook["questions"][number]): EngineQuestion {
  return {
    id: question.id,
    isScored: question.scored,
    scoringCategoryId: question.scoringCategory,
    type: question.type as EngineQuestion["type"],
    options: question.options.map((option) => ({ id: option.value, score: option.score })),
    choiceOptions: question.options.map((option) => ({ id: option.value, label: option.label, value: option.value })),
    position: question.order - 1,
    displayRule: question.displays.length === 0 ? null : {
      mode: question.displays[0]!.mode,
      conditions: question.displays.map((display) => ({ questionId: display.sourceRef, operator: display.operator, value: display.value })),
    },
  }
}

function optionId(source: ScorecardWorkbook, questionId: string, value: string) {
  const question = source.questions.find((item) => item.id === questionId)
  const option = question?.options.find((item) => item.value === value || item.label.toLowerCase() === value.toLowerCase())
  return option?.value ?? value
}

function optionIdValue(draft: NonNullable<Awaited<ReturnType<typeof parseQuestionnaireFile>>["draft"]>, questionId: string, value: string) {
  const question = draft.questions.find((item) => item.ref === questionId)
  const option = question?.options.find((item) => item.value.toLowerCase() === value.toLowerCase() || item.label.toLowerCase() === value.toLowerCase())
  return option?.value || value
}
