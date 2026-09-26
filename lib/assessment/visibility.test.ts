import assert from "node:assert/strict"
import test from "node:test"
import { blockingQuestion, displayRuleIssues, hasDisplayCycle, isQuestionVisible, pruneHiddenAnswers, visibleQuestionIds, type VisibilityQuestion } from "./visibility.ts"
import { resolveAssessment } from "../scoring/outcome.ts"

const bachelor = { id: "bachelor", label: "Bachelor", value: "bachelor" }
const secondary = { id: "secondary", label: "Secondaire", value: "secondary" }

function question(partial: Partial<VisibilityQuestion> & Pick<VisibilityQuestion, "id" | "position">): VisibilityQuestion {
  return {
    type: "single_choice",
    options: [],
    displayRule: null,
    ...partial,
  }
}

const education = question({ id: "q1", position: 0, options: [bachelor, secondary] })
const follow = question({
  id: "q7",
  position: 1,
  type: "number",
  options: [],
  displayRule: { mode: "show_if", conditions: [{ questionId: "q1", operator: "eq", value: "bachelor" }] },
})

test("a question without a condition stays visible", () => {
  assert.equal(isQuestionVisible(education, [education, follow], []), true)
})

test("show_if is visible only when the condition matches", () => {
  const shown = isQuestionVisible(follow, [education, follow], [{ questionId: "q1", optionIds: ["bachelor"] }])
  const hidden = isQuestionVisible(follow, [education, follow], [{ questionId: "q1", optionIds: ["secondary"] }])
  assert.equal(shown, true)
  assert.equal(hidden, false)
})

test("hide_if hides the question when the condition matches", () => {
  const hours = question({
    id: "hours",
    position: 1,
    type: "number",
    displayRule: { mode: "hide_if", conditions: [{ questionId: "q1", operator: "eq", value: bachelor.id }] },
  })
  assert.equal(isQuestionVisible(hours, [education, hours], [{ questionId: "q1", optionIds: [bachelor.id] }]), false)
  assert.equal(isQuestionVisible(hours, [education, hours], [{ questionId: "q1", optionIds: [secondary.id] }]), true)
})

test("several conditions must all match", () => {
  const experience = question({ id: "exp", position: 1, type: "number" })
  const target = question({
    id: "q7",
    position: 2,
    displayRule: {
      mode: "show_if",
      conditions: [
        { questionId: "q1", operator: "eq", value: "bachelor" },
        { questionId: "exp", operator: "gte", value: "36" },
      ],
    },
  })
  const list = [education, experience, target]
  assert.equal(isQuestionVisible(target, list, [{ questionId: "q1", optionIds: ["bachelor"] }, { questionId: "exp", valueText: "36" }]), true)
  assert.equal(isQuestionVisible(target, list, [{ questionId: "q1", optionIds: ["bachelor"] }, { questionId: "exp", valueText: "12" }]), false)
})

test("a hidden required question does not block", () => {
  const required = { ...follow, isRequired: true }
  const blocker = blockingQuestion([ { ...education, isRequired: true }, required ], [{ questionId: "q1", optionIds: ["secondary"] }], new Set(["q1"]))
  assert.equal(blocker, null)
})

test("a hidden answer is excluded from the score", () => {
  const ranges = [{ id: "high", minPercent: 0, maxPercent: 100, label: "Éligible" }]
  const shared = {
    categories: [],
    ranges,
    questions: [
      { id: "q1", isScored: true, scoringCategoryId: null, type: "single_choice", options: [{ id: "a", score: 100 }], choiceOptions: [bachelor], displayRule: null },
      { id: "q2", isScored: true, scoringCategoryId: null, type: "single_choice", options: [{ id: "zero", score: 0 }, { id: "ceiling", score: 100 }], displayRule: { mode: "show_if", conditions: [{ questionId: "q1", operator: "eq", value: "missing" }] } },
    ],
    answers: [{ questionId: "q1", optionIds: ["a"] }, { questionId: "q2", optionIds: ["zero"] }],
  }
  const hidden = resolveAssessment(shared)
  const counted = resolveAssessment({
    ...shared,
    questions: shared.questions.map((item) => ({ ...item, displayRule: null })),
  })
  assert.equal(hidden.officialPercent, 100)
  assert.equal(counted.officialPercent, 50)
})

test("changing a previous answer drops the hidden answer", () => {
  const pruned = pruneHiddenAnswers([education, follow], [
    { questionId: "q1", optionIds: ["secondary"] },
    { questionId: "q7", valueText: "40" },
  ])
  assert.deepEqual(pruned.removedIds, ["q7"])
  assert.deepEqual(pruned.answers.map((answer) => answer.questionId), ["q1"])
})

test("a dependency on a later question is refused", () => {
  const early = question({
    id: "q1",
    position: 0,
    displayRule: { mode: "show_if", conditions: [{ questionId: "q7", operator: "eq", value: "x" }] },
  })
  const later = question({ id: "q7", position: 1, options: [{ id: "x", label: "x", value: "x" }] })
  assert.match(displayRuleIssues([early, later]) ?? "", /précédente/)
})

test("a logical cycle is refused", () => {
  const first = question({
    id: "a",
    position: 0,
    displayRule: { mode: "show_if", conditions: [{ questionId: "b", operator: "eq", value: "x" }] },
  })
  const second = question({
    id: "b",
    position: 1,
    displayRule: { mode: "show_if", conditions: [{ questionId: "a", operator: "eq", value: "x" }] },
  })
  assert.equal(hasDisplayCycle([first, second]), true)
  assert.match(displayRuleIssues([first, second]) ?? "", /boucle|précédente/)
})

test("an old scorecard without rules stays fully visible", () => {
  assert.deepEqual(visibleQuestionIds([education, question({ id: "q2", position: 1 })], []), ["q1", "q2"])
})

test("preview and the public assessment share the visibility result", () => {
  const list = [education, follow]
  const answers = [{ questionId: "q1", optionIds: ["bachelor"] }]
  assert.deepEqual(visibleQuestionIds(list, answers), visibleQuestionIds(list, answers))
  assert.deepEqual(visibleQuestionIds(list, answers), ["q1", "q7"])
})

test("a condition from another scorecard is refused", () => {
  const foreign = question({
    id: "local",
    position: 1,
    displayRule: { mode: "show_if", conditions: [{ questionId: "other-org", operator: "eq", value: "bachelor" }] },
  })
  assert.match(displayRuleIssues([education, foreign]) ?? "", /scorecard/)
})
