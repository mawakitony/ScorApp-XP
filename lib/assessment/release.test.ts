import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  archiveOption,
  archiveQuestion,
  documentFromBundle,
  duplicateDraft,
  historicalQuestions,
  optionById,
  parseRelease,
  reactivate,
  releaseForOrganization,
  replaceArchives,
  sameRelease,
  visibleQuestions,
  type DraftRow,
  type ReleaseDocument,
} from "./release.ts"
import type { BuilderBundle } from "@/types/builder"

const published: ReleaseDocument = {
  version: 1,
  questions: [{
    id: "q1",
    questionCategoryId: null,
    scoringCategoryId: "s1",
    type: "single_choice",
    title: "Niveau",
    description: "",
    isRequired: true,
    isScored: true,
    position: 0,
    settings: {},
    options: [
      { id: "o1", label: "Bachelor", value: "bachelor", score: 80, position: 0 },
      { id: "o2", label: "Secondaire", value: "secondaire", score: 40, position: 1 },
    ],
  }],
  scoringCategories: [{ id: "s1", name: "Etudes", weight: 100, maxScore: 100 }],
  ranges: [{ id: "r1", minPercent: 0, maxPercent: 100, label: "ready", title: "Pret" }],
  rules: [],
  page: { title: "Public", subtitle: "", description: "", ctaLabel: "Commencer" },
}

function rows(): DraftRow[] {
  return [{
    id: "q1",
    title: "Niveau",
    archivedAt: null,
    options: [
      { id: "o1", label: "Bachelor", value: "bachelor", score: 80, archivedAt: null },
      { id: "o2", label: "Secondaire", value: "secondaire", score: 40, archivedAt: null },
    ],
  }]
}

test("editing the draft leaves the published snapshot unchanged", () => {
  const draft = structuredClone(published)
  draft.questions[0]!.title = "Niveau modifié"
  assert.equal(sameRelease(published, draft), false)
  assert.equal(published.questions[0]?.title, "Niveau")
})

test("publish replaces the public snapshot with the current draft", () => {
  const draft = structuredClone(published)
  draft.questions[0]!.title = "Niveau modifié"
  const nextPublic = structuredClone(draft)
  assert.equal(sameRelease(nextPublic, draft), true)
  assert.notEqual(nextPublic.questions[0]?.title, published.questions[0]?.title)
})

test("undo restores only the previous draft", () => {
  const previous = structuredClone(published)
  const edited = structuredClone(published)
  edited.questions[0]!.title = "Brouillon"
  const afterUndo = structuredClone(previous)
  assert.equal(afterUndo.questions[0]?.title, "Niveau")
  assert.equal(published.questions[0]?.title, "Niveau")
})

test("restore makes the draft identical to the published snapshot and keeps ids", () => {
  let draft = archiveQuestion(rows(), "q1", "2026-09-26T00:00:00Z")
  draft = reactivate(published, draft)
  assert.equal(draft[0]?.id, "q1")
  assert.equal(draft[0]?.archivedAt, null)
  assert.equal(draft[0]?.options[0]?.id, "o1")
  assert.equal(draft[0]?.options[0]?.archivedAt, null)
})

test("excel replace archives questions and does not change the public snapshot", () => {
  const archived = replaceArchives(rows(), "2026-09-26T00:00:00Z")
  assert.equal(archived[0]?.archivedAt, "2026-09-26T00:00:00Z")
  assert.equal(published.questions[0]?.id, "q1")
  assert.equal(visibleQuestions(archived).length, 0)
})

test("duplication copies the draft and carries no published release", () => {
  const copy = duplicateDraft([
    { id: "q-old", title: "Ancienne", archivedAt: "2026-09-26T00:00:00Z", options: [] },
    ...rows(),
  ])
  assert.equal(copy.release, null)
  assert.equal(copy.status, "draft")
  assert.deepEqual(copy.questions.map((question) => question.id), ["q1"])
})

test("an existing published scorecard backfills a snapshot of its current rows", () => {
  const source = published
  const backfill = parseRelease(source)
  assert.ok(backfill)
  assert.equal(sameRelease(backfill!, source), true)
  assert.equal(backfill?.questions[0]?.options[0]?.label, "Bachelor")
})

test("a release from another organization is refused", () => {
  assert.equal(releaseForOrganization("org-a", "org-b"), false)
  assert.equal(releaseForOrganization("org-a", "org-a"), true)
})

test("archiving a question keeps its responses and hides it from builder and public", () => {
  const responses = [{ id: "resp", questionId: "q1", optionId: "o1" }]
  const archived = archiveQuestion(rows(), "q1", "2026-09-26T00:00:00Z")
  assert.equal(responses.length, 1)
  assert.equal(visibleQuestions(archived).length, 0)
  const nextPublic = { ...published, questions: published.questions.filter((question) => visibleQuestions(archived).some((row) => row.id === question.id)) }
  assert.equal(nextPublic.questions.length, 0)
  assert.equal(historicalQuestions(archived, ["q1"]).length, 1)
})

test("archiving an option keeps the label for historical answers", () => {
  const archived = archiveOption(rows(), "o1", "2026-09-26T00:00:00Z")
  const option = optionById(archived, "o1")
  assert.equal(option?.archivedAt, "2026-09-26T00:00:00Z")
  assert.equal(option?.id, "o1")
  assert.equal(option?.label, "Bachelor")
  assert.equal(option?.value, "bachelor")
  assert.equal(option?.score, 80)
})

test("a physical delete of a question that has responses is refused by restrict", () => {
  const sql = readFileSync("supabase/migrations/20260926180000_published_release.sql", "utf8")
  assert.match(sql, /responses_question_id_fkey[\s\S]*on delete restrict/i)
  assert.doesNotMatch(sql, /delete from public\.questions/i)
  assert.doesNotMatch(sql, /delete from public\.question_options/i)
  assert.match(sql, /set archived_at = now\(\)/i)
  assert.match(sql, /archived_at is null/i)
})

test("documentFromBundle round-trips the active draft", () => {
  const bundle = {
    scorecard: { id: "card" },
    page: { title: "Public", subtitle: "", description: "", ctaLabel: "Commencer" },
    questions: [{
      id: "q1",
      questionCategoryId: null,
      scoringCategoryId: "s1",
      type: "single_choice",
      title: "Niveau",
      description: "",
      isRequired: true,
      isScored: true,
      position: 0,
      settings: { scaleFrom: 1, scaleTo: 5, scoreFrom: 0, scoreTo: 100 },
      displayRule: null,
      options: [{ id: "o1", questionId: "q1", label: "Bachelor", value: "bachelor", score: 80, position: 0 }],
    }],
    questionCategories: [],
    scoringCategories: [{ id: "s1", name: "Etudes", description: "", weight: 100, maxScore: 100, highMessage: "", mediumMessage: "", lowMessage: "", position: 0 }],
    ranges: [{ id: "r1", minPercent: 0, maxPercent: 100, label: "ready", title: "Pret", description: "", badge: "", position: 0, recommendationId: null, recommendationTitle: "", recommendationBody: "", ctaLabel: "", ctaUrl: "" }],
    rules: [],
    caps: [],
    leadForm: { timing: "before_results", consentRequired: false, consentLabel: "", privacyPolicyUrl: "", fields: {} },
  } as unknown as BuilderBundle
  const document = documentFromBundle(bundle)
  assert.equal(document.questions[0]?.options[0]?.score, 80)
  assert.equal(sameRelease(document, document), true)
})
