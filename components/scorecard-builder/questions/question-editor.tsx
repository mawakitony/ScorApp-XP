"use client"

import { toast } from "sonner"
import {
  createQuestionOption,
  deleteQuestionOption,
  reorderQuestionOptions,
  updateQuestion,
  updateQuestionOption,
} from "@/actions/builder"
import { ConfirmDelete } from "@/components/scorecard-builder/confirm-delete"
import { AreaField, Field, TextField, ToggleField } from "@/components/scorecard-builder/editor-fields"
import { SortableList } from "@/components/scorecard-builder/sortable-list"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAutosave } from "@/hooks/use-autosave"
import { QUESTION_TYPE_LABELS } from "@/lib/constants"
import { distributeScaleScores } from "@/lib/scoring/engine"
import { optionSchema, questionSchema, questionTypes } from "@/lib/validators/builder"
import type { BuilderOption, BuilderQuestion, BuilderQuestionCategory, BuilderScoringCategory } from "@/types/builder"
import { defaultSettings, isChoiceType } from "@/types/builder"

export function QuestionEditor({
  scorecardId,
  question,
  categories,
  scoringCategories,
  onChange,
}: {
  scorecardId: string
  question: BuilderQuestion
  categories: BuilderQuestionCategory[]
  scoringCategories: BuilderScoringCategory[]
  onChange: (question: BuilderQuestion) => void
}) {
  const draft = {
    title: question.title,
    description: question.description,
    type: question.type,
    questionCategoryId: question.questionCategoryId,
    scoringCategoryId: question.scoringCategoryId,
    isRequired: question.isRequired,
    isScored: question.isScored,
    settings: question.settings,
  }

  useAutosave(draft, async (current) => {
    const parsed = questionSchema.safeParse(current)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides.", quiet: true }
    const result = await updateQuestion(scorecardId, question.id, parsed.data)
    if (!result.error && result.data && result.data.options.length > 0 && question.options.length === 0) {
      onChange({
        ...question,
        ...current,
        options: result.data.options.map((option) => ({
          id: option.id,
          questionId: question.id,
          label: option.label,
          value: option.value ?? "",
          score: Number(option.score),
          position: option.position,
        })),
      })
    }
    return result.error ? { error: result.error } : {}
  })

  function patch(partial: Partial<BuilderQuestion>) {
    const next = { ...question, ...partial }
    if (partial.type && partial.type !== question.type) {
      next.settings = defaultSettings(partial.type)
      if (["short_text", "long_text", "email", "phone"].includes(partial.type)) next.isScored = false
    }
    onChange(next)
  }

  const scaleCount = Math.max(question.settings.scaleTo - question.settings.scaleFrom + 1, 0)
  const scaleScores = distributeScaleScores(scaleCount, question.settings.scoreFrom, question.settings.scoreTo)
  const textOnly = ["short_text", "long_text", "email", "phone", "number", "country"].includes(question.type)

  return (
    <div className="space-y-5 rounded-2xl border bg-card p-5">
      <h3 className="font-display text-2xl">Éditeur</h3>
      <TextField id="question-title" label="Question" value={question.title} onChange={(title) => patch({ title })} />
      <AreaField
        id="question-help"
        label="Description / aide"
        rows={3}
        value={question.description}
        onChange={(description) => patch({ description })}
      />
      <Field label="Type" htmlFor="question-type">
        <Select value={question.type} onValueChange={(type) => patch({ type: type as BuilderQuestion["type"] })}>
          <SelectTrigger id="question-type" className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {questionTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {QUESTION_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Catégorie" htmlFor="question-category">
        <Select
          value={question.questionCategoryId ?? "none"}
          onValueChange={(value) => patch({ questionCategoryId: value === "none" ? null : value })}
        >
          <SelectTrigger id="question-category" className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Aucune</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Catégorie de scoring" htmlFor="question-scoring-category">
        <Select
          value={question.scoringCategoryId ?? "none"}
          onValueChange={(value) => patch({ scoringCategoryId: value === "none" ? null : value })}
        >
          <SelectTrigger id="question-scoring-category" className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Aucune</SelectItem>
            {scoringCategories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <ToggleField label="Obligatoire" checked={question.isRequired} onChange={(isRequired) => patch({ isRequired })} />
      <ToggleField label="Notée" checked={question.isScored} onChange={(isScored) => patch({ isScored })} />
      {textOnly ? (
        <p className="text-sm text-muted-foreground">Le scoring automatique reste désactivé pour les réponses libres. Aucune analyse de texte n&apos;est appliquée.</p>
      ) : null}
      {question.type === "scale_5" || question.type === "scale_10" ? (
        <div className="space-y-3 rounded-xl bg-muted/40 p-4">
          <p className="text-sm font-medium">Répartition du score</p>
          <div className="grid grid-cols-2 gap-3">
            <NumberBox id="scale-score-from" label="Score minimum" value={question.settings.scoreFrom} onChange={(scoreFrom) => patch({ settings: { ...question.settings, scoreFrom } })} />
            <NumberBox id="scale-score-to" label="Score maximum" value={question.settings.scoreTo} onChange={(scoreTo) => patch({ settings: { ...question.settings, scoreTo } })} />
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => patch({ settings: { ...question.settings, scoreFrom: 0, scoreTo: 100 } })}
          >
            Répartir de 0 à 100
          </Button>
          <ul className="grid grid-cols-2 gap-1 text-sm text-muted-foreground">
            {scaleScores.map((score, index) => (
              <li key={`${question.settings.scaleFrom + index}-${score}`}>
                {question.settings.scaleFrom + index} = {score}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {isChoiceType(question.type) ? (
        <OptionsEditor scorecardId={scorecardId} question={question} onChange={onChange} />
      ) : null}
    </div>
  )
}

function OptionsEditor({
  scorecardId,
  question,
  onChange,
}: {
  scorecardId: string
  question: BuilderQuestion
  onChange: (question: BuilderQuestion) => void
}) {
  async function addOption() {
    const result = await createQuestionOption(scorecardId, question.id)
    if (result.error || !result.data) {
      toast.error(result.error ?? "L'option n'a pas pu être ajoutée.")
      return
    }
    const position = question.options.length
    onChange({
      ...question,
      options: [
        ...question.options,
        { id: result.data.id, questionId: question.id, label: `Option ${position + 1}`, value: `option-${position + 1}`, score: 0, position },
      ],
    })
  }

  async function removeOption(optionId: string) {
    const result = await deleteQuestionOption(scorecardId, optionId)
    if (result.error) {
      toast.error(result.error)
      return
    }
    onChange({ ...question, options: question.options.filter((option) => option.id !== optionId) })
  }

  async function reorder(options: BuilderOption[]) {
    const previous = question.options
    const next = options.map((option, position) => ({ ...option, position }))
    onChange({ ...question, options: next })
    const result = await reorderQuestionOptions(scorecardId, question.id, next.map((option) => option.id))
    if (result.error) {
      toast.error(result.error)
      onChange({ ...question, options: previous })
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">{question.type === "yes_no" ? "Réponses" : "Options"}</h4>
        {question.type === "yes_no" ? null : (
          <Button type="button" variant="outline" className="h-10" onClick={() => void addOption()}>
            Ajouter une option
          </Button>
        )}
      </div>
      <SortableList
        items={question.options}
        onReorder={(options) => void reorder(options)}
        renderItem={(option) => (
          <OptionFields
            option={option}
            scorecardId={scorecardId}
            allowDelete={question.type !== "yes_no"}
            onChange={(next) => onChange({ ...question, options: question.options.map((item) => (item.id === next.id ? next : item)) })}
            onDelete={() => void removeOption(option.id)}
          />
        )}
      />
    </div>
  )
}

function OptionFields({
  option,
  scorecardId,
  allowDelete,
  onChange,
  onDelete,
}: {
  option: BuilderOption
  scorecardId: string
  allowDelete: boolean
  onChange: (option: BuilderOption) => void
  onDelete: () => void
}) {
  const draft = { label: option.label, value: option.value, score: option.score }
  useAutosave(draft, async (current) => {
    const parsed = optionSchema.safeParse(current)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Option invalide.", quiet: true }
    return updateQuestionOption(scorecardId, option.id, parsed.data)
  })

  return (
    <div className="grid gap-3 rounded-xl border p-3 md:grid-cols-[1fr_1fr_90px_auto]">
      <TextField id={`option-label-${option.id}`} label="Libellé" value={option.label} onChange={(label) => onChange({ ...option, label })} />
      <TextField
        id={`option-value-${option.id}`}
        label="Valeur"
        hint="Identifiant stable : minuscules, chiffres et tirets."
        value={option.value}
        onChange={(value) => onChange({ ...option, value })}
      />
      <NumberBox id={`option-score-${option.id}`} label="Score" value={option.score} onChange={(score) => onChange({ ...option, score })} />
      {allowDelete ? (
        <div className="self-end">
          <ConfirmDelete title="Supprimer cette option ?" description="La valeur ne sera plus proposée." onConfirm={onDelete} />
        </div>
      ) : null}
    </div>
  )
}

function NumberBox({
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
    <Field label={label} htmlFor={id}>
      <Input
        id={id}
        className="h-10"
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(event.target.value === "" ? 0 : Number(event.target.value))}
      />
    </Field>
  )
}
