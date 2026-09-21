"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { SCORECARD_CATEGORIES, STATUS_LABELS } from "@/lib/constants"
import { slugify } from "@/lib/format"
import { scorecardSchema, type ScorecardFormValues } from "@/lib/validators/scorecard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const languages = [
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
] as const

export function ScorecardForm({
  defaultValues,
  organizationId,
  scorecardId,
  submitLabel,
  onSubmit,
}: {
  defaultValues: ScorecardFormValues
  organizationId?: string
  scorecardId?: string
  submitLabel: string
  onSubmit: (values: ScorecardFormValues) => Promise<{ error?: string; id?: string }>
}) {
  const router = useRouter()
  const [slugLocked, setSlugLocked] = useState(Boolean(scorecardId))
  const form = useForm<ScorecardFormValues>({
    resolver: zodResolver(scorecardSchema),
    defaultValues,
  })

  async function upload(kind: "logo" | "cover", file: File) {
    if (!organizationId || !scorecardId) return
    const extension = file.name.split(".").pop()?.toLowerCase() || "png"
    const path = `${organizationId}/${scorecardId}/${kind}-${Date.now()}.${extension}`
    const supabase = createClient()
    const { error } = await supabase.storage.from("scorecard-assets").upload(path, file, {
      upsert: true,
      contentType: file.type,
    })
    if (error) {
      toast.error("L'image n'a pas pu être envoyée.")
      return
    }
    const { data } = supabase.storage.from("scorecard-assets").getPublicUrl(path)
    form.setValue(kind === "logo" ? "logoUrl" : "coverImageUrl", data.publicUrl, { shouldDirty: true })
    toast.success("Image ajoutée. Enregistrez pour la conserver.")
  }

  return (
    <form
      className="space-y-8"
      onSubmit={form.handleSubmit(async (values) => {
        const result = await onSubmit(values)
        if (result.error) {
          toast.error(result.error)
          return
        }
        toast.success("Scorecard enregistrée.")
        if (result.id && !scorecardId) router.push(`/dashboard/scorecards/${result.id}/builder`)
        else router.refresh()
      })}
    >
      <section className="grid gap-5 md:grid-cols-2">
        <Field label="Nom" error={form.formState.errors.name?.message}>
          <Input
            className="h-10"
            {...form.register("name", {
              onChange: (event) => {
                if (!slugLocked) form.setValue("slug", slugify(event.target.value))
              },
            })}
          />
        </Field>
        <Field label="Slug" error={form.formState.errors.slug?.message} hint="URL publique : /s/votre-slug">
          <Input
            className="h-10"
            {...form.register("slug", {
              onChange: () => setSlugLocked(true),
            })}
          />
        </Field>
        <Field label="Langue" error={form.formState.errors.language?.message}>
          <Controller
            control={form.control}
            name="language"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((language) => (
                    <SelectItem key={language.value} value={language.value}>
                      {language.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Catégorie" error={form.formState.errors.category?.message}>
          <Controller
            control={form.control}
            name="category"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCORECARD_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Statut" error={form.formState.errors.status?.message}>
          <Controller
            control={form.control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Durée estimée (minutes)" error={form.formState.errors.estimatedMinutes?.message}>
          <Input className="h-10" type="number" min={1} max={60} {...form.register("estimatedMinutes", { valueAsNumber: true })} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Description" error={form.formState.errors.description?.message}>
            <Textarea rows={4} {...form.register("description")} />
          </Field>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <h2 className="font-display text-2xl md:col-span-2">Identité visuelle</h2>
        <Controller
          control={form.control}
          name="primaryColor"
          render={({ field }) => (
            <ColorField label="Couleur principale" value={field.value} onChange={field.onChange} />
          )}
        />
        <Controller
          control={form.control}
          name="secondaryColor"
          render={({ field }) => (
            <ColorField label="Couleur secondaire" value={field.value} onChange={field.onChange} />
          )}
        />
        <Field label="Logo" error={form.formState.errors.logoUrl?.message}>
          <Input className="h-10" placeholder="https://" {...form.register("logoUrl")} />
          {scorecardId ? (
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="mt-2 block text-sm"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void upload("logo", file)
              }}
            />
          ) : null}
        </Field>
        <Field label="Image" error={form.formState.errors.coverImageUrl?.message}>
          <Input className="h-10" placeholder="https://" {...form.register("coverImageUrl")} />
          {scorecardId ? (
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="mt-2 block text-sm"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void upload("cover", file)
              }}
            />
          ) : null}
        </Field>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <h2 className="font-display text-2xl md:col-span-2">SEO</h2>
        <Field label="SEO title" error={form.formState.errors.seoTitle?.message}>
          <Input className="h-10" {...form.register("seoTitle")} />
        </Field>
        <Field label="OG title" error={form.formState.errors.ogTitle?.message}>
          <Input className="h-10" {...form.register("ogTitle")} />
        </Field>
        <Field label="Meta description" error={form.formState.errors.seoDescription?.message}>
          <Textarea rows={3} {...form.register("seoDescription")} />
        </Field>
        <Field label="OG description" error={form.formState.errors.ogDescription?.message}>
          <Textarea rows={3} {...form.register("ogDescription")} />
        </Field>
        <div className="md:col-span-2">
          <Field label="OG image" error={form.formState.errors.ogImageUrl?.message}>
            <Input className="h-10" placeholder="https://" {...form.register("ogImageUrl")} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Texte de confidentialité" error={form.formState.errors.privacyText?.message}>
            <Textarea rows={3} {...form.register("privacyText")} />
          </Field>
        </div>
      </section>

      <Button type="submit" size="lg" className="h-10 px-4" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Enregistrement..." : submitLabel}
      </Button>
    </form>
  )
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="size-10 rounded-lg border bg-card"
          aria-label={label}
        />
        <Input className="h-10" value={value} onChange={(event) => onChange(event.target.value)} />
      </div>
    </Field>
  )
}
