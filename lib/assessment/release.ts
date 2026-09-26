import { parseDisplayRule } from "@/lib/assessment/visibility"
import { parseQuestionSettings } from "@/lib/scorecard/content"
import type { Json } from "@/types/database"
import type { BuilderBundle } from "@/types/builder"

export type ReleaseOption = {
  id: string
  label: string
  value: string
  score: number
  position: number
}

export type ReleaseQuestion = {
  id: string
  questionCategoryId: string | null
  scoringCategoryId: string | null
  type: string
  title: string
  description: string
  isRequired: boolean
  isScored: boolean
  position: number
  settings: Json
  options: ReleaseOption[]
}

export type ReleaseDocument = {
  version: 1
  questions: ReleaseQuestion[]
  scoringCategories: { id: string; name: string; weight: number; maxScore: number }[]
  ranges: { id: string; minPercent: number; maxPercent: number; label: string; title: string }[]
  rules: { id: string; ruleType: string; config: Json; position: number }[]
  page: { title: string; subtitle: string; description: string; ctaLabel: string } | null
}

export type DraftRow = {
  id: string
  title: string
  archivedAt: string | null
  options: { id: string; label: string; value: string; score: number; archivedAt: string | null }[]
}

export function parseRelease(value: unknown): ReleaseDocument | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as { version?: unknown; questions?: unknown }
  if (raw.version !== 1 || !Array.isArray(raw.questions)) return null
  return value as ReleaseDocument
}

export function documentFromBundle(bundle: BuilderBundle): ReleaseDocument {
  return {
    version: 1,
    questions: bundle.questions.map((question) => ({
      id: question.id,
      questionCategoryId: question.questionCategoryId,
      scoringCategoryId: question.scoringCategoryId,
      type: question.type,
      title: question.title,
      description: question.description,
      isRequired: question.isRequired,
      isScored: question.isScored,
      position: question.position,
      settings: { ...question.settings, ...(question.displayRule ? { displayRule: question.displayRule } : {}) } as Json,
      options: question.options.map((option) => ({
        id: option.id,
        label: option.label,
        value: option.value,
        score: option.score,
        position: option.position,
      })),
    })),
    scoringCategories: bundle.scoringCategories.map((category) => ({
      id: category.id,
      name: category.name,
      weight: category.weight,
      maxScore: category.maxScore,
    })),
    ranges: bundle.ranges.map((range) => ({
      id: range.id,
      minPercent: range.minPercent,
      maxPercent: range.maxPercent,
      label: range.label,
      title: range.title,
    })),
    rules: [
      ...bundle.rules.map((rule, position) => ({
        id: rule.id,
        ruleType: "eligibility",
        config: { conditions: rule.conditions, action: rule.action, resultRangeId: rule.resultRangeId } as Json,
        position,
      })),
      ...bundle.caps.map((cap, position) => ({
        id: cap.id,
        ruleType: "cap",
        config: { maxPercent: cap.maxPercent } as Json,
        position,
      })),
    ],
    page: {
      title: bundle.page.title,
      subtitle: bundle.page.subtitle,
      description: bundle.page.description,
      ctaLabel: bundle.page.ctaLabel,
    },
  }
}

export function sameRelease(left: ReleaseDocument, right: ReleaseDocument) {
  return JSON.stringify(normalizeRelease(left)) === JSON.stringify(normalizeRelease(right))
}

function canonicalSettings(type: string, settings: Json) {
  const parsed = parseQuestionSettings(settings, type)
  const displayRule = parseDisplayRule(settings)
  return displayRule ? { ...parsed, displayRule } : parsed
}

export function normalizeRelease(document: ReleaseDocument) {
  return {
    page: {
      title: document.page?.title ?? "",
      subtitle: document.page?.subtitle ?? "",
      description: document.page?.description ?? "",
      ctaLabel: document.page?.ctaLabel ?? "",
    },
    questions: [...document.questions]
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
      .map((question) => ({
        id: question.id,
        title: question.title,
        description: question.description,
        type: question.type,
        isRequired: question.isRequired,
        isScored: question.isScored,
        questionCategoryId: question.questionCategoryId,
        scoringCategoryId: question.scoringCategoryId,
        settings: canonicalSettings(question.type, question.settings),
        options: [...question.options]
          .sort((a, b) => a.position - b.position)
          .map((option) => ({ id: option.id, label: option.label, value: option.value, score: option.score })),
      })),
    scoringCategories: document.scoringCategories.map((category) => ({ id: category.id, name: category.name, weight: category.weight, maxScore: category.maxScore })),
    ranges: document.ranges.map((range) => ({ id: range.id, minPercent: range.minPercent, maxPercent: range.maxPercent, label: range.label, title: range.title })),
    rules: document.rules.map((rule) => ({ id: rule.id, ruleType: rule.ruleType, config: rule.config })),
  }
}

export function visibleQuestions(rows: DraftRow[]) {
  return rows.filter((row) => row.archivedAt == null)
}

export function historicalQuestions(rows: DraftRow[], answeredIds: string[]) {
  const answered = new Set(answeredIds)
  return rows.filter((row) => row.archivedAt == null || answered.has(row.id))
}

export function archiveQuestion(rows: DraftRow[], questionId: string, at: string) {
  return rows.map((row) => row.id === questionId ? { ...row, archivedAt: at, options: row.options.map((option) => ({ ...option, archivedAt: option.archivedAt ?? at })) } : row)
}

export function archiveOption(rows: DraftRow[], optionId: string, at: string) {
  return rows.map((row) => ({
    ...row,
    options: row.options.map((option) => option.id === optionId ? { ...option, archivedAt: at } : option),
  }))
}

export function optionById(rows: DraftRow[], optionId: string) {
  for (const row of rows) {
    const option = row.options.find((item) => item.id === optionId)
    if (option) return option
  }
  return null
}

export function reactivate(document: ReleaseDocument, rows: DraftRow[]) {
  const published = new Set(document.questions.map((question) => question.id))
  return rows.map((row) => {
    if (!published.has(row.id)) return { ...row, archivedAt: row.archivedAt ?? "draft-only" }
    const source = document.questions.find((question) => question.id === row.id)
    const optionIds = new Set(source?.options.map((option) => option.id) ?? [])
    return {
      ...row,
      id: row.id,
      archivedAt: null,
      title: source?.title ?? row.title,
      options: row.options.map((option) => ({ ...option, archivedAt: optionIds.has(option.id) ? null : option.archivedAt })),
    }
  })
}

export function replaceArchives(rows: DraftRow[], at: string) {
  return rows.map((row) => ({ ...row, archivedAt: at, options: row.options.map((option) => ({ ...option, archivedAt: option.archivedAt ?? at })) }))
}

export function releaseForOrganization(releaseOrganizationId: string, actorOrganizationId: string) {
  return releaseOrganizationId === actorOrganizationId
}

export function duplicateDraft(rows: DraftRow[]) {
  return { status: "draft" as const, release: null, questions: visibleQuestions(rows) }
}
