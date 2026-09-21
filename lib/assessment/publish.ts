import { rangeIssues, weightsMatchTarget, type ScoreRange } from "@/lib/scoring/engine"
import { leadFormSchema } from "@/lib/validators/builder"
import { slugSchema } from "@/lib/validators/builder"
import type { BuilderLeadForm } from "@/types/builder"

export type PublishQuestion = {
  isScored: boolean
  scoringCategoryId: string | null
}

export type PublishRange = ScoreRange & {
  ctaLabel: string
  ctaUrl: string
}

export type PublishCheck = {
  id: string
  label: string
  ok: boolean
  detail?: string
}

export function evaluatePublish(input: {
  name: string
  slug: string
  landingTitle: string
  questions: PublishQuestion[]
  scoringCategories: { id: string; weight: number }[]
  ranges: PublishRange[]
  lead: BuilderLeadForm
}) {
  const checks: PublishCheck[] = []
  checks.push({
    id: "name",
    label: "Nom",
    ok: input.name.trim().length >= 2,
    detail: input.name.trim().length >= 2 ? undefined : "Le nom est trop court.",
  })
  checks.push({
    id: "slug",
    label: "Slug",
    ok: slugSchema.safeParse(input.slug).success,
    detail: slugSchema.safeParse(input.slug).success ? undefined : "Le slug est invalide.",
  })
  checks.push({
    id: "landing",
    label: "Landing page",
    ok: input.landingTitle.trim().length >= 2,
    detail: input.landingTitle.trim().length >= 2 ? undefined : "Le titre public est manquant.",
  })
  checks.push({
    id: "questions",
    label: `${input.questions.length} question${input.questions.length > 1 ? "s" : ""}`,
    ok: input.questions.length > 0,
    detail: input.questions.length > 0 ? undefined : "Ajoutez au moins une question.",
  })

  const scored = input.questions.filter((question) => question.isScored)
  checks.push({
    id: "scored",
    label: "Question notée",
    ok: scored.length > 0,
    detail: scored.length > 0 ? undefined : "Ajoutez au moins une question notée.",
  })

  const weightsOk = input.scoringCategories.length === 0 || weightsMatchTarget(input.scoringCategories.map((category) => category.weight))
  const unlinked = input.scoringCategories.length > 0 && scored.some((question) => !question.scoringCategoryId)
  checks.push({
    id: "scoring",
    label: "Scoring configured",
    ok: weightsOk && !unlinked,
    detail: !weightsOk
      ? "La somme des poids doit être égale à 100 %."
      : unlinked
        ? "Chaque question notée doit avoir une catégorie de scoring."
        : undefined,
  })

  const rangeProblems = coverageIssues(input.ranges)
  checks.push({
    id: "ranges",
    label: "Result ranges configured",
    ok: rangeProblems.length === 0,
    detail: rangeProblems[0],
  })

  const leadParsed = leadFormSchema.safeParse(input.lead)
  const ctaProblems = input.ranges.filter((range) => range.ctaLabel.trim() && !isHttpUrl(range.ctaUrl))
  checks.push({
    id: "cta",
    label: "CTA",
    ok: ctaProblems.length === 0,
    detail: ctaProblems.length > 0 ? "Un CTA a un libellé sans URL valide." : undefined,
  })
  checks.push({
    id: "lead",
    label: "Lead capture configured",
    ok: leadParsed.success,
    detail: leadParsed.success ? undefined : "Le formulaire de lead est invalide.",
  })
  const consentOk = !input.lead.consentRequired || input.lead.consentLabel.trim().length >= 8
  checks.push({
    id: "consent",
    label: "Privacy consent configured",
    ok: consentOk,
    detail: consentOk ? undefined : "Le texte de consentement est requis.",
  })

  return { ready: checks.every((check) => check.ok), checks }
}

export function coverageIssues(ranges: ScoreRange[]) {
  const issues = rangeIssues(ranges)
  const valid = ranges
    .filter((range) => range.minPercent <= range.maxPercent)
    .sort((a, b) => a.minPercent - b.minPercent || a.maxPercent - b.maxPercent)
  if (valid.length === 0) {
    issues.push("Aucune plage de résultat.")
    return issues
  }
  const first = valid[0]
  const last = valid[valid.length - 1]
  if (first && first.minPercent > 0) issues.push("Les plages ne commencent pas à 0.")
  if (last && last.maxPercent < 100) issues.push("Les plages ne couvrent pas 100.")
  return issues
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

export function completionBlockers(input: { weights: number[]; hasCategories: boolean; matchedRange: boolean }) {
  const issues: string[] = []
  if (input.hasCategories && !weightsMatchTarget(input.weights)) {
    issues.push("Les poids de scoring ne totalisent pas 100 %.")
  }
  if (!input.matchedRange) issues.push("Aucune plage ne correspond à ce score.")
  return issues
}
