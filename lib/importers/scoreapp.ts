import type { QuestionType } from "@/lib/validators/builder"
import type { ImportCategory, ImportIssue, ImportQuestion, QuestionnaireDraft } from "@/lib/importers/model"

export const SCOREAPP_QUESTIONS_URL = "https://open-api.scoreapp.com/scorecards"

const documentedAnswerTypes: Record<string, QuestionType> = {
  yesno: "yes_no",
  single_choice: "single_choice",
  text: "short_text",
}

const extraAnswerTypes: Record<string, QuestionType> = {
  radio: "single_choice",
  single: "single_choice",
  checkbox: "multiple_choice",
  multiple: "multiple_choice",
  multiple_choice: "multiple_choice",
  textarea: "long_text",
  long_text: "long_text",
  number: "number",
  email: "email",
  phone: "phone",
  dropdown: "dropdown",
  scale_5: "scale_5",
  scale_10: "scale_10",
  country: "country",
}

export type ScoreAppOption = {
  option?: string | null
  option_value?: string | number | null
  order?: number | null
}

export type ScoreAppCategory = {
  id?: string
  title?: string
  order?: number | null
  scoring_logic?: string | null
}

export type ScoreAppQuestion = {
  id?: string
  question?: string
  answer_type?: string
  order?: number | null
  required?: boolean
  categories?: ScoreAppCategory[]
  options?: ScoreAppOption[]
}

export function mapScoreAppAnswerType(answerType: string | undefined): QuestionType | null {
  const key = (answerType ?? "").trim().toLowerCase()
  return documentedAnswerTypes[key] ?? extraAnswerTypes[key] ?? null
}

function scoreOf(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null
  const numeric = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export function mapScoreAppQuestions(questions: ScoreAppQuestion[]): {
  draft: QuestionnaireDraft
  issues: ImportIssue[]
} {
  const issues: ImportIssue[] = []
  const categories = new Map<string, ImportCategory>()
  const mapped: ImportQuestion[] = []
  const unknownTypes: QuestionnaireDraft["unknownTypes"] = []

  questions.forEach((question, index) => {
    const line = index + 1
    const rawType = question.answer_type ?? ""
    const type = mapScoreAppAnswerType(rawType)
    const category = question.categories?.find((item) => item.title)?.title ?? ""
    question.categories?.forEach((item) => {
      const name = item.title?.trim() ?? ""
      if (name.length < 2 || categories.has(name)) return
      categories.set(name, {
        ref: item.id || name,
        name,
        description: "",
        weight: item.scoring_logic === "none" ? 1 : 1,
        order: item.order ?? categories.size + 1,
        highMessage: "",
        mediumMessage: "",
        lowMessage: "",
      })
    })
    if (!type) {
      unknownTypes.push({ row: line, rawType: rawType || "(vide)", title: question.question?.trim() || "Question" })
      issues.push({
        row: line,
        column: "answer_type",
        message: `Unsupported question type "${rawType || "(vide)"}".`,
      })
      return
    }
    const options = (question.options ?? [])
      .map((option, optionIndex) => {
        const label = option.option?.trim() ?? ""
        if (!label) return null
        const preserved = scoreOf(option.option_value)
        if (option.option_value != null && option.option_value !== "" && preserved == null) {
          issues.push({ row: line, column: "option_value", message: `La valeur "${option.option_value}" n'est pas un nombre valide.` })
        }
        return { label, value: "", score: preserved ?? 0, position: (option.order ?? optionIndex + 1) - 1 }
      })
      .filter((option): option is ImportQuestion["options"][number] => option != null)
      .sort((left, right) => left.position - right.position)
      .map((option, position) => ({ ...option, position }))

    mapped.push({
      ref: question.id || `SA${String(index + 1).padStart(3, "0")}`,
      order: question.order ?? index + 1,
      category,
      type,
      title: question.question?.trim() || "",
      description: "",
      required: Boolean(question.required),
      isScored: (question.options ?? []).some((option) => option.option_value != null && option.option_value !== ""),
      scoringCategory: category,
      options,
      display: null,
      displays: [],
    })
  })

  if (unknownTypes.length > 0) {
    return {
      draft: {
        source: "scoreapp_api",
        categories: [...categories.values()],
        scoringCategories: [],
        questions: mapped,
        ranges: [],
        rules: null,
        sheets: { scoring: false, rules: false, ranges: false },
        unknownTypes,
      },
      issues,
    }
  }

  const checked = mapped.map((question) => {
    if (question.title.length < 2) issues.push({ row: question.order, column: "question", message: "La question ne peut pas être vide." })
    return question
  })

  return {
    draft: {
      source: "scoreapp_api",
      categories: [...categories.values()],
      scoringCategories: [],
      questions: checked,
      ranges: [],
      rules: null,
      sheets: { scoring: false, rules: false, ranges: false },
      unknownTypes: [],
    },
    issues,
  }
}

export function applyScoreAppTypeOverrides(
  draft: QuestionnaireDraft,
  overrides: Record<number, QuestionType>,
): { draft: QuestionnaireDraft | null; issues: ImportIssue[] } {
  const missing = draft.unknownTypes.filter((item) => !overrides[item.row])
  if (missing.length > 0) {
    return {
      draft: null,
      issues: missing.map((item) => ({ row: item.row, column: "answer_type", message: `Unsupported question type "${item.rawType}".` })),
    }
  }
  const resolved = draft.unknownTypes.map((item) => ({
    ref: `SA${String(item.row).padStart(3, "0")}`,
    order: item.row,
    category: "",
    type: overrides[item.row],
    title: item.title,
    description: "",
    required: false,
    isScored: false,
    scoringCategory: "",
    options: [],
    display: null,
    displays: [],
  }))
  return {
    draft: {
      ...draft,
      questions: [...draft.questions, ...resolved].sort((left, right) => left.order - right.order),
      unknownTypes: [],
    },
    issues: [],
  }
}
