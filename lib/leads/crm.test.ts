import assert from "node:assert/strict"
import test from "node:test"
import { csvCell, toCsv } from "./csv.ts"
import { parseLeadFilters } from "./filters.ts"
import {
  acceptedDurations,
  aggregateCountries,
  conversionRate,
  ctaClickRate,
  dropOff,
  fillScoreBuckets,
  funnelRates,
  median,
  resultShares,
  scoreBucket,
} from "./metrics.ts"
import {
  dataCompleteness,
  leadQuality,
  leadTemperature,
  qualityBand,
  sameOrganization,
} from "./qualification.ts"
import { isLeadStatus } from "./qualification.ts"
import { sessionCookiePath } from "../assessment/token.ts"

test("le statut n'accepte que l'énumération stable", () => {
  assert.equal(isLeadStatus("qualified"), true)
  assert.equal(isLeadStatus("won"), false)
})

test("la température dépend du score et du clic CTA", () => {
  assert.equal(leadTemperature(82, false), "hot")
  assert.equal(leadTemperature(20, true), "hot")
  assert.equal(leadTemperature(55, false), "warm")
  assert.equal(leadTemperature(10, false), "cold")
  assert.equal(leadTemperature(null, false), "cold")
})

test("un tag d'une autre organisation est refusé", () => {
  assert.equal(sameOrganization("org-a", "org-a"), true)
  assert.equal(sameOrganization("org-a", "org-b"), false)
})

test("la qualité du lead ignore un champ qui n'était pas demandé", () => {
  const completeness = dataCompleteness(
    { email: "a@b.co", company: "" },
    { email: true, phone: false, country: false, company: false, jobTitle: false },
  )
  assert.equal(completeness, 100)
  const quality = leadQuality({ assessmentScore: 80, completed: true, ctaClicked: true, completeness })
  assert.equal(qualityBand(quality), "high")
  assert.equal(qualityBand(30), "low")
  assert.notEqual(quality, 80)
})

test("les filtres score et UTM restent côté paramètres", () => {
  const filters = parseLeadFilters({ status: "qualified", country: "ci", min: "40", max: "90", source: "youtube", campaign: "pmp", q: "awa" })
  assert.equal(filters.status, "qualified")
  assert.equal(filters.country, "CI")
  assert.equal(filters.scoreMin, 40)
  assert.equal(filters.scoreMax, 90)
  assert.equal(filters.utmSource, "youtube")
  assert.equal(filters.utmCampaign, "pmp")
  assert.equal(parseLeadFilters({ status: "pirate" }).status, null)
})

test("le CSV échappe les formules, les guillemets et les retours à la ligne", () => {
  assert.equal(csvCell("=1+1"), "\"'=1+1\"")
  assert.equal(csvCell("+228"), "\"'+228\"")
  assert.equal(csvCell("-commande"), "\"'-commande\"")
  assert.equal(csvCell("@nom"), "\"'@nom\"")
  assert.equal(csvCell("Il dit \"oui\""), "\"Il dit \"\"oui\"\"\"")
  const csv = toCsv(["Nom"], [["Lomé, Togo"], ["ligne\ndeux"]])
  assert.equal(csv.startsWith("\uFEFF"), true)
  assert.match(csv, /"Lomé, Togo"/)
  assert.match(csv, /"ligne\r?\ndeux"/)
})

test("le funnel, les scores et les pays se calculent sans libellés figés", () => {
  const rates = funnelRates([1000, 620, 410, 350, 330, 95])
  assert.equal(rates[1]?.rate, 62)
  assert.equal(rates[2]?.rate, 66.1)
  assert.equal(rates[5]?.rate, 28.8)
  assert.equal(conversionRate(95, 350), 27.1)
  assert.equal(ctaClickRate(95, 330), 28.8)
  assert.equal(scoreBucket(20), "0–20")
  assert.equal(scoreBucket(21), "21–40")
  assert.equal(scoreBucket(100), "81–100")
  assert.equal(fillScoreBuckets([{ label: "81–100", count: 4 }])[0]?.count, 0)
  const shares = resultShares([{ label: "Ready", count: 1 }, { label: "Developing", count: 3 }])
  assert.equal(shares.find((row) => row.label === "Ready")?.percent, 25)
  const countries = aggregateCountries([
    { country: "ci", leads: 2, completions: 1, score: 80, ctaClicks: 1 },
    { country: "CI", leads: 1, completions: 1, score: 50, ctaClicks: 0 },
  ])
  assert.equal(countries[0]?.country, "CI")
  assert.equal(countries[0]?.leads, 3)
  assert.equal(countries[0]?.averageScore, 70)
})

test("le drop-off repère la plus forte baisse", () => {
  const result = dropOff(100, [
    { title: "Question 1", answered: 100 },
    { title: "Question 2", answered: 94 },
    { title: "Question 4", answered: 67 },
  ])
  assert.equal(result.steps[0]?.percent, 100)
  assert.equal(result.highest?.to, "Question 4")
  assert.equal(result.highest?.drop, 27)
})

test("la médiane ignore les sessions de plus de 24 heures", () => {
  const values = acceptedDurations([120, 180, 240, 60 * 60 * 30])
  assert.deepEqual(values, [120, 180, 240])
  assert.equal(median(values), 180)
})

test("le cookie de session utilise le slug réel", () => {
  assert.equal(sessionCookiePath("eligibilite-pmp"), "/s/eligibilite-pmp")
  assert.equal(sessionCookiePath("[slug]"), null)
  assert.equal(sessionCookiePath("eligibilite-pmp")?.includes("[slug]"), false)
})
