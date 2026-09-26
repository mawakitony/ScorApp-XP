"use client"

import { useMemo, useState } from "react"
import { LandingView, type LandingContent } from "@/components/assessment/landing-view"
import { QuestionCard, answerIsEmpty, emptyAnswer, type LocalAnswer } from "@/components/assessment/question-card"
import { ResultView } from "@/components/assessment/result-view"
import { Button } from "@/components/ui/button"
import { isQuestionVisible, pruneHiddenAnswers, type VisibilityQuestion } from "@/lib/assessment/visibility"
import { toEngineQuestion } from "@/lib/scoring/from-builder"
import { resolveAssessment } from "@/lib/scoring/outcome"
import { cn } from "@/lib/utils"
import type { BuilderBundle } from "@/types/builder"
import { leadFieldKeys } from "@/lib/validators/builder"

type Screen = "landing" | "lead" | "questions" | "results"

export function PreviewStep({ bundle }: { bundle: BuilderBundle }) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")
  const [screen, setScreen] = useState<Screen>("landing")
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>({})
  const family = toPreviewVisibility(bundle.questions)
  const drafts = Object.entries(answers).map(([questionId, answer]) => ({
    questionId,
    optionIds: answer.optionIds,
    scaleValue: answer.scaleValue,
    valueText: answer.text,
  }))
  const questions = bundle.questions.filter((question) => {
    const item = family.find((entry) => entry.id === question.id)
    return item ? isQuestionVisible(item, family, drafts) : true
  })
  const question = questions[index]
  const content = toLanding(bundle)

  const score = useMemo(() => {
    return resolveAssessment({
      questions: bundle.questions.map(toEngineQuestion),
      answers: bundle.questions.map((item) => ({
        questionId: item.id,
        optionIds: answers[item.id]?.optionIds ?? [],
        scaleValue: answers[item.id]?.scaleValue,
        valueText: answers[item.id]?.text,
      })),
      categories: bundle.scoringCategories.map((category) => ({ id: category.id, weight: category.weight })),
      ranges: bundle.ranges.map((range) => ({ id: range.id, minPercent: range.minPercent, maxPercent: range.maxPercent, label: range.label })),
      caps: bundle.caps.map((cap) => ({ ruleType: "cap", config: { maxPercent: cap.maxPercent } })),
      rules: bundle.rules,
    })
  }, [answers, bundle.caps, bundle.questions, bundle.ranges, bundle.rules, bundle.scoringCategories])

  const matched = bundle.ranges.find((range) => range.id === score.finalRange?.id) ?? null
  const currentAnswer = question ? answers[question.id] ?? emptyAnswer() : emptyAnswer()
  const blocked = question ? question.isRequired && answerIsEmpty(question, currentAnswer) : false

  function goNext() {
    if (index < questions.length - 1) {
      setIndex((value) => value + 1)
      return
    }
    setScreen(bundle.leadForm.timing === "before_results" || bundle.leadForm.timing === "during" ? "lead" : "results")
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl">Aperçu</h2>
          <p className="mt-2 text-sm text-muted-foreground">Ceci est le brouillon, pas la version publique. Les réponses restent dans le navigateur et aucune session n&apos;est créée.</p>
        </div>
        <div className="flex rounded-xl border p-1" role="group" aria-label="Format d'aperçu">
          {(["desktop", "mobile"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={device === item}
              className={cn("rounded-lg px-3 py-1.5 text-sm", device === item ? "bg-primary text-primary-foreground" : "")}
              onClick={() => setDevice(item)}
            >
              {item === "desktop" ? "Desktop" : "Mobile"}
            </button>
          ))}
        </div>
      </div>
      <div className={cn("mx-auto overflow-hidden rounded-[28px] border bg-[#f7f4ee] shadow-sm", device === "mobile" ? "max-w-[390px]" : "max-w-3xl")}>
        {screen === "landing" ? (
          <LandingView
            content={{ ...content, questionCount: questions.length, previewBanner: bundle.scorecard.status !== "published" }}
            onStart={() => setScreen(bundle.leadForm.timing === "before" ? "lead" : "questions")}
          />
        ) : null}
        {screen === "lead" ? (
          <LeadPreview
            bundle={bundle}
            onContinue={() => setScreen(bundle.leadForm.timing === "before" ? "questions" : bundle.leadForm.timing === "after_results" ? "landing" : "results")}
            onBack={() => setScreen(bundle.leadForm.timing === "before" ? "landing" : "questions")}
          />
        ) : null}
        {screen === "questions" && question ? (
          <div>
            <QuestionCard
              question={{
                id: question.id,
                type: question.type,
                title: question.title,
                description: question.description,
                isRequired: question.isRequired,
                position: question.position,
                scaleFrom: question.settings.scaleFrom,
                scaleTo: question.settings.scaleTo,
                options: question.options.map((option) => ({ id: option.id, label: option.label, value: option.value })),
                displayRule: question.displayRule,
              }}
              index={index}
              total={questions.length}
              answer={currentAnswer}
              primaryColor={bundle.scorecard.primary_color}
              onChange={(answer) => {
                const next = { ...answers, [question.id]: answer }
                const pruned = pruneHiddenAnswers(family, Object.entries(next).map(([questionId, value]) => ({
                  questionId,
                  optionIds: value.optionIds,
                  scaleValue: value.scaleValue,
                  valueText: value.text,
                })))
                const kept: Record<string, LocalAnswer> = {}
                for (const item of pruned.answers) {
                  const current = next[item.questionId]
                  if (current) kept[item.questionId] = current
                }
                if (question && !kept[question.id]) kept[question.id] = answer
                setAnswers(kept)
                const stillVisible = bundle.questions.filter((item) => {
                  const entry = family.find((candidate) => candidate.id === item.id)
                  const nextDrafts = Object.entries(kept).map(([questionId, value]) => ({ questionId, optionIds: value.optionIds, scaleValue: value.scaleValue, valueText: value.text }))
                  return entry ? isQuestionVisible(entry, family, nextDrafts) : true
                })
                if (index >= stillVisible.length) setIndex(Math.max(0, stillVisible.length - 1))
              }}
            />
            <div className="flex justify-between px-5 pb-8">
              <Button
                type="button"
                variant="outline"
                className="h-10"
                onClick={() => {
                  if (index === 0) setScreen(bundle.leadForm.timing === "before" ? "lead" : "landing")
                  else setIndex((value) => value - 1)
                }}
              >
                Précédent
              </Button>
              <Button type="button" className="h-10" disabled={blocked} onClick={goNext}>
                {index === questions.length - 1 ? "Voir le résultat" : "Continuer"}
              </Button>
            </div>
          </div>
        ) : null}
        {screen === "questions" && !question ? (
          <div className="px-5 py-16 text-center text-sm text-[#5e6d7e]">
            <p>Aucune question à prévisualiser.</p>
            <Button type="button" variant="outline" className="mt-4 h-10" onClick={() => setScreen("landing")}>
              Retour
            </Button>
          </div>
        ) : null}
        {screen === "results" ? (
          <div>
            <ResultView
              percentage={score.officialPercent}
              range={matched}
              categories={bundle.scoringCategories}
              categoryScores={score.categoryScores}
              primaryColor={bundle.scorecard.primary_color}
              disclaimer={bundle.scorecard.privacy_text ?? undefined}
            />
            <div className="flex justify-between px-5 pb-8">
              <Button type="button" variant="outline" className="h-10" onClick={() => setScreen("questions")}>
                Précédent
              </Button>
              {bundle.leadForm.timing === "after_results" ? (
                <Button type="button" className="h-10" onClick={() => setScreen("lead")}>
                  Continuer
                </Button>
              ) : (
                <Button type="button" variant="outline" className="h-10" onClick={() => { setScreen("landing"); setIndex(0); setAnswers({}) }}>
                  Recommencer
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function LeadPreview({
  bundle,
  onContinue,
  onBack,
}: {
  bundle: BuilderBundle
  onContinue: () => void
  onBack: () => void
}) {
  const fields = leadFieldKeys.filter((key) => bundle.leadForm.fields[key].enabled)
  return (
    <div className="mx-auto max-w-xl px-5 py-8">
      <h2 className="font-display text-3xl">Vos coordonnées</h2>
      <p className="mt-2 text-sm text-[#5e6d7e]">Aperçu local. Rien n&apos;est envoyé.</p>
      <div className="mt-6 space-y-4">
        {fields.map((key) => {
          const field = bundle.leadForm.fields[key]
          return (
            <label key={key} className="block text-sm">
              {field.label}
              {field.required ? " *" : ""}
              <input className="mt-1 h-11 w-full rounded-xl border bg-white px-3" placeholder={field.placeholder} readOnly />
            </label>
          )
        })}
        {bundle.leadForm.consentRequired ? (
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" disabled />
            <span>
              {bundle.leadForm.consentLabel}
              {bundle.leadForm.privacyPolicyUrl ? (
                <>
                  {" "}
                  <a className="underline" href={bundle.leadForm.privacyPolicyUrl}>
                    Politique de confidentialité
                  </a>
                </>
              ) : null}
            </span>
          </label>
        ) : null}
      </div>
      <div className="mt-6 flex justify-between">
        <Button type="button" variant="outline" className="h-10" onClick={onBack}>
          Précédent
        </Button>
        <Button type="button" className="h-10" onClick={onContinue}>
          Continuer
        </Button>
      </div>
    </div>
  )
}

function toPreviewVisibility(questions: BuilderBundle["questions"]): VisibilityQuestion[] {
  return questions.map((question) => ({
    id: question.id,
    position: question.position,
    type: question.type,
    options: question.options.map((option) => ({ id: option.id, label: option.label, value: option.value })),
    displayRule: question.displayRule,
  }))
}

function toLanding(bundle: BuilderBundle): LandingContent {
  return {
    eyebrow: bundle.page.eyebrow,
    title: bundle.page.title,
    subtitle: bundle.page.subtitle,
    description: bundle.page.description,
    heroImageUrl: bundle.page.heroImageUrl,
    ctaLabel: bundle.page.ctaLabel,
    estimatedTimeLabel: bundle.page.estimatedTimeLabel,
    showEstimatedTime: bundle.page.showEstimatedTime,
    showQuestionCount: bundle.page.showQuestionCount,
    showPrivacy: bundle.page.showPrivacy,
    privacyText: bundle.scorecard.privacy_text ?? "",
    benefits: bundle.page.benefits,
    testimonial: bundle.page.testimonial,
    primaryColor: bundle.scorecard.primary_color,
    secondaryColor: bundle.scorecard.secondary_color,
    logoUrl: bundle.scorecard.logo_url ?? "",
    estimatedMinutes: bundle.scorecard.estimated_minutes,
    questionCount: bundle.questions.length,
  }
}
