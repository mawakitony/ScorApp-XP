import assert from "node:assert/strict"
import test from "node:test"
import { questionSchema, slugSchema } from "./builder.ts"

test("slugSchema accepte un slug public", () => {
  assert.equal(slugSchema.safeParse("eligibilite-pmp").success, true)
  assert.equal(slugSchema.safeParse("Eligibilite").success, false)
  assert.equal(slugSchema.safeParse("pmp_test").success, false)
})

test("questionSchema refuse un titre vide et un type inconnu", () => {
  const valid = questionSchema.safeParse({
    title: "Quel est votre niveau d'études ?",
    description: "",
    type: "single_choice",
    questionCategoryId: null,
    scoringCategoryId: null,
    isRequired: true,
    isScored: true,
    settings: { scaleFrom: 1, scaleTo: 5, scoreFrom: 0, scoreTo: 100 },
  })
  assert.equal(valid.success, true)
  assert.equal(
    questionSchema.safeParse({
      title: "x",
      description: "",
      type: "essay",
      questionCategoryId: null,
      scoringCategoryId: null,
      isRequired: true,
      isScored: false,
      settings: { scaleFrom: 1, scaleTo: 5, scoreFrom: 0, scoreTo: 100 },
    }).success,
    false,
  )
})
