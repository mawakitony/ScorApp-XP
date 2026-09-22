import { parseBenefits, parseLeadFields, parseQuestionSettings, parseTestimonial } from "@/lib/scorecard/content"
import { createClient } from "@/lib/supabase/server"
import type { BuilderBundle, BuilderQuestion, BuilderRange } from "@/types/builder"
import type { Json, Scorecard } from "@/types/database"
import { questionTypes } from "@/lib/validators/builder"

export async function getBuilderBundle(organizationId: string, scorecardId: string) {
  const supabase = await createClient()
  const scorecardQuery = await supabase
    .from("scorecards")
    .select("*")
    .eq("id", scorecardId)
    .eq("organization_id", organizationId)
    .maybeSingle()

  if (scorecardQuery.error || !scorecardQuery.data) {
    return { error: "Scorecard introuvable." }
  }

  const scorecard = scorecardQuery.data
  const [pageQuery, questionsQuery, categoriesQuery, scoringQuery, rangesQuery, leadQuery] = await Promise.all([
    supabase.from("scorecard_pages").select("*").eq("scorecard_id", scorecard.id).maybeSingle(),
    supabase.from("questions").select("*").eq("scorecard_id", scorecard.id).order("position"),
    supabase.from("question_categories").select("*").eq("scorecard_id", scorecard.id).order("position"),
    supabase.from("scoring_categories").select("*").eq("scorecard_id", scorecard.id).order("position"),
    supabase.from("result_ranges").select("*").eq("scorecard_id", scorecard.id).order("position"),
    supabase.from("scorecard_lead_forms").select("*").eq("scorecard_id", scorecard.id).maybeSingle(),
  ])

  if (questionsQuery.error || categoriesQuery.error || scoringQuery.error || rangesQuery.error) {
    return { error: "Le builder n'a pas pu charger la structure. Appliquez la migration du builder." }
  }

  const questionIds = (questionsQuery.data ?? []).map((question) => question.id)
  const rangeIds = (rangesQuery.data ?? []).map((range) => range.id)
  const [optionsQuery, recommendationsQuery] = await Promise.all([
    questionIds.length
      ? supabase.from("question_options").select("*").in("question_id", questionIds).order("position")
      : Promise.resolve({ data: [], error: null }),
    rangeIds.length
      ? supabase.from("result_recommendations").select("*").in("result_range_id", rangeIds).order("position")
      : Promise.resolve({ data: [], error: null }),
  ])

  if (optionsQuery.error || recommendationsQuery.error) {
    return { error: "Les options ou recommandations n'ont pas pu être chargées." }
  }

  const page = pageQuery.data
  const lead = leadQuery.data
  const options = optionsQuery.data ?? []
  const recommendations = recommendationsQuery.data ?? []

  const questions: BuilderQuestion[] = (questionsQuery.data ?? []).map((question) => {
  const type = (questionTypes as readonly string[]).includes(question.type)
    ? (question.type as BuilderQuestion["type"])
    : "short_text"
    return {
      id: question.id,
      questionCategoryId: question.question_category_id,
      scoringCategoryId: question.scoring_category_id,
      type,
      title: question.title,
      description: question.description ?? "",
      isRequired: question.is_required,
      isScored: question.is_scored,
      position: question.position,
      settings: parseQuestionSettings(question.settings, type),
      options: options
        .filter((option) => option.question_id === question.id)
        .map((option) => ({
          id: option.id,
          questionId: option.question_id,
          label: option.label,
          value: option.value ?? "",
          score: Number(option.score),
          position: option.position,
        })),
    }
  })

  const ranges: BuilderRange[] = (rangesQuery.data ?? []).map((range) => {
    const recommendation = recommendations.find((item) => item.result_range_id === range.id) ?? null
    return {
      id: range.id,
      minPercent: Number(range.min_percent),
      maxPercent: Number(range.max_percent),
      label: range.label,
      title: range.title,
      description: range.description ?? "",
      badge: range.badge ?? "",
      position: range.position,
      recommendationId: recommendation?.id ?? null,
      recommendationTitle: recommendation?.title ?? "",
      recommendationBody: recommendation?.body ?? "",
      ctaLabel: recommendation?.cta_label ?? "",
      ctaUrl: recommendation?.cta_url ?? "",
    }
  })

  const bundle: BuilderBundle = {
    scorecard: scorecard as Scorecard,
    page: {
      eyebrow: page?.eyebrow ?? "",
      title: page?.title ?? scorecard.name,
      subtitle: page?.subtitle ?? "",
      description: page?.description ?? "",
      heroImageUrl: page?.hero_image_url ?? "",
      ctaLabel: page?.cta_text ?? "Commencer",
      estimatedTimeLabel: page?.estimated_time_label ?? "",
      showEstimatedTime: page?.show_estimated_time ?? true,
      showQuestionCount: page?.show_question_count ?? true,
      showPrivacy: page?.show_privacy ?? true,
      benefits: parseBenefits(page?.benefits ?? null),
      testimonial: parseTestimonial(page?.testimonial ?? null),
    },
    questions,
    questionCategories: (categoriesQuery.data ?? []).map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description ?? "",
      icon: category.icon ?? "",
      weight: Number(category.weight),
      position: category.position,
    })),
    scoringCategories: (scoringQuery.data ?? []).map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description ?? "",
      weight: Number(category.weight),
      maxScore: Number(category.max_score),
      highMessage: category.high_message ?? "",
      mediumMessage: category.medium_message ?? "",
      lowMessage: category.low_message ?? "",
      position: category.position,
    })),
    ranges,
    leadForm: {
      timing: lead?.timing ?? "before_results",
      consentRequired: lead?.consent_required ?? false,
      consentLabel: lead?.consent_label ?? "J'accepte que WOLOYEM utilise mes informations afin de me communiquer mes résultats et les ressources correspondant à mon profil.",
      privacyPolicyUrl: lead?.privacy_policy_url ?? "",
      fields: parseLeadFields((lead?.fields ?? null) as Json | null),
    },
  }

  return { bundle }
}
