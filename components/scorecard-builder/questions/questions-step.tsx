"use client"

import { useState } from "react"
import { Copy, Pencil } from "lucide-react"
import { toast } from "sonner"
import {
  createQuestion,
  deleteQuestion,
  duplicateQuestion,
  reorderQuestions,
} from "@/actions/builder"
import { ConfirmDelete } from "@/components/scorecard-builder/confirm-delete"
import { exportScorecardWorkbook } from "@/actions/import-questions"
import { ImportQuestionsButton } from "@/components/scorecard-builder/questions/import-questions-dialog"
import type { ImportCatalog } from "@/lib/importers/diff"
import type { EligibilityRule } from "@/lib/scoring/eligibility"
import { QuestionEditor } from "@/components/scorecard-builder/questions/question-editor"
import { SortableList } from "@/components/scorecard-builder/sortable-list"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { QUESTION_TYPE_LABELS } from "@/lib/constants"
import { questionTypes, type QuestionType } from "@/lib/validators/builder"
import type { BuilderOption, BuilderQuestion, BuilderQuestionCategory, BuilderRange, BuilderScoringCategory } from "@/types/builder"
import { defaultSettings } from "@/types/builder"

export function QuestionsStep({
  scorecardId,
  questions,
  categories,
  scoringCategories,
  ranges,
  rules,
  mode,
  revision = 0,
  onChange,
  onImported,
}: {
  scorecardId: string
  questions: BuilderQuestion[]
  categories: BuilderQuestionCategory[]
  scoringCategories: BuilderScoringCategory[]
  ranges: BuilderRange[]
  rules: EligibilityRule[]
  mode: "simple" | "advanced"
  revision?: number
  onChange: (questions: BuilderQuestion[]) => void
  onImported: (value: {
    questions: BuilderQuestion[]
    questionCategories: BuilderQuestionCategory[]
    scoringCategories: BuilderScoringCategory[]
    ranges: BuilderRange[]
    rules?: EligibilityRule[]
  }) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(questions[0]?.id ?? null)
  const [nextType, setNextType] = useState<QuestionType>("single_choice")
  const [pending, setPending] = useState(false)
  const selected = questions.find((question) => question.id === selectedId) ?? null

  async function addQuestion() {
    setPending(true)
    const result = await createQuestion(scorecardId, nextType)
    setPending(false)
    if (result.error || !result.data) {
      toast.error(result.error ?? "La question n'a pas pu être créée.")
      return
    }
    const question: BuilderQuestion = {
      id: result.data.id,
      questionCategoryId: null,
      scoringCategoryId: null,
      type: nextType,
      title: "Nouvelle question",
      description: "",
      isRequired: true,
      isScored: !["short_text", "long_text", "email", "phone"].includes(nextType),
      position: questions.length,
      settings: defaultSettings(nextType),
      displayRule: null,
      options: result.data.options.map((option) => toOption(result.data!.id, option)),
    }
    onChange([...questions, question])
    setSelectedId(question.id)
  }

  async function copyQuestion(question: BuilderQuestion) {
    const result = await duplicateQuestion(scorecardId, question.id)
    if (result.error || !result.data) {
      toast.error(result.error ?? "La duplication a échoué.")
      return
    }
    const copy: BuilderQuestion = {
      ...question,
      id: result.data.id,
      title: `${question.title} (copie)`,
      position: question.position + 1,
      options: result.data.options.map((option) => toOption(result.data!.id, option)),
    }
    onChange([...questions, copy])
    setSelectedId(copy.id)
  }

  async function removeQuestion(questionId: string) {
    const result = await deleteQuestion(scorecardId, questionId)
    if (result.error) {
      toast.error(result.error)
      return
    }
    const next = questions
      .filter((question) => question.id !== questionId)
      .map((question) => {
        if (!question.displayRule) return question
        const conditions = question.displayRule.conditions.filter((condition) => condition.questionId !== questionId)
        return { ...question, displayRule: conditions.length > 0 ? { ...question.displayRule, conditions } : null }
      })
    onChange(next)
    if (selectedId === questionId) setSelectedId(next[0]?.id ?? null)
  }

  async function reorder(next: BuilderQuestion[]) {
    const previous = questions
    onChange(next.map((question, position) => ({ ...question, position })))
    const result = await reorderQuestions(scorecardId, next.map((question) => question.id))
    if (result.error) {
      toast.error(result.error)
      onChange(previous)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display text-3xl">Questions</h2>
          <p className="mt-2 text-sm text-muted-foreground">Ajoutez, ordonnez et notez les questions.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={nextType} onValueChange={(value) => setNextType(value as QuestionType)}>
            <SelectTrigger className="h-10 w-52" aria-label="Type de question">
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
          <Button type="button" className="h-10" disabled={pending} onClick={() => void addQuestion()}>
            Ajouter une question
          </Button>
          <Button type="button" variant="outline" className="h-10" disabled={pending} onClick={() => void downloadWorkbook(scorecardId, setPending)}>
            Exporter vers Excel
          </Button>
          <ImportQuestionsButton
            scorecardId={scorecardId}
            catalog={catalogOf(questions, categories, scoringCategories, ranges, rules)}
            onImported={(value) => {
              onImported(value)
              setSelectedId(value.questions[0]?.id ?? null)
            }}
          />
        </div>
      </div>
      {questions.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">
          Aucune question. Ajoutez la première pour commencer le questionnaire.
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <SortableList
            items={questions}
            onReorder={(next) => void reorder(next)}
            renderItem={(question, index) => {
              const category = categories.find((item) => item.id === question.questionCategoryId)
              const active = question.id === selectedId
              return (
                <article className={`rounded-2xl border p-4 ${active ? "border-primary" : "bg-card"}`}>
                  <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">Question {index + 1}</p>
                  <h3 className="mt-1 font-medium">{question.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {QUESTION_TYPE_LABELS[question.type]}
                    {category ? ` · ${category.name}` : ""}
                  </p>
                  <div className="mt-3 flex gap-1">
                    <Button type="button" variant="ghost" size="icon" aria-label="Modifier" onClick={() => setSelectedId(question.id)}>
                      <Pencil />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label="Dupliquer" onClick={() => void copyQuestion(question)}>
                      <Copy />
                    </Button>
                    <ConfirmDelete
                      title="Supprimer cette question ?"
                      description="Elle disparaît du questionnaire. Les réponses déjà collectées restent lisibles."
                      onConfirm={() => void removeQuestion(question.id)}
                    />
                  </div>
                </article>
              )
            }}
          />
          {selected ? (
            <QuestionEditor
              key={selected.id}
              scorecardId={scorecardId}
              question={selected}
              categories={categories}
              scoringCategories={scoringCategories}
              questions={questions}
              mode={mode}
              revision={revision}
              onChange={(next) => onChange(questions.map((question) => (question.id === next.id ? next : question)))}
            />
          ) : (
            <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">Sélectionnez une question.</p>
          )}
        </div>
      )}
    </div>
  )
}

function optionLabel(questions: BuilderQuestion[], questionId: string, value: string) {
  const source = questions.find((question) => question.id === questionId)
  const option = source?.options.find((item) => item.id === value || item.value.toLowerCase() === value.toLowerCase() || item.label.toLowerCase() === value.toLowerCase())
  return option?.label ?? value
}

function catalogOf(
  questions: BuilderQuestion[],
  categories: BuilderQuestionCategory[],
  scoringCategories: BuilderScoringCategory[],
  ranges: BuilderRange[],
  rules: EligibilityRule[],
): ImportCatalog {
  const categoryName = new Map(categories.map((category) => [category.id, category.name]))
  const scoringName = new Map(scoringCategories.map((category) => [category.id, category.name]))
  return {
    questions: questions.map((question, index) => ({
      id: question.id,
      order: question.position + 1 || index + 1,
      title: question.title,
      description: question.description,
      type: question.type,
      required: question.isRequired,
      scored: question.isScored,
      category: question.questionCategoryId ? categoryName.get(question.questionCategoryId) ?? "" : "",
      scoringCategory: question.scoringCategoryId ? scoringName.get(question.scoringCategoryId) ?? "" : "",
      options: question.options.map((option) => ({ label: option.label, score: option.score })),
      conditions: (question.displayRule?.conditions ?? []).map((condition) => `${question.displayRule?.mode}|${condition.questionId}|${condition.operator}|${optionLabel(questions, condition.questionId, condition.value)}`).join(";"),
    })),
    categories: categories.map((category) => ({ name: category.name, weight: category.weight })),
    scoringCategories: scoringCategories.map((category) => ({ name: category.name, weight: category.weight, maxScore: category.maxScore })),
    ranges: ranges.map((range) => ({ id: range.id, label: range.label, min: range.minPercent, max: range.maxPercent, title: range.title })),
    rules: rules.map((rule) => ({
      id: rule.id,
      action: rule.action,
      target: rule.resultRangeId,
      conditions: rule.conditions.map((condition) => `${condition.questionId}|${condition.operator}|${optionLabel(questions, condition.questionId, condition.value)}`).join(";"),
    })),
  }
}

async function downloadWorkbook(scorecardId: string, setPending: (value: boolean) => void) {
  setPending(true)
  const result = await exportScorecardWorkbook(scorecardId)
  setPending(false)
  if ("error" in result && result.error) {
    toast.error(result.error)
    return
  }
  if (!("base64" in result) || !result.base64 || !result.filename) return
  const bytes = Uint8Array.from(atob(result.base64), (char) => char.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }))
  const link = document.createElement("a")
  link.href = url
  link.download = result.filename
  link.click()
  URL.revokeObjectURL(url)
}

function toOption(
  questionId: string,
  option: { id: string; label: string; value: string | null; score: number; position: number },
): BuilderOption {
  return {
    id: option.id,
    questionId,
    label: option.label,
    value: option.value ?? "",
    score: Number(option.score),
    position: option.position,
  }
}
