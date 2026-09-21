"use server"

import { revalidatePath } from "next/cache"
import { requireScorecardEditor } from "@/lib/auth/editor"
import { evaluatePublish, type PublishCheck } from "@/lib/assessment/publish"
import { getBuilderBundle } from "@/lib/data/builder"

export async function loadPublishReport(scorecardId: string): Promise<{ ready: boolean; checks: PublishCheck[]; error?: string }> {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return { ready: false, checks: [], error: context.error }
  const loaded = await getBuilderBundle(context.organizationId, context.scorecardId)
  if ("error" in loaded || !loaded.bundle) return { ready: false, checks: [], error: loaded.error ?? "Scorecard introuvable." }
  const bundle = loaded.bundle
  return evaluatePublish({
    name: bundle.scorecard.name,
    slug: bundle.scorecard.slug,
    landingTitle: bundle.page.title,
    questions: bundle.questions.map((question) => ({
      isScored: question.isScored,
      scoringCategoryId: question.scoringCategoryId,
    })),
    scoringCategories: bundle.scoringCategories.map((category) => ({ id: category.id, weight: category.weight })),
    ranges: bundle.ranges.map((range) => ({
      id: range.id,
      minPercent: range.minPercent,
      maxPercent: range.maxPercent,
      label: range.label,
      ctaLabel: range.ctaLabel,
      ctaUrl: range.ctaUrl,
    })),
    lead: bundle.leadForm,
  })
}

export async function publishScorecard(scorecardId: string) {
  const report = await loadPublishReport(scorecardId)
  if (report.error) return { error: report.error }
  if (!report.ready) return { error: report.checks.find((check) => !check.ok)?.detail ?? "Publication impossible." }
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return { error: context.error }
  const { error } = await context.supabase
    .from("scorecards")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", context.scorecardId)
    .eq("organization_id", context.organizationId)
  if (error) return { error: "La publication a échoué." }
  revalidatePath(`/dashboard/scorecards/${scorecardId}/builder`)
  revalidatePath(`/dashboard/scorecards/${scorecardId}`)
  revalidatePath("/dashboard/scorecards")
  return { ok: true as const }
}
