"use client"

import type { PublicQuestion } from "@/lib/assessment/dto"
import { countryChoices } from "@/lib/geo/countries"

export type LocalAnswer = {
  optionIds: string[]
  scaleValue?: number
  text: string
}

export function emptyAnswer(): LocalAnswer {
  return { optionIds: [], text: "" }
}

export function QuestionCard({
  question,
  index,
  total,
  answer,
  primaryColor,
  onChange,
}: {
  question: PublicQuestion
  index: number
  total: number
  answer: LocalAnswer
  primaryColor: string
  onChange: (answer: LocalAnswer) => void
}) {
  return (
    <section className="mx-auto w-full max-w-xl px-5 py-8" style={{ color: "#142033" }}>
      <p className="text-sm text-[#5e6d7e]">
        Question {index + 1} sur {total}
      </p>
      <h2 className="font-display mt-3 text-3xl leading-tight">{question.title}</h2>
      {question.description ? <p className="mt-3 text-[#3d4d61]">{question.description}</p> : null}
      <div className="mt-8">
        <QuestionInput question={question} answer={answer} primaryColor={primaryColor} onChange={onChange} />
      </div>
      {question.isRequired ? <p className="mt-4 text-xs text-[#5e6d7e]">Obligatoire</p> : null}
    </section>
  )
}

function QuestionInput({
  question,
  answer,
  primaryColor,
  onChange,
}: {
  question: PublicQuestion
  answer: LocalAnswer
  primaryColor: string
  onChange: (answer: LocalAnswer) => void
}) {
  if (question.type === "single_choice" || question.type === "yes_no" || question.type === "dropdown") {
    if (question.type === "dropdown") {
      return (
        <label className="block text-sm">
          Réponse
          <select
            className="mt-2 h-11 w-full rounded-xl border bg-white px-3"
            value={answer.optionIds[0] ?? ""}
            onChange={(event) => onChange({ ...answer, optionIds: event.target.value ? [event.target.value] : [] })}
          >
            <option value="">Choisir</option>
            {question.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )
    }

    return (
      <div className="grid gap-3">
        {question.options.map((option) => {
          const selected = answer.optionIds.includes(option.id)
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              className="rounded-2xl border bg-white px-4 py-3 text-left"
              style={selected ? { borderColor: primaryColor, boxShadow: `inset 0 0 0 1px ${primaryColor}` } : undefined}
              onClick={() => onChange({ ...answer, optionIds: [option.id] })}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    )
  }

  if (question.type === "multiple_choice") {
    return (
      <div className="grid gap-3">
        {question.options.map((option) => {
          const selected = answer.optionIds.includes(option.id)
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              className="rounded-2xl border bg-white px-4 py-3 text-left"
              style={selected ? { borderColor: primaryColor, boxShadow: `inset 0 0 0 1px ${primaryColor}` } : undefined}
              onClick={() => {
                const optionIds = selected
                  ? answer.optionIds.filter((id) => id !== option.id)
                  : [...answer.optionIds, option.id]
                onChange({ ...answer, optionIds })
              }}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    )
  }

  if (question.type === "scale_5" || question.type === "scale_10") {
    const values = Array.from(
      { length: question.scaleTo - question.scaleFrom + 1 },
      (_, index) => question.scaleFrom + index,
    )
    return (
      <div className="flex flex-wrap gap-2" role="group" aria-label="Échelle">
        {values.map((value) => {
          const selected = answer.scaleValue === value
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              className="size-11 rounded-xl border bg-white"
              style={selected ? { background: primaryColor, color: "white", borderColor: primaryColor } : undefined}
              onClick={() => onChange({ ...answer, scaleValue: value })}
            >
              {value}
            </button>
          )
        })}
      </div>
    )
  }

  if (question.type === "long_text") {
    return (
      <label className="block text-sm">
        Réponse
        <textarea
          className="mt-2 min-h-32 w-full rounded-xl border bg-white px-3 py-2"
          value={answer.text}
          onChange={(event) => onChange({ ...answer, text: event.target.value })}
        />
      </label>
    )
  }

  if (question.type === "country") {
    return (
      <label className="block text-sm">
        Pays
        <select
          className="mt-2 h-11 w-full rounded-xl border bg-white px-3"
          value={answer.text}
          onChange={(event) => onChange({ ...answer, text: event.target.value })}
        >
          <option value="">Choisir un pays</option>
          {countryChoices().map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </select>
      </label>
    )
  }

  const inputType = question.type === "email" ? "email" : question.type === "phone" ? "tel" : question.type === "number" ? "number" : "text"

  return (
    <label className="block text-sm">
      Réponse
      <input
        className="mt-2 h-11 w-full rounded-xl border bg-white px-3"
        type={inputType}
        value={answer.text}
        onChange={(event) => onChange({ ...answer, text: event.target.value })}
      />
    </label>
  )
}

export function answerIsEmpty(question: { type: PublicQuestion["type"] }, answer: LocalAnswer | undefined) {
  if (!answer) return true
  if (question.type === "scale_5" || question.type === "scale_10") return answer.scaleValue === undefined
  if (question.type === "single_choice" || question.type === "multiple_choice" || question.type === "yes_no" || question.type === "dropdown") {
    return answer.optionIds.length === 0
  }
  return answer.text.trim().length === 0
}
