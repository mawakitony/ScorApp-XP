"use client"

import { useMemo, useState } from "react"
import { saveSetup } from "@/actions/builder"
import { AssetField } from "@/components/scorecard-builder/asset-field"
import { AreaField, Field, TextField } from "@/components/scorecard-builder/editor-fields"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAutosave } from "@/hooks/use-autosave"
import { SCORECARD_CATEGORIES, STATUS_LABELS } from "@/lib/constants"
import { slugify } from "@/lib/format"
import { setupSchema, type SetupInput } from "@/lib/validators/builder"
import type { Scorecard } from "@/types/database"

export function SetupStep({
  scorecard,
  publicDescription,
  organizationId,
  onChange,
}: {
  scorecard: Scorecard
  publicDescription: string
  organizationId: string
  onChange: (value: SetupInput) => void
}) {
  const [slugLocked, setSlugLocked] = useState(true)
  const [value, setValue] = useState<SetupInput>({
    name: scorecard.name,
    slug: scorecard.slug,
    description: scorecard.description ?? "",
    publicDescription,
    language: scorecard.language,
    category: scorecard.category,
    status: scorecard.status,
    primaryColor: scorecard.primary_color,
    secondaryColor: scorecard.secondary_color,
    logoUrl: scorecard.logo_url ?? "",
    coverImageUrl: scorecard.cover_image_url ?? "",
    estimatedMinutes: scorecard.estimated_minutes,
  })

  useAutosave(value, async (current) => {
    const parsed = setupSchema.safeParse(current)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides.", quiet: true }
    return saveSetup(scorecard.id, parsed.data)
  })

  const categories = useMemo(() => {
    const known = SCORECARD_CATEGORIES as readonly string[]
    return known.includes(value.category) ? SCORECARD_CATEGORIES : [value.category, ...SCORECARD_CATEGORIES]
  }, [value.category])

  function update(next: SetupInput) {
    setValue(next)
    onChange(next)
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl">Identité</h2>
        <p className="mt-2 text-sm text-muted-foreground">Identité, langue et adresse publique de la scorecard.</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <TextField
          id="setup-name"
          label="Nom"
          value={value.name}
          onChange={(name) => update({ ...value, name, slug: slugLocked ? value.slug : slugify(name) })}
        />
        <TextField
          id="setup-slug"
          label="Adresse publique"
          value={value.slug}
          hint={`URL publique : /s/${value.slug || "votre-slug"}`}
          onChange={(slug) => {
            setSlugLocked(true)
            update({ ...value, slug })
          }}
        />
        <Field label="Langue" htmlFor="setup-language">
          <Select value={value.language} onValueChange={(language) => update({ ...value, language: language as SetupInput["language"] })}>
            <SelectTrigger id="setup-language" className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fr">Français</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Catégorie" htmlFor="setup-category">
          <Select value={value.category} onValueChange={(category) => update({ ...value, category })}>
            <SelectTrigger id="setup-category" className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Statut" htmlFor="setup-status">
          <Select value={value.status} onValueChange={(status) => update({ ...value, status: status as SetupInput["status"] })}>
            <SelectTrigger id="setup-status" className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([status, label]) => (
                <SelectItem key={status} value={status}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Durée estimée (minutes)" htmlFor="setup-minutes">
          <Input
            id="setup-minutes"
            className="h-10"
            type="number"
            min={1}
            max={60}
            value={value.estimatedMinutes}
            onChange={(event) => update({ ...value, estimatedMinutes: Number(event.target.value) })}
          />
        </Field>
        <div className="md:col-span-2">
          <AreaField
            id="setup-internal"
            label="Description interne"
            value={value.description}
            onChange={(description) => update({ ...value, description })}
          />
        </div>
        <div className="md:col-span-2">
          <AreaField
            id="setup-public"
            label="Description publique"
            value={value.publicDescription}
            onChange={(publicDescription) => update({ ...value, publicDescription })}
          />
        </div>
        <ColorField id="setup-primary" label="Couleur principale" value={value.primaryColor} onChange={(primaryColor) => update({ ...value, primaryColor })} />
        <ColorField id="setup-secondary" label="Couleur secondaire" value={value.secondaryColor} onChange={(secondaryColor) => update({ ...value, secondaryColor })} />
        <AssetField
          id="setup-logo"
          label="Logo"
          value={value.logoUrl}
          organizationId={organizationId}
          scorecardId={scorecard.id}
          kind="logo"
          onChange={(logoUrl) => update({ ...value, logoUrl })}
        />
        <AssetField
          id="setup-cover"
          label="Image de couverture"
          value={value.coverImageUrl}
          organizationId={organizationId}
          scorecardId={scorecard.id}
          kind="cover"
          onChange={(coverImageUrl) => update({ ...value, coverImageUrl })}
        />
      </div>
    </div>
  )
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Field label={label} htmlFor={id}>
      <div className="flex gap-2">
        <input
          type="color"
          value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#16324F"}
          onChange={(event) => onChange(event.target.value)}
          className="size-10 rounded-lg border bg-card"
          aria-label={label}
        />
        <Input id={id} className="h-10" value={value} onChange={(event) => onChange(event.target.value)} />
      </div>
    </Field>
  )
}
