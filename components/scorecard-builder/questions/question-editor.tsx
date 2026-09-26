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
import { operatorsForQuestion, type EligibilityOperator } from "@/lib/scoring/eligibility"
import type { DisplayRule } from "@/lib/assessment/visibility"
import { distributeScaleScores } from "@/lib/scoring/engine"
import { optionSchema, questionSchema, questionTypes } from "@/lib/validators/builder"
import type { BuilderOption, BuilderQuestion, BuilderQuestionCategory, BuilderScoringCategory } from "@/types/builder"
import { defaultSettings, isChoiceType } from "@/types/builder"

export function QuestionEditor({
  scorecardId,
  question,
  categories,
  scoringCategories,
  questions,
  mode = "advanced",
  revision = 0,
  onChange,
}: {
  scorecardId: string
  question: BuilderQuestion
  categories: BuilderQuestionCategory[]
  scoringCategories: BuilderScoringCategory[]
  questions: BuilderQuestion[]
  mode?: "simple" | "advanced"
  revision?: number
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
    displayRule: question.displayRule,
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
  }, revision)

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
  const categoryName = categories.find((category) => category.id === question.questionCategoryId)?.name.trim().toLowerCase()
  const suggested = !question.scoringCategoryId && categoryName
    ? scoringCategories.find((category) => category.name.trim().toLowerCase() === categoryName)
    : undefined

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
      {suggested && mode === "simple" ? (
        <div className="rounded-xl bg-muted/50 p-3 text-sm md:col-span-2">
          <p>La catégorie « {suggested.name} » existe déjà pour le score.</p>
          <Button type="button" variant="outline" className="mt-2 h-9" onClick={() => patch({ scoringCategoryId: suggested.id })}>
            Associer à {suggested.name}
          </Button>
        </div>
      ) : null}
      {mode === "advanced" ? <Field label="Catégorie de scoring" htmlFor="question-scoring-category">
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
      </Field> : null}
      <ToggleField label="Obligatoire" checked={question.isRequired} onChange={(isRequired) => patch({ isRequired })} />
      <ToggleField label="Notée" checked={question.isScored} onChange={(isScored) => patch({ isScored })} />
      {mode === "advanced" ? (
        <DisplayEditor question={question} earlier={questions.filter((item) => item.position < question.position)} onChange={(displayRule) => patch({ displayRule })} />
      ) : (
        <p className="text-sm text-muted-foreground">Les conditions d&apos;affichage se règlent dans le mode avancé.</p>
      )}
      {textOnly ? (
        <p className="text-sm text-muted-foreground">Le scoring automatique reste désactivé pour les réponses libres. Aucune analyse de texte n&apos;est appliquée.</p>
      ) : null}
      {mode === "advanced" && (question.type === "scale_5" || question.type === "scale_10") ? (
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
        <OptionsEditor scorecardId={scorecardId} question={question} showValue={mode === "advanced"} onChange={onChange} />
      ) : null}
    </div>
  )
}

function OptionsEditor({
  scorecardId,
  question,
  showValue,
  onChange,
}: {
  scorecardId: string
  question: BuilderQuestion
  showValue: boolean
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
            showValue={showValue}
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
  showValue,
  onChange,
  onDelete,
}: {
  option: BuilderOption
  scorecardId: string
  allowDelete: boolean
  showValue: boolean
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
    <div className={`grid gap-3 rounded-xl border p-3 ${showValue ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_90px_auto]" : "md:grid-cols-[minmax(0,1fr)_90px_auto]"}`}>
      <TextField id={`option-label-${option.id}`} label="Libellé" value={option.label} onChange={(label) => onChange({ ...option, label })} />
      {showValue ? (
        <TextField
          id={`option-value-${option.id}`}
          label="Valeur interne"
          hint="Minuscules, chiffres et tirets. Sert à reconnaître cette réponse."
          value={option.value}
          onChange={(value) => onChange({ ...option, value })}
        />
      ) : null}
      <NumberBox id={`option-score-${option.id}`} label="Points" value={option.score} onChange={(score) => onChange({ ...option, score })} />
      {allowDelete ? (
        <div className="self-end">
          <ConfirmDelete title="Retirer cette option ?" description="Elle ne sera plus proposée. Les réponses déjà collectées conservent son libellé." onConfirm={onDelete} />
        </div>
      ) : null}
    </div>
  )
}

const operatorLabels: Record<EligibilityOperator, string> = {
  eq: "est égal à",
  neq: "est différent de",
  lt: "est inférieur à",
  lte: "est inférieur ou égal à",
  gt: "est supérieur à",
  gte: "est supérieur ou égal à",
}

function DisplayEditor({
  question,
  earlier,
  onChange,
}: {
  question: BuilderQuestion
  earlier: BuilderQuestion[]
  onChange: (rule: DisplayRule | null) => void
}) {
  const mode = question.displayRule?.mode ?? "always"
  return (
    <div className="space-y-3 rounded-xl border p-4 md:col-span-2">
      <div>
        <p className="text-sm font-medium">Affichage conditionnel</p>
        <p className="mt-1 text-sm text-muted-foreground">Par défaut, la question est toujours affichée. Elle ne peut dépendre que d&apos;une question précédente.</p>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">Affichage</span>
        <select
          className="h-10 w-full rounded-lg border bg-card px-3"
          value={mode}
          onChange={(event) => {
            if (event.target.value === "always") {
              onChange(null)
              return
            }
            const source = earlier[0]
            onChange({
              mode: event.target.value === "hide_if" ? "hide_if" : "show_if",
              conditions: question.displayRule?.conditions ?? [{ questionId: source?.id ?? "", operator: "eq", value: "" }],
            })
          }}
        >
          <option value="always">Toujours afficher</option>
          <option value="show_if">Afficher si...</option>
          <option value="hide_if">Masquer si...</option>
        </select>
      </label>
      {mode !== "always" ? (
        <div className="space-y-3">
          {earlier.length === 0 ? <p className="text-sm text-muted-foreground">Placez cette question après une autre pour ajouter une condition.</p> : null}
          {(question.displayRule?.conditions ?? []).map((condition, index) => {
            const source = earlier.find((item) => item.id === condition.questionId) ?? earlier[0]
            const operators = operatorsForQuestion(source?.type ?? "short_text")
            return (
              <div key={`${condition.questionId}-${index}`} className="grid gap-2 md:grid-cols-[auto_1fr_1fr_1fr] md:items-end">
                <p className="pb-2 text-sm">{index === 0 ? "SI" : "ET"}</p>
                <select
                  className="h-10 rounded-lg border bg-card px-3 text-sm"
                  aria-label="Question précédente"
                  value={condition.questionId}
                  onChange={(event) => {
                    const nextSource = earlier.find((item) => item.id === event.target.value)
                    const nextOperators = operatorsForQuestion(nextSource?.type ?? "short_text")
                    onChange({
                      mode: question.displayRule?.mode ?? "show_if",
                      conditions: (question.displayRule?.conditions ?? []).map((item, itemIndex) => itemIndex === index
                        ? { questionId: event.target.value, operator: nextOperators[0] ?? "eq", value: "" }
                        : item),
                    })
                  }}
                >
                  {earlier.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
                <select
                  className="h-10 rounded-lg border bg-card px-3 text-sm"
                  aria-label="Opérateur"
                  value={condition.operator}
                  onChange={(event) => onChange({
                    mode: question.displayRule?.mode ?? "show_if",
                    conditions: (question.displayRule?.conditions ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, operator: event.target.value as EligibilityOperator } : item),
                  })}
                >
                  {operators.map((operator) => <option key={operator} value={operator}>{operatorLabels[operator]}</option>)}
                </select>
                <ConditionValue
                  source={source}
                  value={condition.value}
                  onChange={(value) => onChange({
                    mode: question.displayRule?.mode ?? "show_if",
                    conditions: (question.displayRule?.conditions ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, value } : item),
                  })}
                />
              </div>
            )
          })}
          <Button
            type="button"
            variant="outline"
            className="h-9"
            disabled={earlier.length === 0 || (question.displayRule?.conditions.length ?? 0) >= 8}
            onClick={() => onChange({
              mode: question.displayRule?.mode ?? "show_if",
              conditions: [...(question.displayRule?.conditions ?? []), { questionId: earlier[0]?.id ?? "", operator: "eq", value: "" }],
            })}
          >
            Ajouter une condition
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function ConditionValue({
  source,
  value,
  onChange,
}: {
  source: BuilderQuestion | undefined
  value: string
  onChange: (value: string) => void
}) {
  if (source && isChoiceType(source.type)) {
    return (
      <select className="h-10 rounded-lg border bg-card px-3 text-sm" aria-label="Valeur" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choisir</option>
        {source.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    )
  }
  return <Input className="h-10" aria-label="Valeur" value={value} onChange={(event) => onChange(event.target.value)} />
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
