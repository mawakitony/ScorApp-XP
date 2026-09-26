"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  applyScoringProposal,
  createScoringCategory,
  deleteScoringCategory,
  reorderScoringCategories,
  updateScoringCategory,
} from "@/actions/builder"
import { RulesEditor } from "@/components/scorecard-builder/scoring/rules-editor"
import { ConfirmDelete } from "@/components/scorecard-builder/confirm-delete"
import { AreaField, Field, TextField } from "@/components/scorecard-builder/editor-fields"
import { SortableList } from "@/components/scorecard-builder/sortable-list"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAutosave } from "@/hooks/use-autosave"
import { proposeScoring, type ScoringProposal } from "@/lib/scoring/assistant"
import { toEngineQuestion } from "@/lib/scoring/from-builder"
import { sumWeights, weightsMatchTarget } from "@/lib/scoring/engine"
import { resolveAssessment } from "@/lib/scoring/outcome"
import { scoringCategorySchema } from "@/lib/validators/builder"
import type { EligibilityRule } from "@/lib/scoring/eligibility"
import type { BuilderQuestion, BuilderQuestionCategory, BuilderRange, BuilderScoringCategory } from "@/types/builder"
import { isChoiceType } from "@/types/builder"

type SimulatedAnswer = { optionIds: string[]; scaleValue?: number }

export function ScoringStep({
  scorecardId,
  categories,
  questions,
  questionCategories,
  ranges,
  rules,
  caps,
  onChange,
  onQuestions,
  onRules,
  onCaps,
}: {
  scorecardId: string
  categories: BuilderScoringCategory[]
  questions: BuilderQuestion[]
  questionCategories: BuilderQuestionCategory[]
  ranges: BuilderRange[]
  rules: EligibilityRule[]
  caps: { id: string; maxPercent: number }[]
  onChange: (categories: BuilderScoringCategory[]) => void
  onQuestions: (questions: BuilderQuestion[]) => void
  onRules: (rules: EligibilityRule[]) => void
  onCaps: (caps: { id: string; maxPercent: number }[]) => void
}) {
  const [pending, setPending] = useState(false)
  const [simulated, setSimulated] = useState<Record<string, SimulatedAnswer>>({})
  const [proposal, setProposal] = useState<ScoringProposal | null>(null)
  const weights = categories.map((category) => category.weight)
  const balanced = weightsMatchTarget(weights)

  const simulation = useMemo(() => {
    return resolveAssessment({
      questions: questions.map(toEngineQuestion),
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
      caps: caps.map((cap) => ({ ruleType: "cap", config: { maxPercent: cap.maxPercent } })),
      rules,
    })
  }, [caps, categories, questions, ranges, rules, simulated])

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
      { id: result.data.id, name: "Nouvelle catégorie", description: "", weight: 1, maxScore: 100, highMessage: "", mediumMessage: "", lowMessage: "", position: categories.length },
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
          <h2 className="font-display text-3xl">Score</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Chaque catégorie a un poids. Le total doit faire 100 %. Le résultat correspond ensuite à une plage.
          </p>
        </div>
        <Button type="button" className="h-10" disabled={pending} onClick={() => void addCategory()}>
          Ajouter une catégorie
        </Button>
      </div>
      <p className={`rounded-xl px-4 py-3 text-sm ${balanced || categories.length === 0 ? "bg-muted/50" : "bg-[#f8ecd4] text-[#8a5a12]"}`}>
        {categories.length === 0 ? "Aucun poids à totaliser." : `${sumWeights(weights)} / 100 %${balanced ? " ✓" : ""}`}
      </p>
      <ScoringAssistant
        proposal={proposal}
        pending={pending}
        onOpen={() => setProposal(proposeScoring({
          scoringCategories: categories,
          questionCategories,
          questions,
        }))}
        onChange={setProposal}
        onClose={() => setProposal(null)}
        onConfirm={() => void confirmProposal()}
      />
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
          <Metric label="Score brut" value={`${simulation.rawScore}`} />
          <Metric label="Score calculé" value={`${simulation.officialPercent} %`} />
          <Metric label="Résultat final" value={simulation.finalRange?.label ?? "—"} />
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
      <RulesEditor
        scorecardId={scorecardId}
        questions={questions}
        ranges={ranges}
        rules={rules}
        caps={caps}
        onRules={onRules}
        onCaps={onCaps}
      />
    </div>
  )

  async function confirmProposal() {
    if (!proposal || Math.abs(sumWeights(proposal.items.map((item) => item.weight)) - 100) > 0.05) return
    setPending(true)
    const result = await applyScoringProposal(scorecardId, {
      categories: proposal.items.map((item) => ({ id: item.existingId, name: item.name, weight: item.weight })),
      links: proposal.links,
    })
    setPending(false)
    if (result.error || !result.data) {
      toast.error(result.error ?? "La configuration n'a pas pu être appliquée.")
      return
    }
    const nextCategories = result.data.categories.map((category, position) => {
      const current = categories.find((item) => item.id === category.id)
      return {
        id: category.id,
        name: category.name,
        description: current?.description ?? "",
        weight: category.weight,
        maxScore: current?.maxScore ?? 100,
        highMessage: current?.highMessage ?? "",
        mediumMessage: current?.mediumMessage ?? "",
        lowMessage: current?.lowMessage ?? "",
        position,
      }
    })
    const untouched = categories.filter((category) => !nextCategories.some((item) => item.id === category.id))
    onChange([...untouched, ...nextCategories])
    onQuestions(questions.map((question) => {
      const link = result.data?.links.find((item) => item.questionId === question.id)
      return link && !question.scoringCategoryId ? { ...question, scoringCategoryId: link.scoringCategoryId } : question
    }))
    setProposal(null)
    toast.success("Scoring configuré.")
  }
}

function ScoringAssistant({
  proposal,
  pending,
  onOpen,
  onChange,
  onClose,
  onConfirm,
}: {
  proposal: ScoringProposal | null
  pending: boolean
  onOpen: () => void
  onChange: (proposal: ScoringProposal) => void
  onClose: () => void
  onConfirm: () => void
}) {
  const total = proposal ? sumWeights(proposal.items.map((item) => item.weight)) : 0
  const balanced = proposal ? Math.abs(total - 100) < 0.05 : false
  return (
    <section className="rounded-2xl border p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-2xl">Configurer automatiquement le scoring</h3>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">La proposition s&apos;affiche avant toute modification. Une catégorie déjà associée à une question n&apos;est pas remplacée.</p>
        </div>
        <Button type="button" variant="outline" className="h-10" onClick={onOpen}>Voir la proposition</Button>
      </div>
      {proposal ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium">Configuration proposée</p>
          {proposal.items.length === 0 ? <p className="text-sm text-muted-foreground">Ajoutez une question notée ou une catégorie avant de proposer des poids.</p> : null}
          {proposal.items.map((item, index) => (
            <div key={`${item.name}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_120px] sm:items-center">
              <p className="text-sm">{item.name}</p>
              <Input
                className="h-10"
                type="number"
                aria-label={`Poids de ${item.name}`}
                value={item.weight}
                onChange={(event) => onChange({
                  ...proposal,
                  items: proposal.items.map((current, currentIndex) => currentIndex === index ? { ...current, weight: Number(event.target.value) } : current),
                })}
              />
            </div>
          ))}
          <p className="text-sm">{total} / 100 %{balanced ? " ✓" : ""}</p>
          {proposal.links.length > 0 ? <p className="text-sm text-muted-foreground">{proposal.links.length} question(s) sans catégorie de score seront associées. Les associations existantes restent intactes.</p> : null}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="button" disabled={!balanced || pending || proposal.items.length === 0} onClick={onConfirm}>Appliquer</Button>
          </div>
        </div>
      ) : null}
    </section>
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
