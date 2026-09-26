"use client"

import { useState } from "react"
import { saveLanding } from "@/actions/builder"
import { LandingView, type LandingContent } from "@/components/assessment/landing-view"
import { AssetField } from "@/components/scorecard-builder/asset-field"
import { AreaField, TextField, ToggleField } from "@/components/scorecard-builder/editor-fields"
import { Button } from "@/components/ui/button"
import { useAutosave } from "@/hooks/use-autosave"
import { landingSchema, type LandingInput } from "@/lib/validators/builder"
import type { BuilderPage } from "@/types/builder"

export function LandingStep({
  page,
  privacyText,
  organizationId,
  scorecardId,
  preview,
  onChange,
}: {
  page: BuilderPage
  privacyText: string
  organizationId: string
  scorecardId: string
  preview: LandingContent
  onChange: (value: LandingInput) => void
}) {
  const [value, setValue] = useState<LandingInput>({
    eyebrow: page.eyebrow,
    title: page.title,
    subtitle: page.subtitle,
    description: page.description,
    heroImageUrl: page.heroImageUrl,
    ctaLabel: page.ctaLabel,
    estimatedTimeLabel: page.estimatedTimeLabel,
    showEstimatedTime: page.showEstimatedTime,
    showQuestionCount: page.showQuestionCount,
    showPrivacy: page.showPrivacy,
    privacyText,
    benefits: page.benefits,
    testimonial: page.testimonial,
  })

  useAutosave(value, async (current) => {
    const parsed = landingSchema.safeParse(current)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides.", quiet: true }
    return saveLanding(scorecardId, parsed.data)
  })

  function update(next: LandingInput) {
    setValue(next)
    onChange(next)
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-3xl">Page d&apos;accueil</h2>
          <p className="mt-2 text-sm text-muted-foreground">Page d&apos;accueil structurée, sans constructeur libre.</p>
        </div>
        <TextField id="landing-eyebrow" label="Surtitre" value={value.eyebrow} onChange={(eyebrow) => update({ ...value, eyebrow })} />
        <TextField id="landing-title" label="Titre" value={value.title} onChange={(title) => update({ ...value, title })} />
        <TextField id="landing-subtitle" label="Sous-titre" value={value.subtitle} onChange={(subtitle) => update({ ...value, subtitle })} />
        <AreaField id="landing-description" label="Description" value={value.description} onChange={(description) => update({ ...value, description })} />
        <AssetField
          id="landing-hero"
          label="Image héro"
          value={value.heroImageUrl}
          organizationId={organizationId}
          scorecardId={scorecardId}
          kind="hero"
          onChange={(heroImageUrl) => update({ ...value, heroImageUrl })}
        />
        <div className="grid gap-5 md:grid-cols-2">
          <TextField id="landing-cta" label="Libellé du bouton" value={value.ctaLabel} onChange={(ctaLabel) => update({ ...value, ctaLabel })} />
          <TextField
            id="landing-time"
            label="Libellé de durée"
            value={value.estimatedTimeLabel}
            onChange={(estimatedTimeLabel) => update({ ...value, estimatedTimeLabel })}
          />
        </div>
        <div className="flex flex-col gap-3">
          <ToggleField label="Afficher la durée" checked={value.showEstimatedTime} onChange={(showEstimatedTime) => update({ ...value, showEstimatedTime })} />
          <ToggleField label="Afficher le nombre de questions" checked={value.showQuestionCount} onChange={(showQuestionCount) => update({ ...value, showQuestionCount })} />
          <ToggleField label="Afficher le message de confidentialité" checked={value.showPrivacy} onChange={(showPrivacy) => update({ ...value, showPrivacy })} />
        </div>
        <AreaField id="landing-privacy" label="Message de confidentialité" value={value.privacyText} onChange={(privacyText) => update({ ...value, privacyText })} />
        <div className="space-y-4 rounded-2xl border p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-medium">Bénéfices</h3>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => update({ ...value, benefits: [...value.benefits, { title: "Nouveau bénéfice", description: "", icon: "" }] })}
            >
              Ajouter
            </Button>
          </div>
          {value.benefits.length === 0 ? <p className="text-sm text-muted-foreground">Aucun bénéfice pour le moment.</p> : null}
          {value.benefits.map((benefit, index) => (
            <div key={index} className="grid gap-3 rounded-xl bg-muted/40 p-3">
              <TextField
                id={`benefit-title-${index}`}
                label="Titre"
                value={benefit.title}
                onChange={(title) => {
                  const benefits = value.benefits.map((item, itemIndex) => (itemIndex === index ? { ...item, title } : item))
                  update({ ...value, benefits })
                }}
              />
              <TextField
                id={`benefit-description-${index}`}
                label="Description"
                value={benefit.description}
                onChange={(description) => {
                  const benefits = value.benefits.map((item, itemIndex) => (itemIndex === index ? { ...item, description } : item))
                  update({ ...value, benefits })
                }}
              />
              <TextField
                id={`benefit-icon-${index}`}
                label="Icône (optionnelle)"
                value={benefit.icon}
                onChange={(icon) => {
                  const benefits = value.benefits.map((item, itemIndex) => (itemIndex === index ? { ...item, icon } : item))
                  update({ ...value, benefits })
                }}
              />
              <Button
                type="button"
                variant="ghost"
                className="justify-start"
                onClick={() => update({ ...value, benefits: value.benefits.filter((_, itemIndex) => itemIndex !== index) })}
              >
                Retirer ce bénéfice
              </Button>
            </div>
          ))}
        </div>
        <div className="space-y-4 rounded-2xl border p-4">
          <h3 className="font-medium">Témoignage</h3>
          <AreaField
            id="testimonial-quote"
            label="Citation"
            rows={3}
            value={value.testimonial.quote}
            onChange={(quote) => update({ ...value, testimonial: { ...value.testimonial, quote } })}
          />
          <TextField
            id="testimonial-author"
            label="Auteur"
            value={value.testimonial.author}
            onChange={(author) => update({ ...value, testimonial: { ...value.testimonial, author } })}
          />
          <TextField
            id="testimonial-role"
            label="Rôle"
            value={value.testimonial.role}
            onChange={(role) => update({ ...value, testimonial: { ...value.testimonial, role } })}
          />
        </div>
      </div>
      <div className="overflow-hidden rounded-3xl border bg-[#f7f4ee] xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-auto">
        <LandingView content={{ ...preview, ...landingPreview(value, preview) }} />
      </div>
    </div>
  )
}

function landingPreview(value: LandingInput, preview: LandingContent): LandingContent {
  return {
    ...preview,
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
    privacyText: value.privacyText,
    benefits: value.benefits,
    testimonial: value.testimonial,
  }
}
