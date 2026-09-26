"use client"

import { useState } from "react"
import { BuilderHeader } from "@/components/scorecard-builder/builder-header"
import { BuilderSidebar } from "@/components/scorecard-builder/builder-sidebar"
import { CategoriesStep } from "@/components/scorecard-builder/categories/categories-step"
import { LandingStep } from "@/components/scorecard-builder/landing/landing-step"
import { LeadStep } from "@/components/scorecard-builder/lead-capture/lead-step"
import { PreviewStep } from "@/components/scorecard-builder/preview/preview-step"
import { QuestionsStep } from "@/components/scorecard-builder/questions/questions-step"
import { ResultsStep } from "@/components/scorecard-builder/results/results-step"
import { SaveReporterProvider } from "@/components/scorecard-builder/save-status"
import { ScoringStep } from "@/components/scorecard-builder/scoring/scoring-step"
import { SetupStep } from "@/components/scorecard-builder/setup/setup-step"
import { type BuilderStepId } from "@/lib/constants"
import type { LandingContent } from "@/components/assessment/landing-view"
import type { BuilderBundle, SaveState } from "@/types/builder"
import type { LandingInput, SetupInput } from "@/lib/validators/builder"

export function BuilderShell({
  initial,
  organizationId,
  initialStep,
}: {
  initial: BuilderBundle
  organizationId: string
  initialStep: BuilderStepId
}) {
  const [bundle, setBundle] = useState(initial)
  const [synced, setSynced] = useState(initial)
  const [revision, setRevision] = useState(0)
  if (synced !== initial) {
    const syncing = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("sync")
    setSynced(initial)
    if (syncing) {
      setBundle(initial)
      setRevision((current) => current + 1)
      const url = new URL(window.location.href)
      url.searchParams.delete("sync")
      window.history.replaceState(null, "", `${url.pathname}${url.search}`)
    }
  }
  const [step, setStep] = useState<BuilderStepId>(initialStep)
  const [save, setSave] = useState<SaveState>({ status: "idle", savedAt: null })
  const [mode, setMode] = useState<"simple" | "advanced">("simple")

  function changeStep(next: BuilderStepId) {
    setStep(next)
    const url = new URL(window.location.href)
    url.searchParams.set("step", next)
    window.history.replaceState(null, "", `${url.pathname}${url.search}`)
  }

  function applySetup(value: SetupInput) {
    setBundle((current) => ({
      ...current,
      scorecard: {
        ...current.scorecard,
        name: value.name,
        slug: value.slug,
        description: value.description,
        language: value.language,
        category: value.category,
        status: value.status,
        primary_color: value.primaryColor,
        secondary_color: value.secondaryColor,
        logo_url: value.logoUrl || null,
        cover_image_url: value.coverImageUrl || null,
        estimated_minutes: value.estimatedMinutes,
      },
      page: { ...current.page, description: value.publicDescription },
    }))
  }

  function applyLanding(value: LandingInput) {
    setBundle((current) => ({
      ...current,
      scorecard: { ...current.scorecard, privacy_text: value.privacyText },
      page: {
        ...current.page,
        eyebrow: value.eyebrow,
        title: value.title,
        subtitle: value.subtitle,
        description: value.description,
        heroImageUrl: value.heroImageUrl,
        ctaLabel: value.ctaLabel,
        estimatedTimeLabel: value.estimatedTimeLabel,
        showEstimatedTime: value.showEstimatedTime,
        showQuestionCount: value.showQuestionCount,
        showPrivacy: value.showPrivacy,
        benefits: value.benefits,
        testimonial: value.testimonial,
      },
    }))
  }

  const preview = toLandingContent(bundle)

  return (
    <SaveReporterProvider report={setSave}>
      <div className="space-y-4">
        <BuilderHeader
          name={bundle.scorecard.name}
          status={bundle.scorecard.status}
          save={save}
          scorecardId={bundle.scorecard.id}
          publishedAt={bundle.publication?.publishedAt ?? null}
          unpublished={bundle.publication?.unpublished ?? false}
          canUndo={bundle.publication?.canUndo ?? false}
          onPreview={() => changeStep("preview")}
          onFix={(next) => {
            if (next === "categories" || next === "scoring") setMode("advanced")
            changeStep(next)
          }}
        />
        <div className="grid min-w-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <BuilderSidebar step={step} mode={mode} onMode={setMode} onChange={changeStep} />
          <section className="min-w-0 rounded-3xl border bg-card p-4 md:p-6">
            {step === "setup" ? (
              <SetupStep
                key={bundle.scorecard.id}
                scorecard={bundle.scorecard}
                publicDescription={bundle.page.description}
                organizationId={organizationId}
                onChange={applySetup}
              />
            ) : null}
            {step === "landing" ? (
              <LandingStep
                page={bundle.page}
                privacyText={bundle.scorecard.privacy_text ?? ""}
                organizationId={organizationId}
                scorecardId={bundle.scorecard.id}
                preview={preview}
                onChange={applyLanding}
              />
            ) : null}
            {step === "questions" ? (
              <QuestionsStep
                scorecardId={bundle.scorecard.id}
                questions={bundle.questions}
                categories={bundle.questionCategories}
                scoringCategories={bundle.scoringCategories}
                ranges={bundle.ranges}
                rules={bundle.rules}
                revision={revision}
                onChange={(questions) =>
                  setBundle((current) => ({
                    ...current,
                    questions,
                    publication:
                      current.scorecard.status === "published" && current.publication
                        ? { ...current.publication, unpublished: true }
                        : current.publication,
                  }))
                }
                mode={mode}
                onImported={(value) => setBundle((current) => ({ ...current, ...value }))}
              />
            ) : null}
            {step === "categories" ? (
              <CategoriesStep
                scorecardId={bundle.scorecard.id}
                categories={bundle.questionCategories}
                onChange={(questionCategories) =>
                  setBundle((current) => ({
                    ...current,
                    questionCategories,
                    questions: current.questions.map((question) =>
                      question.questionCategoryId && questionCategories.some((category) => category.id === question.questionCategoryId)
                        ? question
                        : { ...question, questionCategoryId: null },
                    ),
                  }))
                }
              />
            ) : null}
            {step === "scoring" ? (
              <ScoringStep
                scorecardId={bundle.scorecard.id}
                categories={bundle.scoringCategories}
                questions={bundle.questions}
                questionCategories={bundle.questionCategories}
                ranges={bundle.ranges}
                rules={bundle.rules}
                caps={bundle.caps}
                onRules={(rules) => setBundle((current) => ({ ...current, rules }))}
                onCaps={(caps) => setBundle((current) => ({ ...current, caps }))}
                onQuestions={(questions) => setBundle((current) => ({ ...current, questions }))}
                onChange={(scoringCategories) =>
                  setBundle((current) => ({
                    ...current,
                    scoringCategories,
                    questions: current.questions.map((question) =>
                      question.scoringCategoryId && scoringCategories.some((category) => category.id === question.scoringCategoryId)
                        ? question
                        : { ...question, scoringCategoryId: null },
                    ),
                  }))
                }
              />
            ) : null}
            {step === "lead" ? (
              <LeadStep
                scorecardId={bundle.scorecard.id}
                leadForm={bundle.leadForm}
                onChange={(leadForm) => setBundle((current) => ({ ...current, leadForm }))}
              />
            ) : null}
            {step === "results" ? (
              <ResultsStep
                scorecardId={bundle.scorecard.id}
                ranges={bundle.ranges}
                categories={bundle.scoringCategories}
                questions={bundle.questions}
                rules={bundle.rules}
                caps={bundle.caps}
                primaryColor={bundle.scorecard.primary_color}
                disclaimer={bundle.scorecard.privacy_text ?? ""}
                onChange={(ranges) => setBundle((current) => ({ ...current, ranges }))}
              />
            ) : null}
            {step === "preview" ? <PreviewStep bundle={bundle} /> : null}
          </section>
        </div>
      </div>
    </SaveReporterProvider>
  )
}

function toLandingContent(bundle: BuilderBundle): LandingContent {
  return {
    eyebrow: bundle.page.eyebrow,
    title: bundle.page.title || bundle.scorecard.name,
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
    previewBanner: bundle.scorecard.status !== "published",
  }
}

