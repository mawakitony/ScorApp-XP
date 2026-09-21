"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  createScoringCategory,
  deleteScoringCategory,
  reorderScoringCategories,
  updateScoringCategory,
} from "@/actions/builder"
import { ConfirmDelete } from "@/components/scorecard-builder/confirm-delete"
import { AreaField, Field, TextField } from "@/components/scorecard-builder/editor-fields"
import { SortableList } from "@/components/scorecard-builder/sortable-list"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAutosave } from "@/hooks/use-autosave"
import { calculateAssessment, sumWeights, weightsMatchTarget } from "@/lib/scoring/engine"
import { scoringCategorySchema } from "@/lib/validators/builder"
import type { BuilderQuestion, BuilderRange, BuilderScoringCategory } from "@/types/builder"
import { isChoiceType } from "@/types/builder"

type SimulatedAnswer = { optionIds: string[]; scaleValue?: number }

export function ScoringStep({
  scorecardId,
  categories,
  questions,
  ranges,
  onChange,
}: {
  scorecardId: string
  categories: BuilderScoringCategory[]
  questions: BuilderQuestion[]
  ranges: BuilderRange[]
  onChange: (categories: BuilderScoringCategory[]) => void
}) {
  const [pending, setPending] = useState(false)
  const [simulated, setSimulated] = useState<Record<string, SimulatedAnswer>>({})
  const weights = categories.map((category) => category.weight)
  const balanced = weightsMatchTarget(weights)

  const simulation = useMemo(() => {
    return calculateAssessment({
      questions: questions.map((question) => ({
        id: question.id,
        isScored: question.isScored,
        scoringCategoryId: question.scoringCategoryId,
        type: question.type,
        options: question.options.map((option) => ({ id: option.id, score: option.score })),
        scaleFrom: question.settings.scaleFrom,
        scaleTo: question.settings.scaleTo,
        scoreFrom: question.settings.scoreFrom,
        scoreTo: question.settings.scoreTo,
      })),
      answers: questions.map((question) => ({
        questionId: question.id,
        optionIds: simulated[question.id]?.optionIds ?? [],
        scaleValue: simulated[question.id]?.scaleValue,
      })),
      categories: categories.map((category) => ({ id: category.id, weight: category.weight })),
      ranges: ranges.map((range) => ({
        id: range.id,
        minPercent: range.minPercent,
        maxPercent: range.maxPercent,
        label: range.label,
      })),
    })
  }, [categories, questions, ranges, simulated])

  async function addCategory() {
    setPending(true)
    const result = await createScoringCategory(scorecardId)
    setPending(false)
    if (result.error || !result.data) {
      toast.error(result.error ?? "La catégorie n'a pas pu être créée.")
      return
    }
    onChange([
      ...categories,
      { id: result.data.id, name: "Nouvelle catégorie", description: "", weight: 1, maxScore: 100, position: categories.length },
    ])
  }

  async function removeCategory(categoryId: string) {
    const result = await deleteScoringCategory(scorecardId, categoryId)
    if (result.error) {
      toast.error(result.error)
      return
    }
    onChange(categories.filter((category) => category.id !== categoryId))
  }

  async function reorder(next: BuilderScoringCategory[]) {
    const previous = categories
    onChange(next.map((category, position) => ({ ...category, position })))
    const result = await reorderScoringCategories(scorecardId, next.map((category) => category.id))
    if (result.error) {
      toast.error(result.error)
      onChange(previous)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl">Scoring</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Poids des catégories de score. Le total simple et le pourcentage pondéré sont calculés par le moteur.
          </p>
        </div>
        <Button type="button" className="h-10" disabled={pending} onClick={() => void addCategory()}>
          Ajouter une catégorie
        </Button>
      </div>
      {categories.length > 0 && !balanced ? (
        <p className="rounded-xl bg-[#f8ecd4] px-4 py-3 text-sm text-[#8a5a12]" role="alert">
          La somme des poids est {sumWeights(weights)} %. Elle doit être égale à 100 %.
        </p>
      ) : null}
      {categories.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">
          Sans catégorie de scoring, le résultat utilise le pourcentage simple des points.
        </p>
      ) : (
        <SortableList
          items={categories}
          onReorder={(next) => void reorder(next)}
          renderItem={(category) => (
            <ScoringCard
              scorecardId={scorecardId}
              category={category}
              onChange={(next) => onChange(categories.map((item) => (item.id === next.id ? next : item)))}
              onDelete={() => void removeCategory(category.id)}
            />
          )}
        />
      )}
      <section className="rounded-2xl border p-5">
        <h3 className="font-display text-2xl">Simulateur</h3>
        <p className="mt-2 text-sm text-muted-foreground">Réservé à l&apos;administrateur. Les réponses ne sont pas enregistrées.</p>
        <div className="mt-5 space-y-4">
          {questions.filter((question) => question.isScored).length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune question notée.</p>
          ) : null}
          {questions.filter((question) => question.isScored).map((question) => (
            <div key={question.id} className="grid gap-2 md:grid-cols-[1fr_240px] md:items-center">
              <p className="text-sm">{question.title}</p>
              <SimulatorControl
                question={question}
                answer={simulated[question.id]}
                onChange={(answer) => setSimulated((current) => ({ ...current, [question.id]: answer }))}
              />
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Metric label="Score brut" value={`${simulation.rawScore} / ${simulation.maxScore}`} />
          <Metric label="Overall" value={`${simulation.weightedScore} %`} />
          <Metric label="Result" value={simulation.resultRange?.label ?? "—"} />
        </div>
        {simulation.categoryScores.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {simulation.categoryScores.map((score) => {
              const category = categories.find((item) => item.id === score.categoryId)
              return (
                <li key={score.categoryId} className="flex justify-between text-sm">
                  <span>{category?.name ?? "Catégorie"}</span>
                  <span>{score.percent} %</span>
                </li>
              )
            })}
          </ul>
        ) : null}
      </section>
    </div>
  )
}

function SimulatorControl({
  question,
  answer,
  onChange,
}: {
  question: BuilderQuestion
  answer: SimulatedAnswer | undefined
  onChange: (answer: SimulatedAnswer) => void
}) {
  if (question.type === "scale_5" || question.type === "scale_10") {
    return (
      <Input
        className="h-10"
        type="number"
        aria-label={`Score simulé pour ${question.title}`}
        min={question.settings.scaleFrom}
        max={question.settings.scaleTo}
        value={answer?.scaleValue ?? ""}
        onChange={(event) => onChange({ optionIds: [], scaleValue: event.target.value === "" ? undefined : Number(event.target.value) })}
      />
    )
  }

  if (question.type === "multiple_choice") {
    const selected = new Set(answer?.optionIds ?? [])
    return (
      <div className="space-y-1" role="group" aria-label={`Réponses simulées pour ${question.title}`}>
        {question.options.map((option) => (
          <label key={option.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.has(option.id)}
              onChange={(event) => {
                const optionIds = event.target.checked
                  ? [...selected, option.id]
                  : [...selected].filter((id) => id !== option.id)
                onChange({ optionIds })
              }}
            />
            {option.label} ({option.score})
          </label>
        ))}
      </div>
    )
  }

  if (!isChoiceType(question.type)) {
    return <p className="text-sm text-muted-foreground">Réponse libre, non notée automatiquement.</p>
  }

  return (
    <select
      className="h-10 rounded-lg border bg-card px-3 text-sm"
      aria-label={`Réponse simulée pour ${question.title}`}
      value={answer?.optionIds[0] ?? ""}
      onChange={(event) => onChange({ optionIds: event.target.value ? [event.target.value] : [] })}
    >
      <option value="">Aucune</option>
      {question.options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label} ({option.score})
        </option>
      ))}
    </select>
  )
}

function ScoringCard({
  scorecardId,
  category,
  onChange,
  onDelete,
}: {
  scorecardId: string
  category: BuilderScoringCategory
  onChange: (category: BuilderScoringCategory) => void
  onDelete: () => void
}) {
  const draft = {
    name: category.name,
    description: category.description,
    weight: category.weight,
    maxScore: category.maxScore,
  }
  useAutosave(draft, async (current) => {
    const parsed = scoringCategorySchema.safeParse(current)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Catégorie invalide.", quiet: true }
    return updateScoringCategory(scorecardId, category.id, parsed.data)
  })

  return (
    <article className="space-y-4 rounded-2xl border bg-card p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <TextField id={`scoring-name-${category.id}`} label="Nom" value={category.name} onChange={(name) => onChange({ ...category, name })} />
        <Field label="Poids (%)" htmlFor={`scoring-weight-${category.id}`}>
          <Input
            id={`scoring-weight-${category.id}`}
            className="h-10"
            type="number"
            min={0.1}
            max={100}
            value={category.weight}
            onChange={(event) => onChange({ ...category, weight: Number(event.target.value) })}
          />
        </Field>
        <div className="md:col-span-2">
          <AreaField
            id={`scoring-description-${category.id}`}
            label="Description"
            rows={2}
            value={category.description}
            onChange={(description) => onChange({ ...category, description })}
          />
        </div>
        <Field label="Score maximum" htmlFor={`scoring-max-${category.id}`}>
          <Input
            id={`scoring-max-${category.id}`}
            className="h-10"
            type="number"
            min={1}
            value={category.maxScore}
            onChange={(event) => onChange({ ...category, maxScore: Number(event.target.value) })}
          />
        </Field>
      </div>
      <ConfirmDelete title="Supprimer cette catégorie de scoring ?" description="Les questions associées ne seront plus rattachées." onConfirm={onDelete} />
    </article>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-4">
      <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-2xl">{value}</p>
    </div>
  )
}
