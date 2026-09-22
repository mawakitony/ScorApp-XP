"use client"

import { useState } from "react"
import { toast } from "sonner"
import { createResultRange, deleteResultRange, updateResultRange } from "@/actions/builder"
import { ResultView } from "@/components/assessment/result-view"
import { ReportSetup } from "@/components/scorecard-builder/results/report-setup"
import { ConfirmDelete } from "@/components/scorecard-builder/confirm-delete"
import { AreaField, TextField } from "@/components/scorecard-builder/editor-fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAutosave } from "@/hooks/use-autosave"
import { rangeIssues } from "@/lib/scoring/engine"
import { resultRangeSchema } from "@/lib/validators/builder"
import type { BuilderRange, BuilderScoringCategory } from "@/types/builder"

export function ResultsStep({
  scorecardId,
  ranges,
  categories,
  primaryColor,
  disclaimer,
  onChange,
}: {
  scorecardId: string
  ranges: BuilderRange[]
  categories: BuilderScoringCategory[]
  primaryColor: string
  disclaimer: string
  onChange: (ranges: BuilderRange[]) => void
}) {
  const [pending, setPending] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(ranges[0]?.id ?? null)
  const issues = rangeIssues(ranges.map((range) => ({ id: range.id, minPercent: range.minPercent, maxPercent: range.maxPercent, label: range.label })))
  const selected = ranges.find((range) => range.id === selectedId) ?? ranges[0] ?? null

  async function addRange() {
    setPending(true)
    const result = await createResultRange(scorecardId)
    setPending(false)
    if (result.error || !result.data) {
      toast.error(result.error ?? "La plage n'a pas pu être créée.")
      return
    }
    const range: BuilderRange = {
      id: result.data.id,
      minPercent: 0,
      maxPercent: 100,
      label: "New range",
      title: "Titre du résultat",
      description: "",
      badge: "",
      position: ranges.length,
      recommendationId: null,
      recommendationTitle: "Recommandation",
      recommendationBody: "",
      ctaLabel: "",
      ctaUrl: "",
    }
    onChange([...ranges, range])
    setSelectedId(range.id)
  }

  async function removeRange(rangeId: string) {
    const result = await deleteResultRange(scorecardId, rangeId)
    if (result.error) {
      toast.error(result.error)
      return
    }
    const next = ranges.filter((range) => range.id !== rangeId)
    onChange(next)
    if (selectedId === rangeId) setSelectedId(next[0]?.id ?? null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl">Results</h2>
          <p className="mt-2 text-sm text-muted-foreground">Titre, recommandation et appel à l&apos;action pour chaque plage.</p>
        </div>
        <Button type="button" className="h-10" disabled={pending} onClick={() => void addRange()}>
          Ajouter une plage
        </Button>
      </div>
      {issues.length > 0 ? (
        <div className="rounded-xl bg-[#f8ecd4] px-4 py-3 text-sm text-[#8a5a12]" role="alert">
          {issues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </div>
      ) : null}
      {ranges.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">Aucune plage. Exemple : 0–39, 40–59, 60–79, 80–100.</p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            {ranges.map((range) => (
              <RangeCard
                key={range.id}
                scorecardId={scorecardId}
                range={range}
                active={range.id === selected?.id}
                onSelect={() => setSelectedId(range.id)}
                onChange={(next) => onChange(ranges.map((item) => (item.id === next.id ? next : item)))}
                onDelete={() => void removeRange(range.id)}
              />
            ))}
          </div>
          <div className="overflow-hidden rounded-3xl border bg-[#f7f4ee]">
            {selected ? (
              <ResultView
                percentage={selected.maxPercent}
                range={selected}
                categories={categories}
                categoryScores={[]}
                primaryColor={primaryColor}
                disclaimer={disclaimer}
              />
            ) : null}
          </div>
        </div>
      )}
      <ReportSetup scorecardId={scorecardId} categories={categories} />
    </div>
  )
}

function RangeCard({
  scorecardId,
  range,
  active,
  onSelect,
  onChange,
  onDelete,
}: {
  scorecardId: string
  range: BuilderRange
  active: boolean
  onSelect: () => void
  onChange: (range: BuilderRange) => void
  onDelete: () => void
}) {
  const draft = {
    minPercent: range.minPercent,
    maxPercent: range.maxPercent,
    label: range.label,
    title: range.title,
    description: range.description,
    badge: range.badge,
    recommendationTitle: range.recommendationTitle,
    recommendationBody: range.recommendationBody,
    ctaLabel: range.ctaLabel,
    ctaUrl: range.ctaUrl,
  }
  useAutosave(draft, async (current) => {
    const parsed = resultRangeSchema.safeParse(current)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Plage invalide.", quiet: true }
    return updateResultRange(scorecardId, range.id, parsed.data)
  })

  return (
    <article className={`space-y-4 rounded-2xl border p-4 ${active ? "border-primary" : "bg-card"}`}>
      <button type="button" className="text-left text-sm font-medium" onClick={onSelect}>
        {range.minPercent}–{range.maxPercent} · {range.label}
      </button>
      <div className="grid gap-4 md:grid-cols-2">
        <NumberField id={`range-min-${range.id}`} label="Minimum" value={range.minPercent} onChange={(minPercent) => onChange({ ...range, minPercent })} />
        <NumberField id={`range-max-${range.id}`} label="Maximum" value={range.maxPercent} onChange={(maxPercent) => onChange({ ...range, maxPercent })} />
        <TextField id={`range-label-${range.id}`} label="Libellé interne" value={range.label} onChange={(label) => onChange({ ...range, label })} />
        <TextField id={`range-badge-${range.id}`} label="Badge" value={range.badge} onChange={(badge) => onChange({ ...range, badge })} />
        <div className="md:col-span-2">
          <TextField id={`range-title-${range.id}`} label="Titre public" value={range.title} onChange={(title) => onChange({ ...range, title })} />
        </div>
        <div className="md:col-span-2">
          <AreaField id={`range-description-${range.id}`} label="Description" rows={3} value={range.description} onChange={(description) => onChange({ ...range, description })} />
        </div>
        <TextField
          id={`range-rec-title-${range.id}`}
          label="Titre de recommandation"
          value={range.recommendationTitle}
          onChange={(recommendationTitle) => onChange({ ...range, recommendationTitle })}
        />
        <TextField id={`range-cta-${range.id}`} label="Libellé du CTA" value={range.ctaLabel} onChange={(ctaLabel) => onChange({ ...range, ctaLabel })} />
        <div className="md:col-span-2">
          <AreaField
            id={`range-rec-body-${range.id}`}
            label="Recommandation"
            rows={3}
            value={range.recommendationBody}
            onChange={(recommendationBody) => onChange({ ...range, recommendationBody })}
          />
        </div>
        <div className="md:col-span-2">
          <TextField id={`range-cta-url-${range.id}`} label="URL du CTA" value={range.ctaUrl} onChange={(ctaUrl) => onChange({ ...range, ctaUrl })} />
        </div>
      </div>
      <ConfirmDelete title="Supprimer cette plage ?" description="La recommandation associée sera aussi supprimée." onConfirm={onDelete} />
    </article>
  )
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className="h-10" type="number" min={0} max={100} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  )
}
