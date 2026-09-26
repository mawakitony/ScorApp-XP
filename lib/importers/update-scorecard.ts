import type { SupabaseClient } from "@supabase/supabase-js"
import { keptIds } from "@/lib/importers/diff"
import { foreignReferenceMessage } from "@/lib/importers/ownership"
import type { ImportQuestion, QuestionnaireDraft } from "@/lib/importers/model"
import { optionValue } from "@/lib/importers/validate"
import { emptyToNull } from "@/lib/format"
import type { Database, Json } from "@/types/database"
import { defaultSettings } from "@/types/builder"

type Client = SupabaseClient<Database>

export async function applyQuestionnaireUpdate(supabase: Client, scorecardId: string, draft: QuestionnaireDraft, removeMissing: boolean) {
  const [questions, ranges, rules, categories, scoring] = await Promise.all([
    supabase.from("questions").select("id, settings").eq("scorecard_id", scorecardId),
    supabase.from("result_ranges").select("id, label").eq("scorecard_id", scorecardId),
    supabase.from("scoring_rules").select("id").eq("scorecard_id", scorecardId).eq("rule_type", "eligibility"),
    supabase.from("question_categories").select("id, name").eq("scorecard_id", scorecardId),
    supabase.from("scoring_categories").select("id, name").eq("scorecard_id", scorecardId),
  ])
  if (questions.error || ranges.error || rules.error || categories.error || scoring.error) {
    return { error: "La scorecard n'a pas pu être lue." }
  }

  const ownedQuestions = new Set((questions.data ?? []).map((question) => question.id))
  const ownedRanges = new Set((ranges.data ?? []).map((range) => range.id))
  const ownedRules = new Set((rules.data ?? []).map((rule) => rule.id))
  const blocked = foreignReferenceMessage(draft, ownedQuestions, ownedRanges, ownedRules)
  if (blocked) return { error: blocked }

  const categoryIds = await upsertQuestionCategories(supabase, scorecardId, categories.data ?? [], draft.categories.map((category) => ({
    name: category.name,
    description: emptyToNull(category.description),
    weight: category.weight,
    position: category.order,
  })))
  if ("error" in categoryIds) return categoryIds

  const scoringRows = draft.sheets.scoring
    ? draft.scoringCategories.map((category) => ({
        name: category.name,
        description: emptyToNull(category.description),
        weight: category.weight,
        max_score: category.maxScore,
        position: category.order,
        high_message: category.highMessage,
        medium_message: category.mediumMessage,
        low_message: category.lowMessage,
      }))
    : draft.categories.map((category) => ({
        name: category.name,
        description: emptyToNull(category.description),
        weight: category.weight,
        max_score: 100,
        position: category.order,
        high_message: category.highMessage,
        medium_message: category.mediumMessage,
        low_message: category.lowMessage,
      }))
  const scoringIds = await upsertScoringCategories(supabase, scorecardId, scoring.data ?? [], scoringRows)
  if ("error" in scoringIds) return scoringIds

  const rangeIds = new Map((ranges.data ?? []).map((range) => [range.id, range.id]))
  if (draft.sheets.ranges) {
    for (const [index, range] of draft.ranges.entries()) {
      const existingId = range.ref && ownedRanges.has(range.ref) ? range.ref : (ranges.data ?? []).find((item) => item.label === range.label)?.id
      const fields = {
        min_percent: range.minScore,
        max_percent: range.maxScore,
        label: range.label,
        title: range.title,
        description: emptyToNull(range.description),
        badge: emptyToNull(range.badge),
        position: index,
      }
      if (existingId) {
        const updated = await supabase.from("result_ranges").update(fields).eq("id", existingId).eq("scorecard_id", scorecardId)
        if (updated.error) return { error: "Un palier n'a pas pu être mis à jour." }
        rangeIds.set(range.ref || range.label, existingId)
        await writeRecommendation(supabase, existingId, range)
      } else {
        const inserted = await supabase.from("result_ranges").insert({ scorecard_id: scorecardId, ...fields }).select("id").single()
        if (inserted.error || !inserted.data) return { error: "Un palier n'a pas pu être ajouté." }
        rangeIds.set(range.ref || range.label, inserted.data.id)
        rangeIds.set(range.label, inserted.data.id)
        await writeRecommendation(supabase, inserted.data.id, range)
      }
    }
  }

  const questionIds = new Map<string, string>()
  const optionIds = new Map<string, { id: string; label: string; value: string | null }[]>()
  for (const question of draft.questions) {
    const scoringName = question.scoringCategory || question.category
    const fields = {
      title: question.title,
      description: emptyToNull(question.description),
      type: question.type,
      question_category_id: question.category ? categoryIds.get(question.category) ?? null : null,
      scoring_category_id: question.isScored && scoringName ? scoringIds.get(scoringName) ?? null : null,
      is_required: question.required,
      is_scored: question.isScored,
      position: question.order - 1,
    }
    let questionId = question.ref && ownedQuestions.has(question.ref) ? question.ref : ""
    if (questionId) {
      const updated = await supabase.from("questions").update(fields).eq("id", questionId).eq("scorecard_id", scorecardId)
      if (updated.error) return { error: `« ${question.title} » n'a pas pu être mise à jour.` }
    } else {
      const inserted = await supabase.from("questions").insert({
        scorecard_id: scorecardId,
        ...fields,
        settings: defaultSettings(question.type) as unknown as Json,
      }).select("id").single()
      if (inserted.error || !inserted.data) return { error: `« ${question.title} » n'a pas pu être ajoutée.` }
      questionId = inserted.data.id
    }
    questionIds.set(question.ref, questionId)
    const synced = await syncOptions(supabase, questionId, question)
    if ("error" in synced) return synced
    optionIds.set(questionId, synced.options)
  }

  const settingsById = new Map((questions.data ?? []).map((question) => [question.id, question.settings]))
  for (const question of draft.questions) {
    const questionId = questionIds.get(question.ref)
    if (!questionId) continue
    const list = question.displays?.length ? question.displays : question.display ? [question.display] : []
    const current = objectSettings(settingsById.get(questionId) ?? null)
    if (list.length === 0) {
      delete current.displayRule
    } else {
      const conditions = []
      for (const display of list) {
        const sourceId = questionIds.get(display.sourceRef)
        if (!sourceId) return { error: `Une condition de « ${question.title} » vise une question inconnue.` }
        const sourceOptions = optionIds.get(sourceId) ?? []
        conditions.push({ questionId: sourceId, operator: display.operator, value: matchOption(sourceOptions, display.value) })
      }
      current.displayRule = { mode: list[0]?.mode ?? "show_if", conditions }
    }
    const saved = await supabase.from("questions").update({ settings: current as Json }).eq("id", questionId).eq("scorecard_id", scorecardId)
    if (saved.error) return { error: "Une condition d'affichage n'a pas pu être enregistrée." }
  }

  if (draft.rules) {
    const written: string[] = []
    for (const [index, rule] of draft.rules.entries()) {
      const target = rangeIds.get(rule.target) ?? [...rangeIds.entries()].find(([key]) => key.toLowerCase() === rule.target.toLowerCase())?.[1]
      if (!target) return { error: `La règle « ${rule.name} » vise un résultat introuvable.` }
      const conditions = []
      for (const condition of rule.conditions) {
        const sourceId = questionIds.get(condition.sourceRef)
        if (!sourceId) return { error: `La règle « ${rule.name} » vise une question inconnue.` }
        conditions.push({
          questionId: sourceId,
          operator: condition.operator,
          value: matchOption(optionIds.get(sourceId) ?? [], condition.value),
        })
      }
      const config = { conditions, action: rule.action, resultRangeId: target } as Json
      if (ownedRules.has(rule.ref)) {
        const updated = await supabase.from("scoring_rules").update({ config, position: rule.order || index }).eq("id", rule.ref).eq("scorecard_id", scorecardId)
        if (updated.error) return { error: "Une règle obligatoire n'a pas pu être mise à jour." }
        written.push(rule.ref)
      } else {
        const inserted = await supabase.from("scoring_rules").insert({
          scorecard_id: scorecardId,
          rule_type: "eligibility",
          position: rule.order || index,
          config,
        }).select("id").single()
        if (inserted.error || !inserted.data) return { error: "Une règle obligatoire n'a pas pu être ajoutée." }
        written.push(inserted.data.id)
      }
    }
    if (removeMissing) {
      const stale = [...ownedRules].filter((id) => !written.includes(id))
      if (stale.length > 0) {
        const removed = await supabase.from("scoring_rules").delete().eq("scorecard_id", scorecardId).in("id", stale)
        if (removed.error) return { error: "Une règle absente du fichier n'a pas pu être retirée." }
      }
    }
  }

  if (removeMissing) {
    const survivors = keptIds([...ownedQuestions], draft.questions.map((question) => question.ref), true)
    const dropped = [...ownedQuestions].filter((id) => !survivors.includes(id))
    if (dropped.length > 0) {
        const removed = await supabase.from("questions").update({ archived_at: new Date().toISOString() }).eq("scorecard_id", scorecardId).in("id", dropped)
        if (removed.error) return { error: "Une question absente du fichier n'a pas pu être archivée." }
    }
    if (draft.sheets.ranges) {
      const touched = new Set(rangeIds.values())
      const droppedRanges = [...ownedRanges].filter((id) => !touched.has(id))
      if (droppedRanges.length > 0) {
        const removed = await supabase.from("result_ranges").delete().eq("scorecard_id", scorecardId).in("id", droppedRanges)
        if (removed.error) return { error: "Un palier absent du fichier n'a pas pu être retiré." }
      }
    }
  }

  return {}
}

async function upsertQuestionCategories(
  supabase: Client,
  scorecardId: string,
  existing: { id: string; name: string }[],
  rows: { name: string; description: string | null; weight: number; position: number }[],
) {
  const ids = new Map(existing.map((row) => [row.name, row.id]))
  for (const row of rows) {
    const current = ids.get(row.name)
    if (current) {
      const updated = await supabase.from("question_categories").update(row).eq("id", current).eq("scorecard_id", scorecardId)
      if (updated.error) return { error: `La catégorie « ${row.name} » n'a pas pu être mise à jour.` }
    } else {
      const inserted = await supabase.from("question_categories").insert({ scorecard_id: scorecardId, ...row }).select("id").single()
      if (inserted.error || !inserted.data) return { error: `La catégorie « ${row.name} » n'a pas pu être ajoutée.` }
      ids.set(row.name, inserted.data.id)
    }
  }
  return ids
}

async function upsertScoringCategories(
  supabase: Client,
  scorecardId: string,
  existing: { id: string; name: string }[],
  rows: { name: string; description: string | null; weight: number; max_score: number; position: number; high_message: string; medium_message: string; low_message: string }[],
) {
  const ids = new Map(existing.map((row) => [row.name, row.id]))
  for (const row of rows) {
    const current = ids.get(row.name)
    if (current) {
      const updated = await supabase.from("scoring_categories").update(row).eq("id", current).eq("scorecard_id", scorecardId)
      if (updated.error) return { error: `La catégorie « ${row.name} » n'a pas pu être mise à jour.` }
    } else {
      const inserted = await supabase.from("scoring_categories").insert({ scorecard_id: scorecardId, ...row }).select("id").single()
      if (inserted.error || !inserted.data) return { error: `La catégorie « ${row.name} » n'a pas pu être ajoutée.` }
      ids.set(row.name, inserted.data.id)
    }
  }
  return ids
}

async function syncOptions(supabase: Client, questionId: string, question: ImportQuestion) {
  const existing = await supabase.from("question_options").select("id, label, value").eq("question_id", questionId)
  if (existing.error) return { error: "Les options n'ont pas pu être lues." }
  const kept: { id: string; label: string; value: string | null }[] = []
  const used = new Set<string>()
  for (const [index, option] of question.options.entries()) {
    const match = (existing.data ?? []).find((item) => !used.has(item.id) && item.label.trim().toLowerCase() === option.label.trim().toLowerCase())
    const value = option.value || optionValue(option.label, option.position)
    if (match) {
      used.add(match.id)
      const updated = await supabase.from("question_options").update({ label: option.label, value, score: option.score, position: index }).eq("id", match.id)
      if (updated.error) return { error: "Une option n'a pas pu être mise à jour." }
      kept.push({ id: match.id, label: option.label, value })
    } else {
      const inserted = await supabase.from("question_options").insert({
        question_id: questionId,
        label: option.label,
        value,
        score: option.score,
        position: index,
      }).select("id").single()
      if (inserted.error || !inserted.data) return { error: "Une option n'a pas pu être ajoutée." }
      kept.push({ id: inserted.data.id, label: option.label, value })
    }
  }
  const stale = (existing.data ?? []).map((item) => item.id).filter((id) => !used.has(id))
  if (stale.length > 0) {
    const removed = await supabase.from("question_options").update({ archived_at: new Date().toISOString() }).in("id", stale)
    if (removed.error) return { error: "Une option retirée du fichier n'a pas pu être archivée." }
  }
  return { options: kept }
}

async function writeRecommendation(supabase: Client, rangeId: string, range: QuestionnaireDraft["ranges"][number]) {
  const current = await supabase.from("result_recommendations").select("id").eq("result_range_id", rangeId).limit(1).maybeSingle()
  const fields = {
    title: range.title || "Recommandation",
    body: emptyToNull(range.description),
    cta_label: emptyToNull(range.ctaLabel),
    cta_url: emptyToNull(range.ctaUrl),
  }
  if (current.data) {
    await supabase.from("result_recommendations").update(fields).eq("id", current.data.id)
  } else if (range.ctaLabel || range.ctaUrl || range.description) {
    await supabase.from("result_recommendations").insert({ result_range_id: rangeId, ...fields, position: 0 })
  }
}

function objectSettings(value: Json | null) {
  if (value && typeof value === "object" && !Array.isArray(value)) return { ...value } as Record<string, Json>
  return {} as Record<string, Json>
}

function matchOption(options: { id: string; label: string; value: string | null }[], raw: string) {
  const expected = raw.trim().toLowerCase()
  const found = options.find((option) => option.id === raw || option.label.trim().toLowerCase() === expected || (option.value ?? "").trim().toLowerCase() === expected)
  return found?.id ?? raw
}
