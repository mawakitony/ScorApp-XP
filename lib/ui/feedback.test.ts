import assert from "node:assert/strict"
import test from "node:test"
import { BUILDER_STEPS, NAV_ITEMS } from "@/lib/constants"
import { saveStatusLabel } from "./feedback.ts"

test("owner-facing navigation and builder steps stay in business language", () => {
  const labels = [...BUILDER_STEPS.map((step) => step.label), ...NAV_ITEMS.map((item) => item.label)]
  for (const label of labels) {
    assert.equal(/setup|landing page|lead capture|json|uuid|webhook/i.test(label), false)
  }
  assert.equal(BUILDER_STEPS.find((step) => step.id === "preview")?.label, "Aperçu")
  assert.equal(BUILDER_STEPS.find((step) => step.id === "results")?.label, "Résultats")
})

test("autosave reports saving, saved and error without a vague failure", () => {
  const now = 1_000_000
  assert.equal(saveStatusLabel({ status: "saving", savedAt: null }, now), "Enregistrement…")
  assert.equal(saveStatusLabel({ status: "saved", savedAt: now - 1000 }, now), "Enregistré")
  assert.equal(saveStatusLabel({ status: "error", savedAt: null }, now), "Impossible d'enregistrer. Réessayez.")
})
