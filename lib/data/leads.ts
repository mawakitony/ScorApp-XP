import "server-only"

import { ensureMembership } from "@/lib/data/membership"
import { visitorTimeline } from "@/lib/leads/timeline"
import { dataCompleteness, leadQuality, leadTemperature, qualityBand } from "@/lib/leads/qualification"
import { parseLeadFields } from "@/lib/scorecard/content"
import { createClient } from "@/lib/supabase/server"

export async function listLeads(filters: { query?: string; scorecardId?: string }) {
  const membership = await ensureMembership()
  if (!membership) return { error: "Accès refusé.", leads: [] }
  const supabase = await createClient()
  let request = supabase
    .from("leads")
    .select("id, created_at, source, scorecard_id, respondent_id, result_id, session_id")
    .eq("organization_id", membership.organization.id)
    .order("created_at", { ascending: false })
    .limit(200)
  if (filters.scorecardId) request = request.eq("scorecard_id", filters.scorecardId)
  const { data: leads, error } = await request
  if (error || !leads) return { error: "Les leads n'ont pas pu être chargés.", leads: [] }

  const respondentIds = leads.flatMap((lead) => (lead.respondent_id ? [lead.respondent_id] : []))
  const resultIds = leads.flatMap((lead) => (lead.result_id ? [lead.result_id] : []))
  const scorecardIds = leads.flatMap((lead) => (lead.scorecard_id ? [lead.scorecard_id] : []))
  const [respondents, results, scorecards, ranges] = await Promise.all([
    respondentIds.length ? supabase.from("respondents").select("id, first_name, last_name, email, phone, country").in("id", respondentIds) : Promise.resolve({ data: [] }),
    resultIds.length ? supabase.from("assessment_results").select("id, overall_percent, result_range_id").in("id", resultIds) : Promise.resolve({ data: [] }),
    scorecardIds.length ? supabase.from("scorecards").select("id, name").in("id", scorecardIds) : Promise.resolve({ data: [] }),
    supabase.from("result_ranges").select("id, label"),
  ])
  const term = filters.query?.trim().toLowerCase()
  const rows = leads.flatMap((lead) => {
    const person = respondents.data?.find((item) => item.id === lead.respondent_id) ?? null
    const result = results.data?.find((item) => item.id === lead.result_id) ?? null
    const scorecard = scorecards.data?.find((item) => item.id === lead.scorecard_id) ?? null
    const range = ranges.data?.find((item) => item.id === result?.result_range_id) ?? null
    const name = [person?.first_name, person?.last_name].filter(Boolean).join(" ")
    const haystack = `${name} ${person?.email ?? ""} ${person?.phone ?? ""}`.toLowerCase()
    if (term && !haystack.includes(term)) return []
    return [{
      id: lead.id,
      createdAt: lead.created_at,
      name: name || "—",
      email: person?.email ?? "",
      phone: person?.phone ?? "",
      country: person?.country ?? "",
      score: result ? Number(result.overall_percent) : null,
      result: range?.label ?? "",
      scorecard: scorecard?.name ?? "",
    }]
  })
  const options = (scorecards.data ?? []).map((scorecard) => ({ id: scorecard.id, name: scorecard.name }))
  return { leads: rows, scorecards: options, error: null }
}

export async function getLeadDetail(leadId: string) {
  const membership = await ensureMembership()
  if (!membership) return null
  const supabase = await createClient()
  const { data: lead } = await supabase
    .from("leads")
    .select("id, created_at, source, status, scorecard_id, respondent_id, result_id, session_id, organization_id")
    .eq("id", leadId)
    .eq("organization_id", membership.organization.id)
    .maybeSingle()
  if (!lead) return null

  const [person, result, scorecard, utm, events, clicks, responses, session, tags, notes, activities, form] = await Promise.all([
    lead.respondent_id
      ? supabase.from("respondents").select("first_name, last_name, email, phone, whatsapp, company, job_title, country, city, consent_given, consent_at").eq("id", lead.respondent_id).maybeSingle()
      : Promise.resolve({ data: null }),
    lead.result_id
      ? supabase.from("assessment_results").select("id, overall_percent, result_range_id, calculated_at").eq("id", lead.result_id).maybeSingle()
      : Promise.resolve({ data: null }),
    lead.scorecard_id
      ? supabase.from("scorecards").select("name").eq("id", lead.scorecard_id).maybeSingle()
      : Promise.resolve({ data: null }),
    lead.session_id
      ? supabase.from("utm_tracking").select("utm_source, utm_medium, utm_campaign, utm_content, utm_term").eq("session_id", lead.session_id).maybeSingle()
      : Promise.resolve({ data: null }),
    lead.session_id
      ? supabase.from("events").select("event_type, created_at").eq("session_id", lead.session_id).order("created_at")
      : Promise.resolve({ data: [] }),
    lead.session_id
      ? supabase.from("cta_clicks").select("url, created_at").eq("session_id", lead.session_id).order("created_at")
      : Promise.resolve({ data: [] }),
    lead.session_id
      ? supabase.from("responses").select("question_id, option_id, value_text, value_number").eq("session_id", lead.session_id)
      : Promise.resolve({ data: [] }),
    lead.session_id
      ? supabase.from("assessment_sessions").select("status, referrer, started_at, completed_at").eq("id", lead.session_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("lead_tag_assignments").select("tag_id").eq("lead_id", lead.id),
    supabase.from("lead_notes").select("id, content, created_at").eq("lead_id", lead.id).order("created_at", { ascending: false }),
    supabase.from("lead_activities").select("summary, created_at").eq("lead_id", lead.id).order("created_at"),
    lead.scorecard_id
      ? supabase.from("scorecard_lead_forms").select("fields").eq("scorecard_id", lead.scorecard_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const range = result.data?.result_range_id
    ? await supabase.from("result_ranges").select("label, title, description").eq("id", result.data.result_range_id).maybeSingle()
    : { data: null }
  const categoryScores = result.data
    ? await supabase.from("category_scores").select("scoring_category_id, percent").eq("result_id", result.data.id)
    : { data: [] }
  const categoryIds = (categoryScores.data ?? []).map((score) => score.scoring_category_id)
  const categories = categoryIds.length
    ? await supabase.from("scoring_categories").select("id, name").in("id", categoryIds)
    : { data: [] }
  const questionIds = [...new Set((responses.data ?? []).map((response) => response.question_id))]
  const questions = questionIds.length
    ? await supabase.from("questions").select("id, title, position").in("id", questionIds)
    : { data: [] }
  const optionIds = (responses.data ?? []).flatMap((response) => (response.option_id ? [response.option_id] : []))
  const options = optionIds.length
    ? await supabase.from("question_options").select("id, label").in("id", optionIds)
    : { data: [] }

  const grouped = new Map<string, string[]>()
  for (const response of responses.data ?? []) {
    const label = response.option_id
      ? options.data?.find((option) => option.id === response.option_id)?.label ?? "Option"
      : response.value_text || (response.value_number !== null ? String(response.value_number) : "")
    const current = grouped.get(response.question_id) ?? []
    if (label) current.push(label)
    grouped.set(response.question_id, current)
  }

  const tagIds = (tags.data ?? []).map((row) => row.tag_id)
  const tagRows = tagIds.length
    ? await supabase.from("lead_tags").select("id, name, color").in("id", tagIds)
    : { data: [] }
  const fields = parseLeadFields(form.data?.fields ?? null)
  const score = result.data ? Number(result.data.overall_percent) : null
  const ctaClicked = (clicks.data ?? []).length > 0
  const completed = session.data?.status === "completed"
  const completeness = dataCompleteness(
    {
      email: person.data?.email,
      phone: person.data?.phone,
      country: person.data?.country,
      company: person.data?.company,
      jobTitle: person.data?.job_title,
    },
    {
      email: fields.email.enabled,
      phone: fields.phone.enabled,
      country: fields.country.enabled,
      company: fields.company.enabled,
      jobTitle: fields.job_title.enabled,
    },
  )
  const quality = leadQuality({ assessmentScore: score, completed, ctaClicked, completeness })
  const timeline = visitorTimeline(events.data ?? [], [
    ...(result.data ? [{ at: result.data.calculated_at, label: `Score : ${Math.round(Number(result.data.overall_percent))} %` }] : []),
    ...(clicks.data ?? []).map((click) => ({ at: click.created_at, label: `CTA : ${click.url}` })),
    ...(activities.data ?? []).map((activity) => ({ at: activity.created_at, label: activity.summary })),
  ])

  return {
    id: lead.id,
    createdAt: lead.created_at,
    status: lead.status,
    source: lead.source || "direct",
    scorecard: scorecard.data?.name ?? "",
    scorecardId: lead.scorecard_id,
    person: person.data,
    score,
    temperature: leadTemperature(score, ctaClicked),
    quality,
    qualityBand: qualityBand(quality),
    completeness,
    completed,
    range: range.data,
    categories: (categoryScores.data ?? []).map((scoreRow) => ({
      name: categories.data?.find((category) => category.id === scoreRow.scoring_category_id)?.name ?? "Catégorie",
      percent: Number(scoreRow.percent),
    })),
    answers: [...grouped.entries()]
      .map(([questionId, labels]) => ({
        title: questions.data?.find((question) => question.id === questionId)?.title ?? "Question",
        position: questions.data?.find((question) => question.id === questionId)?.position ?? 0,
        labels,
      }))
      .sort((a, b) => a.position - b.position),
    utm: utm.data,
    referrer: session.data?.referrer ?? null,
    events: events.data ?? [],
    clicks: clicks.data ?? [],
    tags: tagRows.data ?? [],
    notes: notes.data ?? [],
    timeline,
  }
}
