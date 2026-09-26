"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { visibleQuestionIds, type VisibilityQuestion } from "@/lib/assessment/visibility"
import { toEngineQuestion } from "@/lib/scoring/from-builder"
import { resolveAssessment } from "@/lib/scoring/outcome"
import type { EligibilityRule } from "@/lib/scoring/eligibility"
import type { BuilderQuestion, BuilderRange, BuilderScoringCategory } from "@/types/builder"
import { isChoiceType } from "@/types/builder"

const quickScores = [0, 25, 50, 75, 100]

export function ResultTester({
  questions,
  categories,
  ranges,
  rules,
  caps,
}: {
  questions: BuilderQuestion[]
  categories: BuilderScoringCategory[]
  ranges: BuilderRange[]
  rules: EligibilityRule[]
  caps: { maxPercent: number }[]
}) {
  const [score, setScore] = useState("75")
  const [answers, setAnswers] = useState<Record<string, { optionIds: string[]; scaleValue?: string; valueText?: string }>>({})
  const engineRanges = ranges.map((range) => ({ id: range.id, minPercent: range.minPercent, maxPercent: range.maxPercent, label: range.label }))
  const storedCaps = caps.map((cap) => ({ ruleType: "cap", config: { maxPercent: cap.maxPercent } }))

  const numeric = useMemo(() => {
    const percent = Number(score)
    if (!Number.isFinite(percent)) return null
    return resolveAssessment({
      questions: [{ id: "preview-score", isScored: true, scoringCategoryId: null, type: "single_choice", options: [{ id: "picked", score: percent }, { id: "ceiling", score: 100 }] }],
      answers: [{ questionId: "preview-score", optionIds: ["picked"] }],
      categories: [],
      ranges: engineRanges,
      caps: storedCaps,
      rules: [],
    })
  }, [engineRanges, score, storedCaps])

  const answered = useMemo(() => resolveAssessment({
    questions: questions.map(toEngineQuestion),
    answers: questions.map((question) => ({
      questionId: question.id,
      optionIds: answers[question.id]?.optionIds ?? [],
      scaleValue: answers[question.id]?.scaleValue === undefined || answers[question.id]?.scaleValue === "" ? undefined : Number(answers[question.id]?.scaleValue),
      valueText: answers[question.id]?.valueText,
    })),
    categories: categories.map((category) => ({ id: category.id, weight: category.weight })),
    ranges: engineRanges,
    caps: storedCaps,
    rules,
  }), [answers, categories, engineRanges, questions, rules, storedCaps])

  const numericRange = ranges.find((range) => range.id === numeric?.finalRange?.id) ?? null

  return (
    <section className="space-y-6 rounded-2xl border p-5">
      <div>
        <h3 className="font-display text-2xl">Tester un résultat</h3>
        <p className="mt-2 text-sm text-muted-foreground">Le test utilise le même calcul que le questionnaire public. Rien n&apos;est enregistré.</p>
      </div>
      <div className="space-y-3">
        <label className="space-y-1 text-sm">
          <span>Score</span>
          <Input className="h-10 w-32" type="number" min={0} max={100} value={score} onChange={(event) => setScore(event.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          {quickScores.map((value) => (
            <Button key={value} type="button" variant="outline" className="h-9" onClick={() => setScore(String(value))}>{value}</Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Ce test numérique n&apos;applique pas les règles liées aux réponses.</p>
        {numeric && numericRange ? <OutcomeSummary title="Score saisi" outcomePercent={numeric.officialPercent} matched={numeric.matchedRange?.label} finalRange={numericRange} triggered={[]} /> : <p className="text-sm text-muted-foreground">Saisissez un score entre 0 et 100.</p>}
      </div>
      <div className="space-y-4 border-t pt-4">
        <h4 className="font-medium">Tester avec des réponses</h4>
        {questions.length === 0 ? <p className="text-sm text-muted-foreground">Ajoutez des questions pour tester les règles.</p> : null}
        {questions.map((question) => (
          <AnswerControl
            key={question.id}
            question={question}
            value={answers[question.id]}
            onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
          />
        ))}
        <p className="text-sm">Questions visibles : {visibleLabels(questions, answers).join(", ") || "Aucune"}</p>
        <OutcomeSummary
          title="Réponses sélectionnées"
          outcomePercent={answered.officialPercent}
          matched={answered.matchedRange?.label}
          finalRange={ranges.find((range) => range.id === answered.finalRange?.id) ?? null}
          triggered={answered.triggeredRules.map((rule) => {
            const source = rules.find((item) => item.id === rule.id)
            const question = questions.find((item) => item.id === source?.conditions[0]?.questionId)
            const label = ranges.find((item) => item.id === rule.resultRangeId)?.label ?? "résultat"
            const action = rule.action === "max_result" ? "Résultat maximum" : "Forcer le résultat"
            return `${action} : ${label}${question ? ` (${question.title})` : ""}`
          })}
        />
      </div>
    </section>
  )
}

function visibleLabels(
  questions: BuilderQuestion[],
  answers: Record<string, { optionIds: string[]; scaleValue?: string; valueText?: string }>,
) {
  const family: VisibilityQuestion[] = questions.map((question) => ({
    id: question.id,
    position: question.position,
    type: question.type,
    options: question.options.map((option) => ({ id: option.id, label: option.label, value: option.value })),
    displayRule: question.displayRule,
  }))
  const drafts = questions.map((question) => ({
    questionId: question.id,
    optionIds: answers[question.id]?.optionIds ?? [],
    scaleValue: answers[question.id]?.scaleValue ? Number(answers[question.id]?.scaleValue) : undefined,
    valueText: answers[question.id]?.valueText,
  }))
  const visible = new Set(visibleQuestionIds(family, drafts))
  return questions.filter((question) => visible.has(question.id)).map((question) => question.title)
}

function OutcomeSummary({
  title,
  outcomePercent,
  matched,
  finalRange,
  triggered,
}: {
  title: string
  outcomePercent: number
  matched: string | undefined
  finalRange: BuilderRange | null
  triggered: string[]
}) {
  return (
    <div className="grid gap-3 rounded-xl bg-muted/40 p-4 text-sm sm:grid-cols-2">
      <p className="sm:col-span-2 font-medium">{title}</p>
      <p>Score calculé : {outcomePercent} %</p>
      <p>Résultat avant règle : {matched ?? "—"}</p>
      <p>Résultat final : {finalRange?.label ?? "—"}</p>
      <p>Badge : {finalRange?.badge || "—"}</p>
      <p className="sm:col-span-2">Description : {finalRange?.description || "—"}</p>
      <p>CTA : {finalRange?.ctaLabel || "—"}</p>
      <p>Règles déclenchées : {triggered.length > 0 ? triggered.join(", ") : "Aucune"}</p>
    </div>
  )
}

function AnswerControl({
  question,
  value,
  onChange,
}: {
  question: BuilderQuestion
  value: { optionIds: string[]; scaleValue?: string; valueText?: string } | undefined
  onChange: (value: { optionIds: string[]; scaleValue?: string; valueText?: string }) => void
}) {
  if (question.type === "scale_5" || question.type === "scale_10" || question.type === "number") {
    return (
      <label className="block space-y-1 text-sm">
        <span>{question.title}</span>
        <Input className="h-10" type="number" value={value?.scaleValue ?? ""} onChange={(event) => onChange({ optionIds: [], scaleValue: event.target.value })} />
      </label>
    )
  }
  if (isChoiceType(question.type)) {
    return (
      <label className="block space-y-1 text-sm">
        <span>{question.title}</span>
        <select className="h-10 w-full rounded-lg border bg-card px-3" value={value?.optionIds[0] ?? ""} onChange={(event) => onChange({ optionIds: event.target.value ? [event.target.value] : [] })}>
          <option value="">Aucune</option>
          {question.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
    )
  }
  return (
    <label className="block space-y-1 text-sm">
      <span>{question.title}</span>
      <Input className="h-10" value={value?.valueText ?? ""} onChange={(event) => onChange({ optionIds: [], valueText: event.target.value })} />
    </label>
  )
}
