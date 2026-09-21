import assert from "node:assert/strict"
import test from "node:test"
import { validateAnswer, resumeIndex, isMutableSession } from "./answers.ts"
import { canStartSession, publicAccess } from "./access.ts"
import { IDEMPOTENT_EVENTS, REPEATABLE_EVENTS } from "./config.ts"
import { toPublicQuestion } from "./dto.ts"
import { leadFieldError, normalizeEmail, normalizePhone } from "./lead.ts"
import { completionBlockers, evaluatePublish } from "./publish.ts"
import { applyScoreRules } from "./rules.ts"
import { hashSessionToken, sessionTokensMatch } from "./token.ts"
import { calculateAssessment } from "../scoring/engine.ts"

const lead = {
  timing: "before_results" as const,
  consentRequired: true,
  consentLabel: "J'accepte que WOLOYEM utilise mes informations.",
  privacyPolicyUrl: "",
  fields: {
    first_name: { enabled: true, required: true, label: "Prénom", placeholder: "" },
    last_name: { enabled: true, required: false, label: "Nom", placeholder: "" },
    email: { enabled: true, required: true, label: "Email", placeholder: "" },
    phone: { enabled: false, required: false, label: "Téléphone", placeholder: "" },
    whatsapp: { enabled: false, required: false, label: "WhatsApp", placeholder: "" },
    company: { enabled: false, required: false, label: "Entreprise", placeholder: "" },
    job_title: { enabled: false, required: false, label: "Fonction", placeholder: "" },
    country: { enabled: false, required: false, label: "Pays", placeholder: "" },
    city: { enabled: false, required: false, label: "Ville", placeholder: "" },
  },
}

const ranges = [
  { id: "a", minPercent: 0, maxPercent: 39, label: "Needs Preparation", ctaLabel: "", ctaUrl: "" },
  { id: "b", minPercent: 40, maxPercent: 59, label: "Developing", ctaLabel: "", ctaUrl: "" },
  { id: "c", minPercent: 60, maxPercent: 79, label: "Ready", ctaLabel: "Bootcamp", ctaUrl: "https://www.woloyem.com/pmp" },
  { id: "d", minPercent: 80, maxPercent: 100, label: "Highly Ready", ctaLabel: "", ctaUrl: "" },
]

test("le jeton de session ne se compare pas en clair", () => {
  const hash = hashSessionToken("secret-token")
  assert.equal(sessionTokensMatch("secret-token", hash), true)
  assert.equal(sessionTokensMatch("autre-token", hash), false)
  assert.equal(hash.includes("secret-token"), false)
})

test("une option d'une autre question est refusée", () => {
  const error = validateAnswer(
    { id: "q1", type: "single_choice", isRequired: true, optionIds: ["a"], scaleFrom: 1, scaleTo: 5 },
    { optionIds: ["autre"], text: "" },
  )
  assert.match(error ?? "", /n'appartient pas/)
})

test("le choix multiple accepte plusieurs options de la question", () => {
  assert.equal(
    validateAnswer(
      { id: "q1", type: "multiple_choice", isRequired: true, optionIds: ["a", "b"], scaleFrom: 1, scaleTo: 5 },
      { optionIds: ["b", "a"], text: "" },
    ),
    null,
  )
})

test("la reprise ouvre la première question obligatoire sans réponse", () => {
  assert.equal(resumeIndex([{ id: "q1", isRequired: true }, { id: "q2", isRequired: true }], new Set(["q1"])), 1)
  assert.equal(resumeIndex([{ id: "q1", isRequired: true }], new Set(["q1"])), 1)
})

test("une session terminée ou expirée n'est plus modifiable", () => {
  const future = new Date(Date.now() + 60_000).toISOString()
  const past = new Date(Date.now() - 60_000).toISOString()
  assert.equal(isMutableSession("in_progress", future), true)
  assert.equal(isMutableSession("completed", future), false)
  assert.equal(isMutableSession("in_progress", past), false)
})

test("les questions non scorées ne changent pas le résultat", () => {
  const result = calculateAssessment({
    questions: [
      { id: "q1", type: "single_choice", isScored: true, scoringCategoryId: null, options: [{ id: "a", score: 0 }, { id: "b", score: 80 }] },
      { id: "q2", type: "short_text", isScored: false, scoringCategoryId: null, options: [] },
    ],
    answers: [{ questionId: "q1", optionIds: ["b"] }, { questionId: "q2" }],
    categories: [],
    ranges,
  })
  assert.equal(result.percentage, 100)
  assert.equal(result.rawScore, 80)
})

test("le score pondéré choisit la plage, et une plage absente bloque", () => {
  const weighted = calculateAssessment({
    questions: [
      { id: "q1", type: "single_choice", isScored: true, scoringCategoryId: "experience", options: [{ id: "a", score: 80 }, { id: "max-a", score: 100 }] },
      { id: "q2", type: "single_choice", isScored: true, scoringCategoryId: "training", options: [{ id: "b", score: 40 }, { id: "max-b", score: 100 }] },
    ],
    answers: [
      { questionId: "q1", optionIds: ["a"] },
      { questionId: "q2", optionIds: ["b"] },
    ],
    categories: [
      { id: "experience", weight: 50 },
      { id: "training", weight: 50 },
    ],
    ranges,
  })
  assert.equal(weighted.weightedScore, 60)
  assert.equal(weighted.resultRange?.label, "Ready")
  assert.deepEqual(completionBlockers({ weights: [40, 20], hasCategories: true, matchedRange: true }), [
    "Les poids de scoring ne totalisent pas 100 %.",
  ])
  assert.deepEqual(completionBlockers({ weights: [100], hasCategories: true, matchedRange: false }), [
    "Aucune plage ne correspond à ce score.",
  ])
})

test("le choix multiple somme les options et reste plafonné", () => {
  const result = calculateAssessment({
    questions: [{
      id: "q1",
      type: "multiple_choice",
      isScored: true,
      scoringCategoryId: null,
      options: [{ id: "a", score: 40 }, { id: "b", score: 40 }, { id: "c", score: -10 }],
    }],
    answers: [{ questionId: "q1", optionIds: ["a", "b", "c"] }],
    categories: [],
    ranges,
  })
  assert.equal(result.rawScore, 70)
  assert.equal(result.maxScore, 80)
  assert.equal(result.percentage, 87.5)
})

test("le consentement requis et l'email sont validés", () => {
  assert.equal(leadFieldError("email", "", true), "Ce champ est obligatoire.")
  assert.equal(leadFieldError("email", "awa@exemple.com", true), null)
  assert.equal(normalizeEmail("  Awa@Exemple.com "), "awa@exemple.com")
  const report = evaluatePublish({
    name: "Éligibilité PMP",
    slug: "eligibilite-pmp",
    landingTitle: "Êtes-vous éligible ?",
    questions: [{ isScored: true, scoringCategoryId: "experience" }],
    scoringCategories: [{ id: "experience", weight: 100 }],
    ranges,
    lead: { ...lead, consentRequired: true, consentLabel: "ok" },
  })
  assert.equal(report.checks.find((check) => check.id === "consent")?.ok, false)
})

test("le téléphone conserve l'indicatif sans réécriture arbitraire", () => {
  const phone = normalizePhone(" +225 07 00 00 00 00 ")
  assert.equal(phone.raw, "+225 07 00 00 00 00")
  assert.equal(phone.normalized, "+2250700000000")
})

test("un brouillon n'est pas public et une scorecard en pause n'accepte pas de session", () => {
  assert.equal(publicAccess("draft", false, false), "hidden")
  assert.equal(publicAccess("draft", true, true), "preview")
  assert.equal(publicAccess("paused", false, false), "paused")
  assert.equal(publicAccess("archived", true, true), "hidden")
  assert.equal(canStartSession("published"), true)
  assert.equal(canStartSession("paused"), false)
  assert.equal(canStartSession("draft"), false)
})

test("le DTO public ne contient pas les points", () => {
  const question = toPublicQuestion({
    id: "q1",
    type: "single_choice",
    title: "Question",
    description: null,
    isRequired: true,
    settings: { scaleFrom: 1, scaleTo: 5, scoreFrom: 0, scoreTo: 100 },
    options: [{ id: "a", label: "Oui", value: "yes", position: 0, score: 100 } as { id: string; label: string; value: string | null; position: number }],
  })
  assert.equal(JSON.stringify(question).includes("score"), false)
  assert.equal(question.options[0]?.value, "yes")
})

test("les événements de fin ne sont pas répétés, la vue résultat l'est", () => {
  assert.equal(IDEMPOTENT_EVENTS.includes("assessment_completed"), true)
  assert.equal(IDEMPOTENT_EVENTS.includes("lead_submitted"), true)
  assert.equal(REPEATABLE_EVENTS.includes("result_viewed"), true)
  assert.equal(REPEATABLE_EVENTS.includes("cta_clicked"), true)
  assert.equal(REPEATABLE_EVENTS.includes("assessment_completed"), false)
})

test("une règle de plafond ne dépasse pas le maximum déclaré", () => {
  assert.equal(applyScoreRules(92, [{ ruleType: "cap", config: { maxPercent: 80 } }]), 80)
  assert.equal(applyScoreRules(Number.NaN, []), 0)
})

test("trois profils couvrent les plages basse, moyenne et haute", () => {
  const profiles = [
    { score: 20, label: "Needs Preparation" },
    { score: 55, label: "Developing" },
    { score: 90, label: "Highly Ready" },
  ]
  for (const profile of profiles) {
    const result = calculateAssessment({
      questions: [{
        id: "q1",
        type: "single_choice",
        isScored: true,
        scoringCategoryId: null,
        options: [{ id: "a", score: profile.score }, { id: "max", score: 100 }],
      }],
      answers: [{ questionId: "q1", optionIds: ["a"] }],
      categories: [],
      ranges,
    })
    assert.equal(result.resultRange?.label, profile.label)
  }
})
