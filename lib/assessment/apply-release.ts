import type { SupabaseClient } from "@supabase/supabase-js"
import type { ReleaseDocument } from "@/lib/assessment/release"
import type { Database } from "@/types/database"

type Client = SupabaseClient<Database>

export async function applyDraftDocument(supabase: Client, scorecardId: string, document: ReleaseDocument) {
  const existing = await supabase.from("questions").select("id").eq("scorecard_id", scorecardId)
  if (existing.error) return { error: "Le brouillon n'a pas pu être lu." }
  const existingIds = new Set((existing.data ?? []).map((question) => question.id))
  const keep = new Set(document.questions.map((question) => question.id))
  const now = new Date().toISOString()

  for (const category of document.scoringCategories) {
    const current = await supabase.from("scoring_categories").select("id").eq("id", category.id).eq("scorecard_id", scorecardId).maybeSingle()
    if (current.data) {
      const updated = await supabase.from("scoring_categories").update({ name: category.name, weight: category.weight, max_score: category.maxScore }).eq("id", category.id).eq("scorecard_id", scorecardId)
      if (updated.error) return { error: "Une catégorie de scoring n'a pas pu être restaurée." }
    } else {
      const inserted = await supabase.from("scoring_categories").insert({
        id: category.id,
        scorecard_id: scorecardId,
        name: category.name,
        weight: category.weight,
        max_score: category.maxScore,
        position: 0,
      })
      if (inserted.error) return { error: "Une catégorie de scoring n'a pas pu être recréée." }
    }
  }

  if (document.page) {
    const page = await supabase.from("scorecard_pages").select("id").eq("scorecard_id", scorecardId).maybeSingle()
    const payload = {
      title: document.page.title,
      subtitle: document.page.subtitle || null,
      description: document.page.description || null,
      cta_text: document.page.ctaLabel,
    }
    const written = page.data
      ? await supabase.from("scorecard_pages").update(payload).eq("id", page.data.id)
      : await supabase.from("scorecard_pages").insert({ scorecard_id: scorecardId, ...payload })
    if (written.error) return { error: "La page publiée n'a pas pu être restaurée." }
  }

  for (const question of document.questions) {
    let questionCategoryId = question.questionCategoryId
    if (questionCategoryId) {
      const category = await supabase.from("question_categories").select("id").eq("id", questionCategoryId).eq("scorecard_id", scorecardId).maybeSingle()
      if (!category.data) questionCategoryId = null
    }
    const fields = {
      title: question.title,
      description: question.description || null,
      type: question.type,
      question_category_id: questionCategoryId,
      scoring_category_id: question.scoringCategoryId,
      is_required: question.isRequired,
      is_scored: question.isScored,
      position: question.position,
      settings: question.settings,
      archived_at: null,
    }
    if (existingIds.has(question.id)) {
      const updated = await supabase.from("questions").update(fields).eq("id", question.id).eq("scorecard_id", scorecardId)
      if (updated.error) return { error: "Une question publiée n'a pas pu être restaurée." }
    } else {
      const inserted = await supabase.from("questions").insert({ id: question.id, scorecard_id: scorecardId, ...fields })
      if (inserted.error) return { error: "Une question publiée n'a pas pu être recréée." }
    }
    const synced = await syncOptions(supabase, question.id, question.options)
    if (synced.error) return synced
  }

  for (const id of existingIds) {
    if (keep.has(id)) continue
    const archived = await supabase.from("questions").update({ archived_at: now }).eq("id", id).eq("scorecard_id", scorecardId).is("archived_at", null)
    if (archived.error) return { error: "Une question du brouillon n'a pas pu être archivée." }
    await supabase.from("question_options").update({ archived_at: now }).eq("question_id", id).is("archived_at", null)
  }

  for (const range of document.ranges) {
    const current = await supabase.from("result_ranges").select("id").eq("id", range.id).eq("scorecard_id", scorecardId).maybeSingle()
    if (current.data) {
      const updated = await supabase.from("result_ranges").update({
        min_percent: range.minPercent,
        max_percent: range.maxPercent,
        label: range.label,
        title: range.title,
      }).eq("id", range.id).eq("scorecard_id", scorecardId)
      if (updated.error) return { error: "Une plage de résultat n'a pas pu être restaurée." }
    } else {
      const inserted = await supabase.from("result_ranges").insert({
        id: range.id,
        scorecard_id: scorecardId,
        min_percent: range.minPercent,
        max_percent: range.maxPercent,
        label: range.label,
        title: range.title,
        position: 0,
      })
      if (inserted.error) return { error: "Une plage de résultat n'a pas pu être recréée." }
    }
  }
  for (const rule of document.rules) {
    const current = await supabase.from("scoring_rules").select("id").eq("id", rule.id).eq("scorecard_id", scorecardId).maybeSingle()
    if (current.data) {
      await supabase.from("scoring_rules").update({ rule_type: rule.ruleType, config: rule.config, position: rule.position }).eq("id", rule.id).eq("scorecard_id", scorecardId)
    } else {
      await supabase.from("scoring_rules").insert({
        id: rule.id,
        scorecard_id: scorecardId,
        rule_type: rule.ruleType,
        config: rule.config,
        position: rule.position,
      })
    }
  }
  return {}
}

async function syncOptions(supabase: Client, questionId: string, options: ReleaseDocument["questions"][number]["options"]) {
  const existing = await supabase.from("question_options").select("id").eq("question_id", questionId)
  if (existing.error) return { error: "Les options n'ont pas pu être lues." }
  const existingIds = new Set((existing.data ?? []).map((option) => option.id))
  const keep = new Set(options.map((option) => option.id))
  const now = new Date().toISOString()
  for (const option of options) {
    const fields = { label: option.label, value: option.value || null, score: option.score, position: option.position, archived_at: null as string | null }
    if (existingIds.has(option.id)) {
      const updated = await supabase.from("question_options").update(fields).eq("id", option.id).eq("question_id", questionId)
      if (updated.error) return { error: "Une option n'a pas pu être restaurée." }
    } else {
      const inserted = await supabase.from("question_options").insert({ id: option.id, question_id: questionId, ...fields })
      if (inserted.error) return { error: "Une option n'a pas pu être recréée." }
    }
  }
  for (const id of existingIds) {
    if (keep.has(id)) continue
    await supabase.from("question_options").update({ archived_at: now }).eq("id", id).is("archived_at", null)
  }
  return {}
}
