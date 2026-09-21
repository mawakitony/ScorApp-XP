"use client"

import { useState } from "react"
import { saveLeadForm } from "@/actions/builder"
import { AreaField, TextField, ToggleField } from "@/components/scorecard-builder/editor-fields"
import { Label } from "@/components/ui/label"
import { useAutosave } from "@/hooks/use-autosave"
import { leadFieldKeys, leadFormSchema, type LeadFormInput } from "@/lib/validators/builder"
import type { BuilderLeadForm } from "@/types/builder"

const timingLabels: Record<LeadFormInput["timing"], string> = {
  before: "Avant le questionnaire",
  during: "Pendant le questionnaire",
  before_results: "Avant les résultats",
  after_results: "Après les résultats",
}

const fieldLabels: Record<(typeof leadFieldKeys)[number], string> = {
  first_name: "Prénom",
  last_name: "Nom",
  email: "Email",
  phone: "Téléphone",
  whatsapp: "WhatsApp",
  company: "Entreprise",
  job_title: "Fonction",
  country: "Pays",
  city: "Ville",
}

export function LeadStep({
  scorecardId,
  leadForm,
  onChange,
}: {
  scorecardId: string
  leadForm: BuilderLeadForm
  onChange: (leadForm: BuilderLeadForm) => void
}) {
  const [value, setValue] = useState<LeadFormInput>(leadForm)

  useAutosave(value, async (current) => {
    const parsed = leadFormSchema.safeParse(current)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide.", quiet: true }
    return saveLeadForm(scorecardId, parsed.data)
  })

  function update(next: LeadFormInput) {
    setValue(next)
    onChange(next)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl">Lead Capture</h2>
        <p className="mt-2 text-sm text-muted-foreground">Le formulaire est enregistré, sans collecte visiteur pour l&apos;instant.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="lead-timing">Moment de collecte</Label>
        <select
          id="lead-timing"
          className="h-10 w-full max-w-md rounded-lg border bg-card px-3 text-sm"
          value={value.timing}
          onChange={(event) => update({ ...value, timing: event.target.value as LeadFormInput["timing"] })}
        >
          {Object.entries(timingLabels).map(([timing, label]) => (
            <option key={timing} value={timing}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-4">
        {leadFieldKeys.map((key) => {
          const field = value.fields[key]
          return (
            <div key={key} className="grid gap-3 rounded-2xl border p-4 md:grid-cols-2">
              <p className="font-medium md:col-span-2">{fieldLabels[key]}</p>
              <ToggleField
                label="Activé"
                checked={field.enabled}
                onChange={(enabled) => update({ ...value, fields: { ...value.fields, [key]: { ...field, enabled } } })}
              />
              <ToggleField
                label="Obligatoire"
                checked={field.required}
                onChange={(required) => update({ ...value, fields: { ...value.fields, [key]: { ...field, required } } })}
              />
              <TextField
                id={`lead-label-${key}`}
                label="Libellé"
                value={field.label}
                onChange={(label) => update({ ...value, fields: { ...value.fields, [key]: { ...field, label } } })}
              />
              <TextField
                id={`lead-placeholder-${key}`}
                label="Placeholder"
                value={field.placeholder}
                onChange={(placeholder) => update({ ...value, fields: { ...value.fields, [key]: { ...field, placeholder } } })}
              />
            </div>
          )
        })}
      </div>
      <div className="space-y-4 rounded-2xl border p-4">
        <ToggleField
          label="Case de consentement"
          checked={value.consentRequired}
          onChange={(consentRequired) => update({ ...value, consentRequired })}
        />
        <AreaField
          id="lead-consent"
          label="Texte de consentement"
          rows={3}
          value={value.consentLabel}
          onChange={(consentLabel) => update({ ...value, consentLabel })}
        />
        <TextField
          id="lead-privacy-url"
          label="URL de la politique de confidentialité"
          value={value.privacyPolicyUrl}
          onChange={(privacyPolicyUrl) => update({ ...value, privacyPolicyUrl })}
        />
      </div>
    </div>
  )
}
