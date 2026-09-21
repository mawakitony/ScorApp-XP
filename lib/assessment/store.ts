import "server-only"

import { createHash } from "node:crypto"
import { cookies, headers } from "next/headers"
import { canContinueSession, canStartSession } from "@/lib/assessment/access"
import { isSessionExpired, resumeIndex, validateAnswer, type AnswerDraft } from "@/lib/assessment/answers"
import { SESSION_TTL_DAYS, SESSION_TTL_SECONDS, START_LIMIT_PER_HOUR, TEXT_LIMITS } from "@/lib/assessment/config"
import { toPublicQuestion, type PublicQuestion } from "@/lib/assessment/dto"
import { normalizePerson } from "@/lib/assessment/lead"
import { logAssessment } from "@/lib/assessment/log"
import { completionBlockers } from "@/lib/assessment/publish"
import { applyScoreRules } from "@/lib/assessment/rules"
import { cookieName, createSessionToken, hashSessionToken, sessionCookiePath } from "@/lib/assessment/token"
import { isServiceRoleConfigured } from "@/lib/env"
import { isCountryCode } from "@/lib/geo/countries"
import { calculateAssessment, matchResultRange } from "@/lib/scoring/engine"
import { parseLeadFields, parseQuestionSettings } from "@/lib/scorecard/content"
import { createAdminClient } from "@/lib/supabase/admin"
import { leadFieldKeys } from "@/lib/validators/builder"
import type { BuilderLeadForm } from "@/types/builder"
import type { Json } from "@/types/database"

const genericError = "Cette action n'a pas pu aboutir."

export function friendlyError(message: string | undefined) {
  if (!message) return genericError
  if (message.includes("session_expired")) return "Cette session a expiré."
  if (message.includes("session_completed")) return "Cette évaluation est déjà terminée."
  if (message.includes("option_invalid") || message.includes("question_invalid") || message.includes("answer_invalid")) {
    return "Cette réponse n'est pas valide."
  }
  if (message.includes("session_invalid")) return "Session introuvable."
  if (message.includes("range_invalid") || message.includes("score_invalid") || message.includes("category_invalid")) {
    return "Le résultat n'a pas pu être calculé."
  }
  return null
}

function adminOrNull() {
  if (!isServiceRoleConfigured()) return null
  return createAdminClient()
}

export async function readSessionToken(slug: string) {
  const jar = await cookies()
  const value = jar.get(cookieName())?.value
  if (!value) return null
  return { slug, token: value, hash: hashSessionToken(value) }
}

export async function writeSessionCookie(slug: string, token: string) {
  const path = sessionCookiePath(slug)
  if (!path) return
  const jar = await cookies()
  jar.set({
    name: cookieName(),
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path,
    maxAge: SESSION_TTL_SECONDS,
  })
}

async function clientHash() {
  const requestHeaders = await headers()
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? ""
  const agent = requestHeaders.get("user-agent") ?? ""
  return createHash("sha256").update(`${forwarded}|${agent}`).digest("hex")
}

function deviceType(agent: string) {
  if (/tablet|ipad/i.test(agent)) return "tablet"
  if (/mobile|iphone|android/i.test(agent)) return "mobile"
  if (!agent) return "unknown"
  return "desktop"
}

export async function recordLandingView(scorecardId: string, organizationId: string) {
  const admin = adminOrNull()
  if (!admin) return
  const { error } = await admin.from("events").insert({
    organization_id: organizationId,
    scorecard_id: scorecardId,
    event_type: "landing_viewed",
    metadata: {},
  })
  if (error) logAssessment("assessment.landing.failed", { scorecardId })
}

export async function startSession(input: {
  slug: string
  honeypot: string
  referrer: string
  utmSource: string
  utmMedium: string
  utmCampaign: string
  utmContent: string
  utmTerm: string
}) {
  if (input.honeypot.trim()) return { error: genericError }
  const admin = adminOrNull()
  if (!admin) return { error: "Le parcours est momentanément indisponible." }

  const { data: scorecard, error: scorecardError } = await admin
    .from("scorecards")
    .select("id, organization_id, slug, status")
    .eq("slug", input.slug)
    .maybeSingle()
  if (scorecardError || !scorecard || !canStartSession(scorecard.status)) {
    return { error: "Cette évaluation n'accepte pas de nouvelle session." }
  }

  const hash = await clientHash()
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await admin
    .from("assessment_sessions")
    .select("id", { count: "exact", head: true })
    .eq("client_hash", hash)
    .gte("created_at", since)
  if ((count ?? 0) >= START_LIMIT_PER_HOUR) return { error: "Trop de tentatives. Réessayez plus tard." }

  const token = createSessionToken()
  const tokenHash = hashSessionToken(token)
  const requestHeaders = await headers()
  const agent = requestHeaders.get("user-agent") ?? ""
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: session, error } = await admin
    .from("assessment_sessions")
    .insert({
      scorecard_id: scorecard.id,
      anonymous_key: tokenHash,
      status: "started",
      referrer: input.referrer.trim().slice(0, TEXT_LIMITS.referrer) || null,
      landing_path: `/s/${scorecard.slug}`,
      device_type: deviceType(agent),
      expires_at: expiresAt,
      client_hash: hash,
      last_activity_at: new Date().toISOString(),
    })
    .select("id")
    .single()
  if (error || !session) {
    logAssessment("assessment.start.failed", { slug: input.slug })
    return { error: genericError }
  }

  await admin.from("utm_tracking").insert({
    session_id: session.id,
    utm_source: clip(input.utmSource),
    utm_medium: clip(input.utmMedium),
    utm_campaign: clip(input.utmCampaign),
    utm_content: clip(input.utmContent),
    utm_term: clip(input.utmTerm),
  })
  await admin.from("events").insert({
    organization_id: scorecard.organization_id,
    scorecard_id: scorecard.id,
    session_id: session.id,
    event_type: "assessment_started",
    metadata: {},
  })
  await writeSessionCookie(scorecard.slug, token)
  return { sessionId: session.id }
}

function clip(value: string) {
  const trimmed = value.trim().slice(0, TEXT_LIMITS.utm)
  return trimmed || null
}

export async function loadVisitorSession(slug: string) {
  const cookie = await readSessionToken(slug)
  const admin = adminOrNull()
  if (!cookie || !admin) return { error: "Session introuvable." as const }

  const { data: session } = await admin
    .from("assessment_sessions")
    .select("id, scorecard_id, status, expires_at, respondent_id, completed_at")
    .eq("anonymous_key", cookie.hash)
    .maybeSingle()
  if (!session) return { error: "Session introuvable." as const }

  const { data: scorecard } = await admin
    .from("scorecards")
    .select("id, organization_id, slug, name, status, logo_url, primary_color, secondary_color, privacy_text")
    .eq("id", session.scorecard_id)
    .maybeSingle()
  if (!scorecard || scorecard.slug !== slug) return { error: "Session introuvable." as const }
  if (!canContinueSession(scorecard.status) && session.status !== "completed") {
    return { error: "Cette évaluation n'est plus disponible." as const }
  }

  return { admin, cookie, session, scorecard }
}

export async function loadQuestions(scorecardId: string) {
  const admin = adminOrNull()
  if (!admin) return []
  const { data: questions } = await admin
    .from("questions")
    .select("id, type, title, description, is_required, is_scored, scoring_category_id, settings, position")
    .eq("scorecard_id", scorecardId)
    .order("position")
  const ids = (questions ?? []).map((question) => question.id)
  const { data: options } = ids.length
    ? await admin.from("question_options").select("id, question_id, label, value, score, position").in("question_id", ids).order("position")
    : { data: [] }
  return (questions ?? []).map((question) => ({
    row: question,
    publicQuestion: toPublicQuestion({
      id: question.id,
      type: question.type,
      title: question.title,
      description: question.description,
      isRequired: question.is_required,
      settings: question.settings,
      options: (options ?? []).filter((option) => option.question_id === question.id),
    }),
    options: (options ?? []).filter((option) => option.question_id === question.id),
  }))
}

export async function saveVisitorAnswer(slug: string, questionId: string, answer: AnswerDraft) {
  const loaded = await loadVisitorSession(slug)
  if ("error" in loaded) return { error: loaded.error }
  const questions = await loadQuestions(loaded.scorecard.id)
  const question = questions.find((item) => item.publicQuestion.id === questionId)
  if (!question) return { error: "Cette réponse n'est pas valide." }
  const settings = parseQuestionSettings(question.row.settings, question.publicQuestion.type)
  const validation = validateAnswer(
    {
      id: question.publicQuestion.id,
      type: question.publicQuestion.type,
      isRequired: question.publicQuestion.isRequired,
      optionIds: question.publicQuestion.options.map((option) => option.id),
      scaleFrom: settings.scaleFrom,
      scaleTo: settings.scaleTo,
    },
    answer,
  )
  if (validation) return { error: validation }

  const text = question.publicQuestion.type === "email" ? answer.text.trim().toLowerCase() : answer.text.trim()
  const numeric = question.publicQuestion.type === "number"
    ? Number(text)
    : question.publicQuestion.type === "scale_5" || question.publicQuestion.type === "scale_10"
      ? answer.scaleValue ?? null
      : null
  const { error } = await loaded.admin.rpc("save_session_answer", {
    p_token_hash: loaded.cookie.hash,
    p_question_id: questionId,
    p_option_ids: answer.optionIds,
    p_value_text: numeric === null ? text : null,
    p_value_number: numeric,
  })
  if (error) {
    logAssessment("assessment.save.failed", { slug })
    return { error: friendlyError(error.message) ?? genericError }
  }
  await loaded.admin.from("events").insert({
    organization_id: loaded.scorecard.organization_id,
    scorecard_id: loaded.scorecard.id,
    session_id: loaded.session.id,
    event_type: "question_answered",
    metadata: { questionId },
  })
  return {}
}

export async function loadSavedAnswers(sessionId: string) {
  const admin = adminOrNull()
  if (!admin) return []
  const { data } = await admin
    .from("responses")
    .select("question_id, option_id, value_text, value_number")
    .eq("session_id", sessionId)
  return data ?? []
}

export async function submitVisitorLead(slug: string, values: Record<string, string>, consent: boolean, honeypot: string) {
  if (honeypot.trim()) return { error: genericError }
  const loaded = await loadVisitorSession(slug)
  if ("error" in loaded) return { error: loaded.error }
  const form = await loadLeadForm(loaded.scorecard.id)
  if (!form) return { error: genericError }
  if (form.consentRequired && !consent) return { error: "Le consentement est requis." }

  const person = normalizePerson({
    firstName: values.first_name ?? "",
    lastName: values.last_name ?? "",
    email: values.email ?? "",
    phone: values.phone ?? "",
    whatsapp: values.whatsapp ?? "",
    company: values.company ?? "",
    jobTitle: values.job_title ?? "",
    country: values.country ?? "",
    city: values.city ?? "",
  })

  for (const key of leadFieldKeys) {
    const field = form.fields[key]
    if (!field.enabled) continue
    const value = values[key] ?? ""
    if (field.required && !value.trim()) return { error: `${field.label} est obligatoire.` }
    if (key === "country" && value.trim() && !isCountryCode(value.trim())) return { error: "Pays invalide." }
  }
  if (form.fields.email.enabled && person.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email)) {
    return { error: "Email invalide." }
  }

  let respondentId: string | null = null
  if (person.email) {
    const { data: existing } = await loaded.admin
      .from("respondents")
      .select("id")
      .eq("organization_id", loaded.scorecard.organization_id)
      .ilike("email", person.email)
      .limit(1)
      .maybeSingle()
    respondentId = existing?.id ?? null
  }

  const respondentPayload = {
    organization_id: loaded.scorecard.organization_id,
    email: person.email || null,
    first_name: person.firstName || null,
    last_name: person.lastName || null,
    phone: person.phone.raw || null,
    phone_normalized: person.phone.normalized || null,
    whatsapp: person.whatsapp.raw || null,
    whatsapp_normalized: person.whatsapp.normalized || null,
    company: person.company || null,
    job_title: person.jobTitle || null,
    country: person.country || null,
    city: person.city || null,
    consent_given: form.consentRequired ? consent : consent,
    consent_text: consent ? form.consentLabel : null,
    consent_at: consent ? new Date().toISOString() : null,
  }

  if (respondentId) {
    await loaded.admin.from("respondents").update(respondentPayload).eq("id", respondentId).eq("organization_id", loaded.scorecard.organization_id)
  } else {
    const inserted = await loaded.admin.from("respondents").insert(respondentPayload).select("id").single()
    if (inserted.error || !inserted.data) {
      logAssessment("assessment.lead.failed", { slug })
      return { error: genericError }
    }
    respondentId = inserted.data.id
  }

  const { data: existingLead } = await loaded.admin.from("leads").select("id").eq("session_id", loaded.session.id).maybeSingle()
  if (!existingLead) {
    const { data: utm } = await loaded.admin.from("utm_tracking").select("utm_source").eq("session_id", loaded.session.id).maybeSingle()
    const created = await loaded.admin.from("leads").insert({
      organization_id: loaded.scorecard.organization_id,
      scorecard_id: loaded.scorecard.id,
      session_id: loaded.session.id,
      respondent_id: respondentId,
      source: utm?.utm_source || "direct",
    })
    if (created.error && created.error.code !== "23505") {
      logAssessment("assessment.lead.failed", { slug })
      return { error: genericError }
    }
  }

  await loaded.admin.from("assessment_sessions").update({ respondent_id: respondentId, last_activity_at: new Date().toISOString() }).eq("id", loaded.session.id)
  await loaded.admin.from("events").insert({
    organization_id: loaded.scorecard.organization_id,
    scorecard_id: loaded.scorecard.id,
    session_id: loaded.session.id,
    event_type: "lead_submitted",
    metadata: {},
  })
  return {}
}

export async function markLeadFormViewed(slug: string) {
  const loaded = await loadVisitorSession(slug)
  if ("error" in loaded) return
  const { error } = await loaded.admin.from("events").insert({
    organization_id: loaded.scorecard.organization_id,
    scorecard_id: loaded.scorecard.id,
    session_id: loaded.session.id,
    event_type: "lead_form_viewed",
    metadata: {},
  })
  if (error && error.code !== "23505") logAssessment("assessment.leadview.failed", { slug })
}

export async function loadLeadForm(scorecardId: string): Promise<BuilderLeadForm | null> {
  const admin = adminOrNull()
  if (!admin) return null
  const { data } = await admin.from("scorecard_lead_forms").select("timing, consent_required, consent_label, privacy_policy_url, fields").eq("scorecard_id", scorecardId).maybeSingle()
  if (!data) return null
  return {
    timing: data.timing,
    consentRequired: data.consent_required,
    consentLabel: data.consent_label,
    privacyPolicyUrl: data.privacy_policy_url ?? "",
    fields: parseLeadFields(data.fields),
  }
}

export async function completeVisitorAssessment(slug: string) {
  const loaded = await loadVisitorSession(slug)
  if ("error" in loaded) return { error: loaded.error }
  if (loaded.session.status === "completed") return { sessionId: loaded.session.id }

  const admin = loaded.admin
  const questions = await loadQuestions(loaded.scorecard.id)
  const responses = await loadSavedAnswers(loaded.session.id)
  const answered = new Set(responses.map((response) => response.question_id))
  const missing = questions.find((question) => question.row.is_required && !answered.has(question.row.id))
  if (missing) return { error: "Il reste des questions obligatoires." }

  const { data: categories } = await admin.from("scoring_categories").select("id, weight").eq("scorecard_id", loaded.scorecard.id)
  const { data: ranges } = await admin.from("result_ranges").select("id, min_percent, max_percent, label").eq("scorecard_id", loaded.scorecard.id)
  const { data: rules } = await admin.from("scoring_rules").select("rule_type, config").eq("scorecard_id", loaded.scorecard.id)
  const engineQuestions = questions.map((question) => {
    const settings = parseQuestionSettings(question.row.settings, question.publicQuestion.type)
    return {
      id: question.row.id,
      isScored: question.row.is_scored,
      scoringCategoryId: question.row.is_scored ? question.row.scoring_category_id : null,
      type: question.row.type,
      options: question.options.map((option) => ({ id: option.id, score: Number(option.score) })),
      scaleFrom: settings.scaleFrom,
      scaleTo: settings.scaleTo,
      scoreFrom: settings.scoreFrom,
      scoreTo: settings.scoreTo,
    }
  })
  const score = calculateAssessment({
    questions: engineQuestions,
    answers: engineQuestions.map((question) => {
      const rows = responses.filter((response) => response.question_id === question.id)
      return {
        questionId: question.id,
        optionIds: rows.flatMap((row) => (row.option_id ? [row.option_id] : [])),
        scaleValue: (() => {
          const raw = rows.find((row) => row.value_number !== null && row.value_number !== undefined)?.value_number
          return raw === undefined || raw === null ? undefined : Number(raw)
        })(),
      }
    }),
    categories: (categories ?? []).map((category) => ({ id: category.id, weight: Number(category.weight) })),
    ranges: (ranges ?? []).map((range) => ({
      id: range.id,
      minPercent: Number(range.min_percent),
      maxPercent: Number(range.max_percent),
      label: range.label,
    })),
  })
  const rangeList = (ranges ?? []).map((range) => ({
    id: range.id,
    minPercent: Number(range.min_percent),
    maxPercent: Number(range.max_percent),
    label: range.label,
  }))
  const percent = applyScoreRules(
    score.weightedScore,
    (rules ?? []).map((rule) => ({ ruleType: rule.rule_type, config: rule.config })),
  )
  const matched = matchResultRange(percent, rangeList)
  const blockers = completionBlockers({
    weights: (categories ?? []).map((category) => Number(category.weight)),
    hasCategories: (categories ?? []).length > 0,
    matchedRange: Boolean(matched),
  })
  if (!Number.isFinite(percent) || blockers.length > 0) {
    logAssessment("assessment.complete.failed", { slug, reason: blockers[0] ?? "nan" })
    return { error: blockers[0] ?? "Le résultat n'a pas pu être calculé." }
  }

  const { data, error } = await admin.rpc("commit_assessment_result", {
    p_token_hash: loaded.cookie.hash,
    p_overall_score: score.rawScore,
    p_overall_percent: percent,
    p_range_id: matched!.id,
    p_categories: score.categoryScores.map((category) => ({
      scoring_category_id: category.categoryId,
      score: category.rawScore,
      percent: category.percent,
      max_score: category.maxScore,
    })) as Json,
  })
  if (error) {
    logAssessment("assessment.complete.failed", { slug })
    return { error: friendlyError(error.message) ?? genericError }
  }
  return { sessionId: loaded.session.id, result: data }
}

export async function loadPublicResult(slug: string, sessionId: string) {
  const loaded = await loadVisitorSession(slug)
  if ("error" in loaded || loaded.session.id !== sessionId) return null
  const admin = loaded.admin
  const { data: result } = await admin
    .from("assessment_results")
    .select("id, overall_percent, result_range_id")
    .eq("session_id", sessionId)
    .maybeSingle()
  if (!result || !result.result_range_id) return null
  const { data: range } = await admin
    .from("result_ranges")
    .select("id, label, title, description, badge")
    .eq("id", result.result_range_id)
    .maybeSingle()
  const { data: recommendation } = await admin
    .from("result_recommendations")
    .select("id, body, cta_label, cta_url")
    .eq("result_range_id", result.result_range_id)
    .order("position")
    .limit(1)
    .maybeSingle()
  const { data: categoryScores } = await admin
    .from("category_scores")
    .select("scoring_category_id, percent")
    .eq("result_id", result.id)
  const categoryIds = (categoryScores ?? []).map((score) => score.scoring_category_id)
  const { data: categories } = categoryIds.length
    ? await admin.from("scoring_categories").select("id, name").in("id", categoryIds)
    : { data: [] }
  await admin.from("events").insert({
    organization_id: loaded.scorecard.organization_id,
    scorecard_id: loaded.scorecard.id,
    session_id: sessionId,
    event_type: "result_viewed",
    metadata: {},
  })
  const { data: existingLead } = await admin.from("leads").select("id").eq("session_id", sessionId).maybeSingle()
  const lead = await loadLeadForm(loaded.scorecard.id)
  return {
    percentage: Number(result.overall_percent),
    badge: range?.badge || range?.label || "",
    title: range?.title || "Résultat",
    description: range?.description ?? "",
    recommendation: recommendation?.body ?? "",
    ctaLabel: recommendation?.cta_label ?? "",
    hasCta: Boolean(recommendation?.cta_label && recommendation.cta_url),
    categories: (categoryScores ?? []).map((score) => ({
      name: categories?.find((category) => category.id === score.scoring_category_id)?.name ?? "Catégorie",
      percent: Number(score.percent),
    })),
    disclaimer: loaded.scorecard.privacy_text ?? "",
    primaryColor: loaded.scorecard.primary_color,
    logoUrl: loaded.scorecard.logo_url,
    name: loaded.scorecard.name,
    showLead: Boolean(lead && !existingLead && (lead.timing === "after_results" || lead.timing === "during")),
    lead,
  }
}

export async function recordCtaClick(slug: string, sessionId: string) {
  const loaded = await loadVisitorSession(slug)
  if ("error" in loaded || loaded.session.id !== sessionId) return null
  const { data: result } = await loaded.admin
    .from("assessment_results")
    .select("result_range_id")
    .eq("session_id", sessionId)
    .maybeSingle()
  if (!result?.result_range_id) return null
  const { data: recommendation } = await loaded.admin
    .from("result_recommendations")
    .select("id, cta_url")
    .eq("result_range_id", result.result_range_id)
    .order("position")
    .limit(1)
    .maybeSingle()
  if (!recommendation?.cta_url) return null
  await loaded.admin.from("cta_clicks").insert({
    session_id: sessionId,
    recommendation_id: recommendation.id,
    url: recommendation.cta_url,
  })
  await loaded.admin.from("events").insert({
    organization_id: loaded.scorecard.organization_id,
    scorecard_id: loaded.scorecard.id,
    session_id: sessionId,
    event_type: "cta_clicked",
    metadata: {},
  })
  return recommendation.cta_url
}

export type { PublicQuestion }

export type AssessmentScreen =
  | { error: string }
  | { redirectTo: string }
  | {
      questions: PublicQuestion[]
      answers: Record<string, AnswerDraft>
      index: number
      lead: BuilderLeadForm | null
      needsLeadFirst: boolean
      needsLeadBeforeResult: boolean
      primaryColor: string
      logoUrl: string | null
    }

export async function loadAssessmentScreen(slug: string): Promise<AssessmentScreen> {
  const loaded = await loadVisitorSession(slug)
  if ("error" in loaded) return { error: loaded.error ?? "Session introuvable." }
  if (loaded.session.status === "completed") {
    return { redirectTo: `/s/${slug}/results/${loaded.session.id}` }
  }
  if (isSessionExpired(loaded.session.expires_at)) return { error: "Cette session a expiré." }

  const questions = await loadQuestions(loaded.scorecard.id)
  const responses = await loadSavedAnswers(loaded.session.id)
  const lead = await loadLeadForm(loaded.scorecard.id)
  const { data: existingLead } = await loaded.admin.from("leads").select("id").eq("session_id", loaded.session.id).maybeSingle()
  const answers: Record<string, AnswerDraft> = {}
  for (const row of responses) {
    const current = answers[row.question_id] ?? { optionIds: [], text: "" }
    if (row.option_id) current.optionIds = [...current.optionIds, row.option_id]
    if (row.value_text) current.text = row.value_text
    if (row.value_number !== null && row.value_number !== undefined) current.scaleValue = Number(row.value_number)
    answers[row.question_id] = current
  }
  const publicQuestions = questions.map((question) => question.publicQuestion)
  const timing = lead?.timing ?? "before_results"
  const hasLead = Boolean(existingLead)
  return {
    questions: publicQuestions,
    answers,
    index: resumeIndex(publicQuestions, new Set(Object.keys(answers))),
    lead,
    needsLeadFirst: timing === "before" && !hasLead,
    needsLeadBeforeResult: (timing === "before_results" || timing === "during") && !hasLead,
    primaryColor: loaded.scorecard.primary_color,
    logoUrl: loaded.scorecard.logo_url,
  }
}
