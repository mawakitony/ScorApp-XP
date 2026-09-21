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
import { BUILDER_STEPS, type BuilderStepId } from "@/lib/constants"
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
  const [step, setStep] = useState<BuilderStepId>(initialStep)
  const [save, setSave] = useState<SaveState>({ status: "idle", savedAt: null })

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
          onPreview={() => changeStep("preview")}
        />
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <BuilderSidebar step={step} onChange={changeStep} />
          <section className="rounded-3xl border bg-card p-4 md:p-6">
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
                onChange={(questions) => setBundle((current) => ({ ...current, questions }))}
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
                ranges={bundle.ranges}
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

export function isBuilderStep(value: string | undefined): value is BuilderStepId {
  return BUILDER_STEPS.some((step) => step.id === value)
}
