import assert from "node:assert/strict"
import test from "node:test"
import { evaluatePublish } from "../assessment/publish.ts"
import { applyEligibilityRules, rulesForScorecard, type EligibilityRule } from "./eligibility.ts"
import { rangeIssues } from "./engine.ts"
import { resolveAssessment } from "./outcome.ts"

const ranges = [
  { id: "low", minPercent: 0, maxPercent: 39, label: "Pas encore éligible" },
  { id: "mid", minPercent: 40, maxPercent: 74, label: "Probablement éligible" },
  { id: "high", minPercent: 75, maxPercent: 100, label: "Éligible" },
]

function rule(partial: Partial<EligibilityRule> & Pick<EligibilityRule, "id" | "action" | "resultRangeId" | "conditions">): EligibilityRule {
  return { scorecardId: "org-a", ...partial }
}

test("score 90 stays eligible when no rule exists", () => {
  const outcome = resolveAssessment({
    questions: [{ id: "q", isScored: true, scoringCategoryId: null, type: "single_choice", options: [{ id: "a", score: 90 }, { id: "ceiling", score: 100 }] }],
    answers: [{ questionId: "q", optionIds: ["a"] }],
    categories: [],
    ranges,
    rules: [],
  })
  assert.equal(outcome.officialPercent, 90)
  assert.equal(outcome.matchedRange?.id, "high")
  assert.equal(outcome.finalRange?.id, "high")
  assert.deepEqual(outcome.triggeredRules, [])
})

test("force result overrides an eligible score without changing the percent", () => {
  const outcome = resolveAssessment({
    questions: [
      { id: "q", isScored: true, scoringCategoryId: null, type: "single_choice", options: [{ id: "a", score: 90 }, { id: "ceiling", score: 100 }] },
      { id: "training", isScored: false, scoringCategoryId: null, type: "yes_no", options: [{ id: "no", score: 0 }, { id: "yes", score: 0 }] },
    ],
    answers: [{ questionId: "training", optionIds: ["no"] }, { questionId: "q", optionIds: ["a"] }],
    categories: [],
    ranges,
    rules: [rule({ id: "r1", action: "force_result", resultRangeId: "low", conditions: [{ questionId: "training", operator: "eq", value: "no" }] })],
  })
  assert.equal(outcome.officialPercent, 90)
  assert.equal(outcome.matchedRange?.label, "Éligible")
  assert.equal(outcome.finalRange?.label, "Pas encore éligible")
  assert.equal(outcome.triggeredRules[0]?.id, "r1")
})

test("maximum result cannot be exceeded", () => {
  const applied = applyEligibilityRules({
    matched: ranges[2],
    ranges,
    questions: [{ id: "exp", type: "number" }],
    answers: [{ questionId: "exp", scaleValue: 20 }],
    rules: [rule({ id: "r2", action: "max_result", resultRangeId: "mid", conditions: [{ questionId: "exp", operator: "lt", value: "36" }] })],
  })
  assert.equal(applied.finalRange?.label, "Probablement éligible")
})

test("an unmet rule leaves the matched result", () => {
  const applied = applyEligibilityRules({
    matched: ranges[2],
    ranges,
    questions: [{ id: "training", type: "yes_no" }],
    answers: [{ questionId: "training", optionIds: ["yes"] }],
    rules: [rule({ id: "r1", action: "force_result", resultRangeId: "low", conditions: [{ questionId: "training", operator: "eq", value: "no" }] })],
  })
  assert.equal(applied.finalRange?.id, "high")
  assert.deepEqual(applied.triggered, [])
})

test("several conditions must all match", () => {
  const conditions = [
    { questionId: "edu", operator: "eq" as const, value: "bachelor" },
    { questionId: "exp", operator: "lt" as const, value: "36" },
  ]
  const input = {
    matched: ranges[2],
    ranges,
    questions: [{ id: "edu", type: "single_choice" }, { id: "exp", type: "number" }],
    rules: [rule({ id: "and", action: "force_result", resultRangeId: "low", conditions })],
  }
  const both = applyEligibilityRules({ ...input, answers: [{ questionId: "edu", optionIds: ["bachelor"] }, { questionId: "exp", scaleValue: 24 }] })
  const one = applyEligibilityRules({ ...input, answers: [{ questionId: "edu", optionIds: ["bachelor"] }, { questionId: "exp", scaleValue: 40 }] })
  assert.equal(both.finalRange?.id, "low")
  assert.equal(one.finalRange?.id, "high")
})

test("the most restrictive rule wins over a favorable one", () => {
  const applied = applyEligibilityRules({
    matched: ranges[2],
    ranges,
    questions: [{ id: "exp", type: "yes_no" }],
    answers: [{ questionId: "exp", optionIds: ["no"] }],
    rules: [
      rule({ id: "soft", action: "force_result", resultRangeId: "high", conditions: [{ questionId: "exp", operator: "eq", value: "no" }] }),
      rule({ id: "hard", action: "force_result", resultRangeId: "low", conditions: [{ questionId: "exp", operator: "eq", value: "no" }] }),
      rule({ id: "cap", action: "max_result", resultRangeId: "mid", conditions: [{ questionId: "exp", operator: "eq", value: "no" }] }),
    ],
  })
  assert.equal(applied.finalRange?.id, "low")
})

test("a scorecard without rules matches the historical range", () => {
  const first = resolveAssessment({
    questions: [{ id: "q", isScored: true, scoringCategoryId: null, type: "number", options: [] }],
    answers: [],
    categories: [],
    ranges,
  })
  assert.equal(first.finalRange?.id, first.matchedRange?.id)
  assert.equal(first.triggeredRules.length, 0)
})

test("publish blocks uneven weights, overlaps and gaps", () => {
  const lead = {
    timing: "before_results" as const,
    consentRequired: false,
    consentLabel: "",
    privacyPolicyUrl: "",
    fields: {},
  }
  const blocked = evaluatePublish({
    name: "PMP",
    slug: "pmp",
    landingTitle: "Titre public",
    questions: [{ isScored: true, scoringCategoryId: "c1" }],
    scoringCategories: [{ id: "c1", weight: 75 }],
    ranges: [
      { id: "a", minPercent: 0, maxPercent: 50, label: "A", ctaLabel: "", ctaUrl: "" },
      { id: "b", minPercent: 40, maxPercent: 80, label: "B", ctaLabel: "", ctaUrl: "" },
    ],
    lead: lead as never,
  })
  assert.equal(blocked.checks.find((check) => check.id === "scoring")?.ok, false)
  assert.equal(blocked.checks.find((check) => check.id === "ranges")?.ok, false)
  assert.match(rangeIssues([
    { id: "a", minPercent: 0, maxPercent: 20, label: "A" },
    { id: "b", minPercent: 40, maxPercent: 100, label: "B" },
  ]).join(" "), /trou/i)
})

test("the numeric tester and the answer path use the same outcome", () => {
  const shared = {
    questions: [{ id: "q", isScored: true, scoringCategoryId: null, type: "single_choice", options: [{ id: "a", score: 90 }, { id: "ceiling", score: 100 }, { id: "no", score: 0 }] }],
    categories: [],
    ranges,
    rules: [rule({ id: "r1", action: "force_result", resultRangeId: "low", conditions: [{ questionId: "q", operator: "eq", value: "no" }] })],
  }
  const eligible = resolveAssessment({ ...shared, answers: [{ questionId: "q", optionIds: ["a"] }] })
  assert.deepEqual(eligible, resolveAssessment({ ...shared, answers: [{ questionId: "q", optionIds: ["a"] }] }))
  assert.equal(eligible.officialPercent, 90)
  assert.equal(eligible.finalRange?.id, "high")
  const blocked = resolveAssessment({ ...shared, answers: [{ questionId: "q", optionIds: ["no"] }] })
  assert.deepEqual(blocked, resolveAssessment({ ...shared, answers: [{ questionId: "q", optionIds: ["no"] }] }))
  assert.equal(blocked.officialPercent, 0)
  assert.equal(blocked.finalRange?.id, "low")
})

test("a favorable force does not raise the result", () => {
  const applied = applyEligibilityRules({
    matched: ranges[0],
    ranges,
    questions: [{ id: "training", type: "yes_no" }],
    answers: [{ questionId: "training", optionIds: ["yes"] }],
    rules: [rule({ id: "soft", action: "force_result", resultRangeId: "high", conditions: [{ questionId: "training", operator: "eq", value: "yes" }] })],
  })
  assert.equal(applied.finalRange?.id, "low")
})

test("rules from another scorecard are ignored", () => {
  const foreign = rule({ id: "foreign", scorecardId: "org-b", action: "force_result", resultRangeId: "low", conditions: [{ questionId: "q", operator: "eq", value: "no" }] })
  const own = rulesForScorecard([foreign, rule({ id: "own", action: "max_result", resultRangeId: "mid", conditions: [{ questionId: "q", operator: "eq", value: "no" }] })], "org-a")
  assert.deepEqual(own.map((item) => item.id), ["own"])
  const applied = applyEligibilityRules({
    matched: ranges[2],
    ranges,
    questions: [{ id: "q", type: "yes_no" }],
    answers: [{ questionId: "q", optionIds: ["no"] }],
    rules: own,
  })
  assert.equal(applied.finalRange?.id, "mid")
  const closed = applyEligibilityRules({
    matched: ranges[2],
    ranges,
    questions: [{ id: "q", type: "yes_no" }],
    answers: [{ questionId: "other", optionIds: ["no"] }],
    rules: [foreign],
  })
  assert.equal(closed.finalRange?.id, "high")
})
