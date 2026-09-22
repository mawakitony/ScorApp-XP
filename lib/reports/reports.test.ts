import assert from "node:assert/strict"
import test from "node:test"
import { activeAiProvider } from "../ai/provider.ts"
import { AI_GUARDRAILS, aiPayload, explainWithoutChangingScore, sanitizeAiAnalysis } from "../ai/prompts.ts"
import { adminDto, participantDto, pdfFilename, reportAccess, type AdminReport, type ParticipantReport } from "./dto.ts"
import { generateRuleBasedInsights } from "./insights.ts"
import { reportEventCounts } from "./metrics.ts"
import { renderReportPdf } from "./pdf.ts"
import { presentReport } from "./present.ts"
import { createShareToken, hashShareToken, shareIsActive } from "./share.ts"
import { categoryBand, nextReportVersion, pdfRetryPlan, regenerationBlocked } from "./version.ts"

const base: ParticipantReport = {
  language: "fr",
  brandName: "WOLOYEM",
  website: "https://woloyem.example",
  contactEmail: "hello@woloyem.example",
  footer: "Abidjan",
  scorecardTitle: "Préparation PMP",
  participantLabel: "Awa",
  generatedAt: "2026-09-22T00:00:00.000Z",
  overallPercent: 78,
  badge: "Ready",
  resultTitle: "Prêt",
  summary: "Résumé déterministe.",
  categories: [
    { name: "Experience", percent: 85, band: "strength" },
    { name: "Knowledge", percent: 55, band: "improvement" },
  ],
  strengths: ["Experience constitue un point fort."],
  improvementAreas: ["Knowledge est un axe à renforcer."],
  recommendations: ["Poursuivre une préparation structurée."],
  ctaLabel: "Voir la formation",
  disclaimer: "Cette évaluation WOLOYEM n'est pas une certification PMI.",
}

test("category bands and deterministic recommendations stay centralised", () => {
  assert.equal(categoryBand(80), "strength")
  assert.equal(categoryBand(60), "moderate")
  assert.equal(categoryBand(59), "improvement")
  const insights = generateRuleBasedInsights({
    language: "fr",
    officialPercent: 78,
    resultTitle: "Prêt",
    resultDescription: "Vous pouvez poursuivre.",
    rangeRecommendation: "Préparation structurée.",
    categories: [
      { name: "Experience", percent: 85, high: "Expérience solide." },
      { name: "Knowledge", percent: 55, low: "Revoir les fondamentaux." },
    ],
    rules: [{ categoryName: "Knowledge", op: "lt", threshold: 60, message: "Review fundamentals." }],
  })
  assert.equal(insights.officialPercent, 78)
  assert.deepEqual(insights.strengths, ["Expérience solide."])
  assert.deepEqual(insights.improvementAreas, ["Revoir les fondamentaux."])
  assert.equal(insights.recommendations[0], "Préparation structurée.")
  assert.ok(insights.recommendations.includes("Review fundamentals."))
})

test("report versions are appended and regeneration is rate limited", () => {
  assert.equal(nextReportVersion(null), 1)
  assert.equal(nextReportVersion(2), 3)
  assert.equal(regenerationBlocked("2026-09-22T00:00:00.000Z", Date.parse("2026-09-22T00:02:00.000Z")), true)
  assert.equal(regenerationBlocked("2026-09-22T00:00:00.000Z", Date.parse("2026-09-22T00:04:00.000Z")), false)
  assert.equal(pdfRetryPlan(4).delayMs, 2 * 60 * 60_000)
  assert.equal(pdfRetryPlan(5).status, "dead")
})

test("participant dto hides admin fields and admin access is separate", () => {
  const admin: AdminReport = {
    ...base,
    internal: true,
    leadStatus: "qualified",
    temperature: "hot",
    quality: 80,
    source: "linkedin",
    campaign: "pmp",
    email: "awa@example.com",
    phone: "+2250000",
    notes: ["note interne"],
    answers: [{ question: "Q1", answer: "Oui", awarded: 5 }],
  }
  const participant = participantDto(admin)
  assert.equal("email" in participant, false)
  assert.equal("notes" in participant, false)
  assert.equal("answers" in participant, false)
  assert.equal(participant.overallPercent, 78)
  const internal = adminDto(admin)
  assert.equal(internal.email, "awa@example.com")
  assert.equal(reportAccess({ reportType: "admin", reportOrganizationId: "org-a", viewerOrganizationId: "org-a", sameSession: true, editor: false }), "denied")
  assert.equal(reportAccess({ reportType: "admin", reportOrganizationId: "org-a", viewerOrganizationId: "org-b", sameSession: false, editor: true }), "denied")
  assert.equal(reportAccess({ reportType: "participant", reportOrganizationId: "org-a", viewerOrganizationId: null, sameSession: true, editor: false }), "participant")
  assert.equal(pdfFilename("Préparation PMP", false).includes("@"), false)
  assert.equal(pdfFilename("Préparation PMP", true), "WOLOYEM-Lead-Assessment-Internal.pdf")
})

test("share tokens are hashed, expiring and revocable", () => {
  const share = createShareToken()
  assert.notEqual(share.token, share.hash)
  assert.equal(share.hash, hashShareToken(share.token))
  const expires = new Date(Date.now() + 60_000).toISOString()
  assert.equal(shareIsActive({ revokedAt: null, expiresAt: expires, now: Date.now() }), true)
  assert.equal(shareIsActive({ revokedAt: new Date().toISOString(), expiresAt: expires, now: Date.now() }), false)
  assert.equal(shareIsActive({ revokedAt: null, expiresAt: new Date(Date.now() - 1000).toISOString(), now: Date.now() }), false)
})

test("ai cannot change the official score and falls back when absent", () => {
  const dirty = sanitizeAiAnalysis({ summary: "Lecture plus détaillée.", officialScore: 10, categoryScore: 1, eligibilityStatus: "yes", strengths: ["Point fort"] })
  assert.equal(dirty?.summary, "Lecture plus détaillée.")
  assert.equal("officialScore" in (dirty ?? {}), false)
  const kept = explainWithoutChangingScore({ officialPercent: 78, summary: "Résumé déterministe.", strengths: ["A"], improvementAreas: ["B"], recommendations: ["C"] }, dirty)
  assert.equal(kept.officialPercent, 78)
  assert.equal(kept.strengths[0], "Point fort")
  const fallback = explainWithoutChangingScore({ officialPercent: 78, summary: "Résumé déterministe.", strengths: ["A"], improvementAreas: ["B"], recommendations: ["C"] }, null)
  assert.equal(fallback.summary, "Résumé déterministe.")
  const payload = aiPayload({ language: "fr", scorecardTitle: "PMP", overallPercent: 78, resultTitle: "Prêt", categories: [], recommendations: [], participantLabel: "Participant" })
  assert.equal(JSON.stringify(payload).includes("email"), false)
  assert.match(AI_GUARDRAILS, /certification/i)
  const provider = activeAiProvider()
  assert.equal(provider.configured, false)
})

test("downloads are not counted from technical retries", () => {
  const counts = reportEventCounts(["report.generated", "report.ready", "report.downloaded", "report.downloaded"])
  assert.equal(counts.reports_downloaded, 2)
  assert.equal(counts.reports_generated, 1)
})

test("shared presentation removes the participant name", () => {
  const shared = presentReport({ ...base, email: "hidden@example.com" }, { summary: "Texte IA.", strengths: [], improvementAreas: [], studyRecommendations: [], nextSteps: [] }, false)
  assert.equal(shared?.participantLabel, "Participant")
  assert.equal(shared?.overallPercent, 78)
  assert.equal(shared?.summary, "Texte IA.")
  assert.equal(JSON.stringify(shared).includes("hidden@example.com"), false)
})

test("pdf is a non-empty multi-page document", async () => {
  const buffer = await renderReportPdf(base, false)
  assert.equal(buffer.subarray(0, 4).toString(), "%PDF")
  assert.ok(buffer.length > 1000)
  const pages = buffer.toString("latin1").match(/\/Type \/Page(?!s)/g)
  assert.ok(pages && pages.length >= 3)
  const internal = await renderReportPdf(base, true, {
    leadStatus: "new",
    temperature: "warm",
    quality: 72,
    source: "site",
    campaign: "pmp",
    email: null,
    phone: null,
    answers: [{ question: "Q1", answer: "Oui", awarded: 2 }],
    notes: ["Note interne"],
  })
  const internalPages = internal.toString("latin1").match(/\/Type \/Page(?!s)/g)
  assert.ok(internalPages && internalPages.length >= 4)
})
