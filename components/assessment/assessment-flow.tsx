"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { clearAssessmentAnswer, finishAssessment, noteLeadForm, saveAssessmentAnswer } from "@/actions/assessment"
import { QuestionCard, answerIsEmpty, emptyAnswer, type LocalAnswer } from "@/components/assessment/question-card"
import { isQuestionVisible, pruneHiddenAnswers, type VisibilityQuestion } from "@/lib/assessment/visibility"
import { PublicLeadForm } from "@/components/assessment/public-lead-form"
import type { PublicQuestion } from "@/lib/assessment/dto"
import type { BuilderLeadForm } from "@/types/builder"

export function AssessmentFlow({
  slug,
  questions,
  initialAnswers,
  initialIndex,
  lead,
  needsLeadFirst,
  needsLeadBeforeResult,
  primaryColor,
  logoUrl,
}: {
  slug: string
  questions: PublicQuestion[]
  initialAnswers: Record<string, LocalAnswer>
  initialIndex: number
  lead: BuilderLeadForm | null
  needsLeadFirst: boolean
  needsLeadBeforeResult: boolean
  primaryColor: string
  logoUrl: string | null
}) {
  const router = useRouter()
  const [answers, setAnswers] = useState(initialAnswers)
  const [index, setIndex] = useState(initialIndex)
  const [phase, setPhase] = useState<"lead" | "questions" | "lead-after">(needsLeadFirst ? "lead" : "questions")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const visible = visiblePublicQuestions(questions, answers)
  const question = visible[index]
  const total = visible.length
  const progress = total === 0 ? 0 : Math.round(((Math.min(index, total - 1) + 1) / total) * 100)

  async function persist(current: PublicQuestion, answer: LocalAnswer) {
    if (answerIsEmpty(current, answer) && !current.isRequired) return true
    const result = await saveAssessmentAnswer(slug, current.id, answer)
    if (result.error) {
      setError(result.error)
      return false
    }
    return true
  }

  async function forward() {
    if (!question) return
    const answer = answers[question.id] ?? emptyAnswer()
    if (question.isRequired && answerIsEmpty(question, answer)) {
      setError("Cette question est obligatoire.")
      return
    }
    setPending(true)
    setError("")
    const saved = await persist(question, answer)
    setPending(false)
    if (!saved) return
    if (index < visible.length - 1) {
      setIndex((value) => value + 1)
      return
    }
    if (needsLeadBeforeResult && lead) {
      setPhase("lead-after")
      void noteLeadForm(slug)
      return
    }
    setPending(true)
    const finished = await finishAssessment(slug)
    setPending(false)
    if ("error" in finished && finished.error) setError(finished.error)
    if ("href" in finished && finished.href) router.push(finished.href)
  }

  return (
    <div className="min-h-screen" style={{ background: "#f7f4ee", color: "#142033" }}>
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col">
        <header className="px-5 pt-6">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-8 w-auto object-contain" />
          ) : (
            <p className="text-sm tracking-[0.18em] text-[#8a7340] uppercase">WOLOYEM</p>
          )}
          {phase === "questions" && total > 0 ? (
            <div className="mt-4" aria-hidden="true">
              <div className="h-1.5 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full" style={{ width: `${progress}%`, background: primaryColor }} />
              </div>
            </div>
          ) : null}
        </header>
        <div key={phase === "questions" ? question?.id : phase} className="animate-in fade-in flex-1 duration-200">
          {phase !== "questions" && lead ? (
            <PublicLeadForm
              slug={slug}
              form={lead}
              onDone={() => {
                if (phase === "lead") setPhase("questions")
                else void finishAssessment(slug).then((result) => {
                  if ("error" in result && result.error) setError(result.error)
                  if ("href" in result && result.href) router.push(result.href)
                })
              }}
            />
          ) : null}
          {phase === "questions" && question ? (
            <QuestionCard
              question={question}
              index={index}
              total={total}
              answer={answers[question.id] ?? emptyAnswer()}
              primaryColor={primaryColor}
              onChange={(answer) => {
                const next = { ...answers, [question.id]: answer }
                const pruned = pruneHiddenAnswers(toVisibility(questions), Object.entries(next).map(([questionId, value]) => ({
                  questionId,
                  optionIds: value.optionIds,
                  scaleValue: value.scaleValue,
                  valueText: value.text,
                })))
                const kept: Record<string, LocalAnswer> = {}
                for (const item of pruned.answers) {
                  const current = next[item.questionId]
                  if (current) kept[item.questionId] = current
                }
                if (!kept[question.id]) kept[question.id] = answer
                setAnswers(kept)
                for (const id of pruned.removedIds) void clearAssessmentAnswer(slug, id)
                if (index >= visiblePublicQuestions(questions, kept).length) setIndex(Math.max(0, visiblePublicQuestions(questions, kept).length - 1))
                setError("")
              }}
            />
          ) : null}
          {phase === "questions" && !question ? (
            <p className="px-5 py-16 text-sm text-[#5e6d7e]">Aucune question n&apos;est configurée.</p>
          ) : null}
        </div>
        {error ? (
          <p className="px-5 text-sm text-[#8d3b32]" role="alert" aria-live="assertive">
            {error}
          </p>
        ) : null}
        {phase === "questions" && question ? (
          <div className="sticky bottom-0 flex justify-between gap-3 border-t bg-[#f7f4ee] px-5 py-4">
            <button
              type="button"
              className="h-12 rounded-xl border bg-white px-4"
              onClick={() => {
                setError("")
                if (index === 0 && needsLeadFirst) setPhase("lead")
                else setIndex((value) => Math.max(0, value - 1))
              }}
            >
              Précédent
            </button>
            <button
              type="button"
              disabled={pending}
              className="h-12 flex-1 rounded-xl px-4 text-white disabled:opacity-60"
              style={{ background: primaryColor }}
              onClick={() => void forward()}
            >
              {pending ? "Enregistrement…" : index === visible.length - 1 ? "Terminer" : "Continuer"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function toVisibility(questions: PublicQuestion[]): VisibilityQuestion[] {
  return questions.map((question, position) => ({
    id: question.id,
    position: question.position ?? position,
    type: question.type,
    options: question.options,
    displayRule: question.displayRule,
  }))
}

function visiblePublicQuestions(questions: PublicQuestion[], answers: Record<string, LocalAnswer>) {
  const family = toVisibility(questions)
  const drafts = Object.entries(answers).map(([questionId, answer]) => ({
    questionId,
    optionIds: answer.optionIds,
    scaleValue: answer.scaleValue,
    valueText: answer.text,
  }))
  return questions.filter((question) => {
    const item = family.find((entry) => entry.id === question.id)
    return item ? isQuestionVisible(item, family, drafts) : true
  })
}
