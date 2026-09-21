import assert from "node:assert/strict"
import test from "node:test"
import {
  calculateAssessment,
  distributeScaleScores,
  matchResultRange,
  rangeIssues,
  scaleScore,
  toPercent,
  weightedAverage,
  weightsMatchTarget,
} from "./engine.ts"

test("toPercent plafonne le score", () => {
  assert.equal(toPercent(50, 200), 25)
  assert.equal(toPercent(10, 0), 0)
  assert.equal(toPercent(150, 100), 100)
})

test("weightedAverage respecte les poids", () => {
  const score = weightedAverage([
    { percent: 90, weight: 40 },
    { percent: 50, weight: 20 },
    { percent: 80, weight: 25 },
    { percent: 60, weight: 15 },
  ])
  assert.equal(score, 75)
})

test("weightsMatchTarget signale un total différent de 100", () => {
  assert.equal(weightsMatchTarget([40, 20, 25, 15]), true)
  assert.equal(weightsMatchTarget([40, 20]), false)
  assert.equal(weightsMatchTarget([]), true)
})

test("matchResultRange couvre la borne haute du dernier seuil", () => {
  const ranges = [
    { id: "a", minPercent: 0, maxPercent: 39, label: "Needs Preparation" },
    { id: "b", minPercent: 40, maxPercent: 59, label: "Developing" },
    { id: "c", minPercent: 60, maxPercent: 79, label: "Ready" },
    { id: "d", minPercent: 80, maxPercent: 100, label: "Highly Ready" },
  ]
  assert.equal(matchResultRange(39, ranges)?.label, "Needs Preparation")
  assert.equal(matchResultRange(78, ranges)?.label, "Ready")
  assert.equal(matchResultRange(100, ranges)?.label, "Highly Ready")
})

test("rangeIssues détecte le chevauchement et un min supérieur au max", () => {
  const issues = rangeIssues([
    { id: "a", minPercent: 0, maxPercent: 50, label: "A" },
    { id: "b", minPercent: 40, maxPercent: 30, label: "B" },
  ])
  assert.equal(issues.length, 2)
})

test("distributeScaleScores répartit 1 = 0 et 5 = 100", () => {
  assert.deepEqual(distributeScaleScores(5, 0, 100), [0, 25, 50, 75, 100])
})

test("calculateAssessment combine points, poids et seuil", () => {
  const result = calculateAssessment({
    questions: [
      {
        id: "q1",
        type: "single_choice",
        isScored: true,
        scoringCategoryId: "experience",
        options: [
          { id: "a", score: 0 },
          { id: "b", score: 100 },
        ],
      },
      {
        id: "q2",
        type: "scale_5",
        isScored: true,
        scoringCategoryId: "training",
        options: [],
        scaleFrom: 1,
        scaleTo: 5,
        scoreFrom: 0,
        scoreTo: 100,
      },
      {
        id: "q3",
        type: "short_text",
        isScored: false,
        scoringCategoryId: null,
        options: [],
      },
    ],
    answers: [
      { questionId: "q1", optionIds: ["b"] },
      { questionId: "q2", scaleValue: 5 },
    ],
    categories: [
      { id: "experience", weight: 40 },
      { id: "training", weight: 60 },
    ],
    ranges: [{ id: "ready", minPercent: 80, maxPercent: 100, label: "Highly Ready" }],
  })

  assert.equal(result.rawScore, 200)
  assert.equal(result.percentage, 100)
  assert.equal(result.weightedScore, 100)
  assert.equal(result.categoryScores[0]?.percent, 100)
  assert.equal(result.resultRange?.label, "Highly Ready")
  assert.equal(scaleScore(1, 1, 5, 0, 100), 0)
})
