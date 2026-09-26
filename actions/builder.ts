"use server"

import { revalidatePath } from "next/cache"
import { requireScorecardEditor } from "@/lib/auth/editor"
import { loadPublishReport } from "@/actions/publish"
import { captureUndo } from "@/actions/release"
import { emptyToNull } from "@/lib/format"
import { displayRuleIssues, parseDisplayRule, type VisibilityQuestion } from "@/lib/assessment/visibility"
import { operatorsForQuestion, type EligibilityRule } from "@/lib/scoring/eligibility"
import { eligibilityFromStored } from "@/lib/scoring/parse-rules"
import { rangeIssues, sumWeights } from "@/lib/scoring/engine"
import { serializeLeadFields } from "@/lib/scorecard/content"
import {
  eligibilityRuleSchema,
  landingSchema,
  leadFormSchema,
  optionSchema,
  questionCategorySchema,
  questionSchema,
  resultRangeSchema,
  scoringCategorySchema,
  setupSchema,
  type LandingInput,
  type LeadFormInput,
  type OptionInput,
  type QuestionCategoryInput,
  type QuestionInput,
  type QuestionType,
  type ResultRangeInput,
  type ScoringCategoryInput,
  type SetupInput,
} from "@/lib/validators/builder"

export type MutationResult<T = undefined> = { error?: string; data?: T }

function refresh(scorecardId: string) {
  revalidatePath(`/dashboard/scorecards/${scorecardId}/builder`)
  revalidatePath(`/dashboard/scorecards/${scorecardId}`)
  revalidatePath("/dashboard/scorecards")
}

function invalid<T>(message?: string): MutationResult<T> {
  return { error: message ?? "Données invalides." }
}

export async function saveSetup(scorecardId: string, values: SetupInput): Promise<MutationResult> {
  const parsed = setupSchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message)
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context

  if (parsed.data.status === "published") {
    const current = await context.supabase.from("scorecards").select("status").eq("id", context.scorecardId).maybeSingle()
    if (current.data?.status !== "published") {
      const report = await loadPublishReport(context.scorecardId)
      if (!report.ready) return { error: report.checks.find((check) => !check.ok)?.detail ?? report.error ?? "Publication impossible." }
    }
  }

  const { error } = await context.supabase
    .from("scorecards")
    .update({
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: emptyToNull(parsed.data.description),
      language: parsed.data.language,
      category: parsed.data.category,
      status: parsed.data.status,
      primary_color: parsed.data.primaryColor,
      secondary_color: parsed.data.secondaryColor,
      logo_url: emptyToNull(parsed.data.logoUrl),
      cover_image_url: emptyToNull(parsed.data.coverImageUrl),
      estimated_minutes: parsed.data.estimatedMinutes,
      published_at: parsed.data.status === "published" ? new Date().toISOString() : null,
    })
    .eq("id", context.scorecardId)
    .eq("organization_id", context.organizationId)

  if (error) {
    return { error: error.message.includes("duplicate") || error.code === "23505" ? "Ce slug est déjà utilisé." : "L'enregistrement a échoué." }
  }

  const { data: page } = await context.supabase
    .from("scorecard_pages")
    .select("id")
    .eq("scorecard_id", context.scorecardId)
    .maybeSingle()

  if (page) {
    await context.supabase.from("scorecard_pages").update({ description: emptyToNull(parsed.data.publicDescription) }).eq("id", page.id)
  } else {
    await context.supabase.from("scorecard_pages").insert({
      scorecard_id: context.scorecardId,
      title: parsed.data.name,
      description: emptyToNull(parsed.data.publicDescription),
      cta_text: "Commencer",
    })
  }

  refresh(context.scorecardId)
  return {}
}

export async function saveLanding(scorecardId: string, values: LandingInput): Promise<MutationResult> {
  const parsed = landingSchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message)
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  await captureUndo(scorecardId)

  const payload = {
    eyebrow: emptyToNull(parsed.data.eyebrow),
    title: parsed.data.title,
    subtitle: emptyToNull(parsed.data.subtitle),
    description: emptyToNull(parsed.data.description),
    hero_image_url: emptyToNull(parsed.data.heroImageUrl),
    cta_text: parsed.data.ctaLabel,
    estimated_time_label: emptyToNull(parsed.data.estimatedTimeLabel),
    show_estimated_time: parsed.data.showEstimatedTime,
    show_question_count: parsed.data.showQuestionCount,
    show_privacy: parsed.data.showPrivacy,
    benefits: parsed.data.benefits,
    testimonial: parsed.data.testimonial.quote ? parsed.data.testimonial : null,
  }

  const { data: page } = await context.supabase.from("scorecard_pages").select("id").eq("scorecard_id", context.scorecardId).maybeSingle()
  const write = page
    ? await context.supabase.from("scorecard_pages").update(payload).eq("id", page.id)
    : await context.supabase.from("scorecard_pages").insert({ scorecard_id: context.scorecardId, ...payload })
  if (write.error) return { error: "La landing page n'a pas pu être enregistrée." }

  await context.supabase
    .from("scorecards")
    .update({ privacy_text: emptyToNull(parsed.data.privacyText) })
    .eq("id", context.scorecardId)
    .eq("organization_id", context.organizationId)

  refresh(context.scorecardId)
  return {}
}

export async function createQuestion(
  scorecardId: string,
  type: QuestionType,
): Promise<MutationResult<{ id: string; options: BuilderOptionRow[] }>> {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  await captureUndo(scorecardId)
  const { count } = await context.supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("scorecard_id", context.scorecardId)
    .is("archived_at", null)

  const { data, error } = await context.supabase
    .from("questions")
    .insert({
      scorecard_id: context.scorecardId,
      type,
      title: "Nouvelle question",
      is_required: true,
      is_scored: !["short_text", "long_text", "email", "phone"].includes(type),
      position: count ?? 0,
      settings: type === "scale_10"
        ? { scaleFrom: 1, scaleTo: 10, scoreFrom: 0, scoreTo: 100 }
        : { scaleFrom: 1, scaleTo: 5, scoreFrom: 0, scoreTo: 100 },
    })
    .select("id")
    .single()

  if (error || !data) return { error: "La question n'a pas pu être créée." }
  const options = await seedOptions(context.supabase, data.id, type)
  refresh(context.scorecardId)
  return { data: { id: data.id, options } }
}

export async function updateQuestion(
  scorecardId: string,
  questionId: string,
  values: QuestionInput,
): Promise<MutationResult<{ options: BuilderOptionRow[] }>> {
  const parsed = questionSchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message)
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  await captureUndo(scorecardId)
  const owned = await ownsQuestion(context.supabase, context.scorecardId, questionId)
  if (!owned) return { error: "Question introuvable." }
  const family = await loadVisibilityFamily(context.supabase, context.scorecardId)
  if (!family) return { error: "Les questions n'ont pas pu être vérifiées." }
  const proposed = family.map((question) => question.id === questionId
    ? { ...question, type: parsed.data.type, displayRule: parsed.data.displayRule ?? null }
    : question)
  const issue = displayRuleIssues(proposed)
  if (issue) return { error: issue }
  const current = family.find((question) => question.id === questionId)
  const displayRule = parsed.data.displayRule === undefined ? current?.displayRule ?? null : parsed.data.displayRule
  const settings = displayRule ? { ...parsed.data.settings, displayRule } : parsed.data.settings

  const { error } = await context.supabase
    .from("questions")
    .update({
      title: parsed.data.title,
      description: emptyToNull(parsed.data.description),
      type: parsed.data.type,
      question_category_id: parsed.data.questionCategoryId,
      scoring_category_id: parsed.data.scoringCategoryId,
      is_required: parsed.data.isRequired,
      is_scored: parsed.data.isScored,
      settings,
    })
    .eq("id", questionId)
    .eq("scorecard_id", context.scorecardId)

  if (error) return { error: "Impossible d'enregistrer cette question. Réessayez." }
  const options = await seedOptions(context.supabase, questionId, parsed.data.type)
  refresh(context.scorecardId)
  return { data: { options } }
}

export async function deleteQuestion(scorecardId: string, questionId: string): Promise<MutationResult> {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  await captureUndo(scorecardId)
  const family = await loadVisibilityFamily(context.supabase, context.scorecardId)
  if (family) {
    for (const question of family) {
      if (!question.displayRule || question.id === questionId) continue
      const conditions = question.displayRule.conditions.filter((condition) => condition.questionId !== questionId)
      if (conditions.length === question.displayRule.conditions.length) continue
      const { data: row } = await context.supabase.from("questions").select("settings").eq("id", question.id).eq("scorecard_id", context.scorecardId).maybeSingle()
      const settings = row?.settings && typeof row.settings === "object" && !Array.isArray(row.settings) ? { ...row.settings } : {}
      if (conditions.length === 0) delete settings.displayRule
      else settings.displayRule = { mode: question.displayRule.mode, conditions }
      await context.supabase.from("questions").update({ settings }).eq("id", question.id).eq("scorecard_id", context.scorecardId)
    }
  }
  const archivedAt = new Date().toISOString()
  await context.supabase.from("question_options").update({ archived_at: archivedAt }).eq("question_id", questionId).is("archived_at", null)
  const { error } = await context.supabase.from("questions").update({ archived_at: archivedAt }).eq("id", questionId).eq("scorecard_id", context.scorecardId)
  if (error) return { error: "La suppression a échoué." }
  refresh(context.scorecardId)
  return {}
}

export async function duplicateQuestion(
  scorecardId: string,
  questionId: string,
): Promise<MutationResult<{ id: string; options: BuilderOptionRow[] }>> {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  await captureUndo(scorecardId)
  const { data: source } = await context.supabase.from("questions").select("*").eq("id", questionId).eq("scorecard_id", context.scorecardId).is("archived_at", null).maybeSingle()
  if (!source) return { error: "Question introuvable." }
  const { data: created, error } = await context.supabase
    .from("questions")
    .insert({
      scorecard_id: context.scorecardId,
      question_category_id: source.question_category_id,
      scoring_category_id: source.scoring_category_id,
      type: source.type,
      title: `${source.title} (copie)`,
      description: source.description,
      is_required: source.is_required,
      is_scored: source.is_scored,
      position: source.position + 1,
      max_score: source.max_score,
      settings: source.settings,
    })
    .select("id")
    .single()
  if (error || !created) return { error: "La duplication a échoué." }

  const { data: options } = await context.supabase.from("question_options").select("*").eq("question_id", questionId).is("archived_at", null)
  let copied: BuilderOptionRow[] = []
  if (options?.length) {
    const inserted = await context.supabase
      .from("question_options")
      .insert(
        options.map((option) => ({
          question_id: created.id,
          label: option.label,
          value: option.value,
          score: option.score,
          position: option.position,
        })),
      )
      .select("id, label, value, score, position")
    copied = inserted.data ?? []
  }
  refresh(context.scorecardId)
  return { data: { id: created.id, options: copied } }
}

export async function reorderQuestions(scorecardId: string, ids: string[]): Promise<MutationResult> {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  const family = await loadVisibilityFamily(context.supabase, context.scorecardId)
  if (!family) return { error: "Ordre invalide." }
  const known = new Set(family.map((question) => question.id))
  if (ids.length !== known.size || ids.some((id) => !known.has(id))) return { error: "Ordre invalide." }
  const ordered = ids.flatMap((id, position) => {
    const question = family.find((item) => item.id === id)
    return question ? [{ ...question, position }] : []
  })
  const issue = displayRuleIssues(ordered)
  if (issue) return { error: issue }
  await captureUndo(scorecardId)
  const writes = await Promise.all(
    ids.map((id, position) =>
      context.supabase.from("questions").update({ position }).eq("id", id).eq("scorecard_id", context.scorecardId),
    ),
  )
  if (writes.some((write) => write.error)) return { error: "Le réordonnancement a échoué." }
  refresh(context.scorecardId)
  return {}
}

export async function createQuestionOption(scorecardId: string, questionId: string): Promise<MutationResult<{ id: string }>> {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  if (!(await ownsQuestion(context.supabase, context.scorecardId, questionId))) return { error: "Question introuvable." }
  await captureUndo(scorecardId)
  const { count } = await context.supabase.from("question_options").select("id", { count: "exact", head: true }).eq("question_id", questionId).is("archived_at", null)
  const position = count ?? 0
  const { data, error } = await context.supabase
    .from("question_options")
    .insert({
      question_id: questionId,
      label: `Option ${position + 1}`,
      value: `option-${position + 1}`,
      score: 0,
      position,
    })
    .select("id")
    .single()
  if (error || !data) return { error: "L'option n'a pas pu être ajoutée." }
  refresh(context.scorecardId)
  return { data: { id: data.id } }
}

export async function updateQuestionOption(scorecardId: string, optionId: string, values: OptionInput): Promise<MutationResult> {
  const parsed = optionSchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message)
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  const questionId = await optionQuestionId(context.supabase, context.scorecardId, optionId)
  if (!questionId) return { error: "Option introuvable." }
  await captureUndo(scorecardId)
  const { error } = await context.supabase
    .from("question_options")
    .update({ label: parsed.data.label, value: parsed.data.value, score: parsed.data.score })
    .eq("id", optionId)
    .eq("question_id", questionId)
  if (error) return { error: error.code === "23505" ? "Cette valeur existe déjà." : "L'option n'a pas pu être enregistrée." }
  refresh(context.scorecardId)
  return {}
}

export async function deleteQuestionOption(scorecardId: string, optionId: string): Promise<MutationResult> {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  await captureUndo(scorecardId)
  const questionId = await optionQuestionId(context.supabase, context.scorecardId, optionId)
  if (!questionId) return { error: "Option introuvable." }
  const { error } = await context.supabase.from("question_options").update({ archived_at: new Date().toISOString() }).eq("id", optionId).eq("question_id", questionId)
  if (error) return { error: "La suppression a échoué." }
  refresh(context.scorecardId)
  return {}
}

export async function reorderQuestionOptions(scorecardId: string, questionId: string, ids: string[]): Promise<MutationResult> {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  if (!(await ownsQuestion(context.supabase, context.scorecardId, questionId))) return { error: "Question introuvable." }
  const { data } = await context.supabase.from("question_options").select("id, archived_at").eq("question_id", questionId)
  const known = new Set((data ?? []).filter((row) => !row.archived_at).map((row) => row.id))
  if (ids.length !== known.size || ids.some((id) => !known.has(id))) return { error: "Ordre invalide." }
  await captureUndo(scorecardId)
  const writes = await Promise.all(ids.map((id, position) => context.supabase.from("question_options").update({ position }).eq("id", id).eq("question_id", questionId)))
  if (writes.some((write) => write.error)) return { error: "Le réordonnancement a échoué." }
  refresh(context.scorecardId)
  return {}
}

export async function createQuestionCategory(scorecardId: string): Promise<MutationResult<{ id: string }>> {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  const { count } = await context.supabase.from("question_categories").select("id", { count: "exact", head: true }).eq("scorecard_id", context.scorecardId)
  const { data, error } = await context.supabase
    .from("question_categories")
    .insert({ scorecard_id: context.scorecardId, name: "Nouvelle catégorie", weight: 1, position: count ?? 0 })
    .select("id")
    .single()
  if (error || !data) return { error: "La catégorie n'a pas pu être créée." }
  refresh(context.scorecardId)
  return { data: { id: data.id } }
}

export async function updateQuestionCategory(scorecardId: string, categoryId: string, values: QuestionCategoryInput): Promise<MutationResult> {
  const parsed = questionCategorySchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message)
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  const { error } = await context.supabase
    .from("question_categories")
    .update({
      name: parsed.data.name,
      description: emptyToNull(parsed.data.description),
      icon: emptyToNull(parsed.data.icon),
      weight: parsed.data.weight,
    })
    .eq("id", categoryId)
    .eq("scorecard_id", context.scorecardId)
  if (error) return { error: "La catégorie n'a pas pu être enregistrée." }
  refresh(context.scorecardId)
  return {}
}

export async function deleteQuestionCategory(scorecardId: string, categoryId: string): Promise<MutationResult> {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  await captureUndo(scorecardId)
  const { error } = await context.supabase.from("question_categories").delete().eq("id", categoryId).eq("scorecard_id", context.scorecardId)
  if (error) return { error: "La suppression a échoué." }
  refresh(context.scorecardId)
  return {}
}

export async function duplicateQuestionCategory(scorecardId: string, categoryId: string): Promise<MutationResult<{ id: string }>> {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  const { data: source } = await context.supabase.from("question_categories").select("*").eq("id", categoryId).eq("scorecard_id", context.scorecardId).maybeSingle()
  if (!source) return { error: "Catégorie introuvable." }
  const { data, error } = await context.supabase
    .from("question_categories")
    .insert({
      scorecard_id: context.scorecardId,
      name: `${source.name} (copie)`,
      description: source.description,
      icon: source.icon,
      weight: source.weight,
      position: source.position + 1,
    })
    .select("id")
    .single()
  if (error || !data) return { error: "La duplication a échoué." }
  refresh(context.scorecardId)
  return { data: { id: data.id } }
}

export async function reorderQuestionCategories(scorecardId: string, ids: string[]): Promise<MutationResult> {
  return reorderOwned(scorecardId, "question_categories", ids)
}

export async function createScoringCategory(scorecardId: string): Promise<MutationResult<{ id: string }>> {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  await captureUndo(scorecardId)
  const { count } = await context.supabase.from("scoring_categories").select("id", { count: "exact", head: true }).eq("scorecard_id", context.scorecardId)
  const { data, error } = await context.supabase
    .from("scoring_categories")
    .insert({ scorecard_id: context.scorecardId, name: "Nouvelle catégorie", weight: 1, max_score: 100, position: count ?? 0 })
    .select("id")
    .single()
  if (error || !data) return { error: "La catégorie de scoring n'a pas pu être créée." }
  refresh(context.scorecardId)
  return { data: { id: data.id } }
}

export async function updateScoringCategory(scorecardId: string, categoryId: string, values: ScoringCategoryInput): Promise<MutationResult> {
  const parsed = scoringCategorySchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message)
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  await captureUndo(scorecardId)
  const { error } = await context.supabase
    .from("scoring_categories")
    .update({
      name: parsed.data.name,
      description: emptyToNull(parsed.data.description),
      weight: parsed.data.weight,
      max_score: parsed.data.maxScore,
    })
    .eq("id", categoryId)
    .eq("scorecard_id", context.scorecardId)
  if (error) return { error: "La catégorie de scoring n'a pas pu être enregistrée." }
  refresh(context.scorecardId)
  return {}
}

export async function deleteScoringCategory(scorecardId: string, categoryId: string): Promise<MutationResult> {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  await captureUndo(scorecardId)
  const { error } = await context.supabase.from("scoring_categories").delete().eq("id", categoryId).eq("scorecard_id", context.scorecardId)
  if (error) return { error: "La suppression a échoué." }
  refresh(context.scorecardId)
  return {}
}

export async function reorderScoringCategories(scorecardId: string, ids: string[]): Promise<MutationResult> {
  return reorderOwned(scorecardId, "scoring_categories", ids)
}

export async function createResultRange(scorecardId: string): Promise<MutationResult<{ id: string }>> {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  await captureUndo(scorecardId)
  const { count } = await context.supabase.from("result_ranges").select("id", { count: "exact", head: true }).eq("scorecard_id", context.scorecardId)
  const { data, error } = await context.supabase
    .from("result_ranges")
    .insert({
      scorecard_id: context.scorecardId,
      min_percent: 0,
      max_percent: 100,
      label: "New range",
      title: "Titre du résultat",
      position: count ?? 0,
    })
    .select("id")
    .single()
  if (error || !data) return { error: "La plage n'a pas pu être créée." }
  await context.supabase.from("result_recommendations").insert({ result_range_id: data.id, title: "Recommandation", position: 0 })
  refresh(context.scorecardId)
  return { data: { id: data.id } }
}

export async function updateResultRange(scorecardId: string, rangeId: string, values: ResultRangeInput): Promise<MutationResult> {
  const parsed = resultRangeSchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message)
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  const { data: siblings } = await context.supabase.from("result_ranges").select("id, min_percent, max_percent, label").eq("scorecard_id", context.scorecardId)
  const issues = rangeIssues(
    (siblings ?? []).map((range) =>
      range.id === rangeId
        ? { id: range.id, minPercent: parsed.data.minPercent, maxPercent: parsed.data.maxPercent, label: parsed.data.label }
        : { id: range.id, minPercent: Number(range.min_percent), maxPercent: Number(range.max_percent), label: range.label },
    ),
  )
  if (issues.length > 0) return { error: issues[0] }
  await captureUndo(scorecardId)

  const { error } = await context.supabase
    .from("result_ranges")
    .update({
      min_percent: parsed.data.minPercent,
      max_percent: parsed.data.maxPercent,
      label: parsed.data.label,
      title: parsed.data.title,
      description: emptyToNull(parsed.data.description),
      badge: emptyToNull(parsed.data.badge),
    })
    .eq("id", rangeId)
    .eq("scorecard_id", context.scorecardId)
  if (error) return { error: "La plage n'a pas pu être enregistrée." }

  const { data: recommendation } = await context.supabase.from("result_recommendations").select("id").eq("result_range_id", rangeId).limit(1).maybeSingle()
  const recommendationPayload = {
    title: parsed.data.recommendationTitle || parsed.data.title,
    body: emptyToNull(parsed.data.recommendationBody),
    cta_label: emptyToNull(parsed.data.ctaLabel),
    cta_url: emptyToNull(parsed.data.ctaUrl),
  }
  if (recommendation) {
    await context.supabase.from("result_recommendations").update(recommendationPayload).eq("id", recommendation.id)
  } else if (parsed.data.recommendationTitle || parsed.data.ctaLabel) {
    await context.supabase.from("result_recommendations").insert({ result_range_id: rangeId, ...recommendationPayload, position: 0 })
  }

  refresh(context.scorecardId)
  return {}
}

export async function deleteResultRange(scorecardId: string, rangeId: string): Promise<MutationResult> {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  await captureUndo(scorecardId)
  const { error } = await context.supabase.from("result_ranges").delete().eq("id", rangeId).eq("scorecard_id", context.scorecardId)
  if (error) return { error: "La suppression a échoué." }
  refresh(context.scorecardId)
  return {}
}

export async function saveLeadForm(scorecardId: string, values: LeadFormInput): Promise<MutationResult> {
  const parsed = leadFormSchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message)
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  const payload = {
    timing: parsed.data.timing,
    consent_required: parsed.data.consentRequired,
    consent_label: parsed.data.consentLabel,
    privacy_policy_url: emptyToNull(parsed.data.privacyPolicyUrl),
    fields: serializeLeadFields(parsed.data.fields),
  }
  const { data: existing } = await context.supabase.from("scorecard_lead_forms").select("id").eq("scorecard_id", context.scorecardId).maybeSingle()
  const write = existing
    ? await context.supabase.from("scorecard_lead_forms").update(payload).eq("id", existing.id)
    : await context.supabase.from("scorecard_lead_forms").insert({ scorecard_id: context.scorecardId, ...payload })
  if (write.error) return { error: "Le formulaire n'a pas pu être enregistré." }
  refresh(context.scorecardId)
  return {}
}

async function reorderOwned(
  scorecardId: string,
  table: "question_categories" | "scoring_categories",
  ids: string[],
): Promise<MutationResult> {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  const { data } = await context.supabase.from(table).select("id").eq("scorecard_id", context.scorecardId)
  const known = new Set((data ?? []).map((row) => row.id))
  if (ids.length !== known.size || ids.some((id) => !known.has(id))) return { error: "Ordre invalide." }
  const writes = await Promise.all(
    ids.map((id, position) => context.supabase.from(table).update({ position }).eq("id", id).eq("scorecard_id", context.scorecardId)),
  )
  if (writes.some((write) => write.error)) return { error: "Le réordonnancement a échoué." }
  refresh(context.scorecardId)
  return {}
}

type BuilderOptionRow = { id: string; label: string; value: string | null; score: number; position: number }

async function seedOptions(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  questionId: string,
  type: QuestionType,
): Promise<BuilderOptionRow[]> {
  if (type !== "yes_no" && type !== "single_choice" && type !== "multiple_choice" && type !== "dropdown") return []
  const { count } = await supabase.from("question_options").select("id", { count: "exact", head: true }).eq("question_id", questionId)
  if ((count ?? 0) > 0) return []
  const rows = type === "yes_no"
    ? [
        { question_id: questionId, label: "Oui", value: "yes", score: 100, position: 0 },
        { question_id: questionId, label: "Non", value: "no", score: 0, position: 1 },
      ]
    : [{ question_id: questionId, label: "Option 1", value: "option-1", score: 0, position: 0 }]
  const { data } = await supabase.from("question_options").insert(rows).select("id, label, value, score, position")
  return data ?? []
}

export async function saveEligibilityRules(
  scorecardId: string,
  rules: unknown,
): Promise<MutationResult<{ rules: EligibilityRule[] }>> {
  const parsed = eligibilityRuleSchema.array().max(30).safeParse(rules)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message)
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  await captureUndo(scorecardId)

  const [questions, ranges] = await Promise.all([
    context.supabase.from("questions").select("id, type").eq("scorecard_id", context.scorecardId),
    context.supabase.from("result_ranges").select("id").eq("scorecard_id", context.scorecardId),
  ])
  if (questions.error || ranges.error) return { error: "Les règles n'ont pas pu être vérifiées." }
  const questionById = new Map((questions.data ?? []).map((question) => [question.id, question.type]))
  const rangeIds = new Set((ranges.data ?? []).map((range) => range.id))

  for (const rule of parsed.data) {
    if (!rangeIds.has(rule.resultRangeId)) return { error: "Choisissez un résultat de cette scorecard." }
    for (const condition of rule.conditions) {
      const type = questionById.get(condition.questionId)
      if (!type) return { error: "Choisissez une question de cette scorecard." }
      if (!operatorsForQuestion(type).includes(condition.operator)) return { error: "Cet opérateur ne correspond pas au type de question." }
    }
  }

  const removed = await context.supabase.from("scoring_rules").delete().eq("scorecard_id", context.scorecardId).eq("rule_type", "eligibility")
  if (removed.error) return { error: "Les règles n'ont pas pu être enregistrées. Appliquez la migration des règles obligatoires." }
  if (parsed.data.length === 0) {
    refresh(context.scorecardId)
    return { data: { rules: [] } }
  }

  const inserted = await context.supabase
    .from("scoring_rules")
    .insert(parsed.data.map((rule, position) => ({
      scorecard_id: context.scorecardId,
      rule_type: "eligibility",
      position,
      config: {
        conditions: rule.conditions,
        action: rule.action,
        resultRangeId: rule.resultRangeId,
      },
    })))
    .select("id, config")
  if (inserted.error || !inserted.data) return { error: "Les règles n'ont pas pu être enregistrées. Appliquez la migration des règles obligatoires." }
  refresh(context.scorecardId)
  return {
    data: {
      rules: eligibilityFromStored(
        context.scorecardId,
        inserted.data.map((row) => ({ id: row.id, ruleType: "eligibility", config: row.config })),
      ),
    },
  }
}

export async function saveScoreCap(scorecardId: string, maxPercent: number | null): Promise<MutationResult<{ caps: { id: string; maxPercent: number }[] }>> {
  if (maxPercent !== null && (!Number.isFinite(maxPercent) || maxPercent < 0 || maxPercent > 100)) {
    return { error: "Le plafond doit être compris entre 0 et 100." }
  }
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  await captureUndo(scorecardId)
  const removed = await context.supabase.from("scoring_rules").delete().eq("scorecard_id", context.scorecardId).eq("rule_type", "cap")
  if (removed.error) return { error: "Le plafond n'a pas pu être enregistré." }
  if (maxPercent === null) {
    refresh(context.scorecardId)
    return { data: { caps: [] } }
  }
  const inserted = await context.supabase
    .from("scoring_rules")
    .insert({ scorecard_id: context.scorecardId, rule_type: "cap", config: { maxPercent }, position: 0 })
    .select("id")
    .single()
  if (inserted.error || !inserted.data) return { error: "Le plafond n'a pas pu être enregistré." }
  refresh(context.scorecardId)
  return { data: { caps: [{ id: inserted.data.id, maxPercent }] } }
}

export async function applyScoringProposal(
  scorecardId: string,
  proposal: {
    categories: { id: string | null; name: string; weight: number }[]
    links: { questionId: string; categoryName: string }[]
  },
): Promise<MutationResult<{ categories: { id: string; name: string; weight: number }[]; links: { questionId: string; scoringCategoryId: string }[] }>> {
  if (proposal.categories.length === 0 || proposal.categories.length > 20) return invalid()
  if (Math.abs(sumWeights(proposal.categories.map((category) => category.weight)) - 100) > 0.05) {
    return { error: "Les poids doivent totaliser 100 %." }
  }
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return context
  await captureUndo(scorecardId)

  const existing = await context.supabase.from("scoring_categories").select("id, name, description, max_score, position").eq("scorecard_id", context.scorecardId)
  if (existing.error) return { error: "Le scoring n'a pas pu être préparé." }
  const known = new Map((existing.data ?? []).map((category) => [category.id, category]))
  const saved: { id: string; name: string; weight: number }[] = []

  for (const [index, category] of proposal.categories.entries()) {
    if (!category.name.trim() || category.name.trim().length < 2 || category.weight <= 0 || category.weight > 100) return invalid()
    if (category.id) {
      const current = known.get(category.id)
      if (!current) return { error: "Une catégorie de scoring n'appartient pas à cette scorecard." }
      const { error } = await context.supabase.from("scoring_categories").update({ weight: category.weight }).eq("id", category.id).eq("scorecard_id", context.scorecardId)
      if (error) return { error: "Les poids n'ont pas pu être enregistrés." }
      saved.push({ id: category.id, name: current.name, weight: category.weight })
      continue
    }
    const { data, error } = await context.supabase
      .from("scoring_categories")
      .insert({
        scorecard_id: context.scorecardId,
        name: category.name.trim(),
        weight: category.weight,
        max_score: 100,
        position: (existing.data?.length ?? 0) + index,
      })
      .select("id, name")
      .single()
    if (error || !data) return { error: "Une catégorie de scoring n'a pas pu être créée." }
    saved.push({ id: data.id, name: data.name, weight: category.weight })
  }

  const applied: { questionId: string; scoringCategoryId: string }[] = []
  for (const link of proposal.links) {
    const target = saved.find((category) => category.name.trim().toLowerCase() === link.categoryName.trim().toLowerCase())
    if (!target) continue
    const question = await context.supabase.from("questions").select("id, scoring_category_id").eq("id", link.questionId).eq("scorecard_id", context.scorecardId).maybeSingle()
    if (!question.data || question.data.scoring_category_id) continue
    const { error } = await context.supabase.from("questions").update({ scoring_category_id: target.id }).eq("id", question.data.id).eq("scorecard_id", context.scorecardId).is("scoring_category_id", null)
    if (error) return { error: "Une question n'a pas pu être associée." }
    applied.push({ questionId: question.data.id, scoringCategoryId: target.id })
  }

  refresh(context.scorecardId)
  return { data: { categories: saved, links: applied } }
}

async function loadVisibilityFamily(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  scorecardId: string,
): Promise<VisibilityQuestion[] | null> {
  const questions = await supabase.from("questions").select("id, position, type, settings, archived_at").eq("scorecard_id", scorecardId).order("position")
  if (questions.error) return null
  const active = (questions.data ?? []).filter((question) => !question.archived_at)
  const ids = active.map((question) => question.id)
  const options = ids.length
    ? await supabase.from("question_options").select("id, question_id, label, value, archived_at").in("question_id", ids)
    : { data: [], error: null }
  if (options.error) return null
  const activeOptions = (options.data ?? []).filter((option) => !option.archived_at)
  return active.map((question) => ({
    id: question.id,
    position: question.position,
    type: question.type,
    options: activeOptions.filter((option) => option.question_id === question.id).map((option) => ({
      id: option.id,
      label: option.label,
      value: option.value ?? "",
    })),
    displayRule: parseDisplayRule(question.settings),
  }))
}

async function ownsQuestion(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  scorecardId: string,
  questionId: string,
) {
  const { data } = await supabase.from("questions").select("id").eq("id", questionId).eq("scorecard_id", scorecardId).maybeSingle()
  return Boolean(data)
}

async function optionQuestionId(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  scorecardId: string,
  optionId: string,
) {
  const { data } = await supabase.from("question_options").select("question_id").eq("id", optionId).maybeSingle()
  if (!data) return null
  return (await ownsQuestion(supabase, scorecardId, data.question_id)) ? data.question_id : null
}
