"use client"

import { useState } from "react"
import { toast } from "sonner"
import { saveEligibilityRules, saveScoreCap } from "@/actions/builder"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { operatorsForQuestion, type EligibilityOperator, type EligibilityRule } from "@/lib/scoring/eligibility"
import type { BuilderQuestion, BuilderRange } from "@/types/builder"
import { isChoiceType } from "@/types/builder"

const operatorLabels: Record<EligibilityOperator, string> = {
  eq: "est égal à",
  neq: "est différent de",
  lt: "est inférieur à",
  lte: "est inférieur ou égal à",
  gt: "est supérieur à",
  gte: "est supérieur ou égal à",
}

const actionLabels = {
  force_result: "Forcer le résultat",
  max_result: "Résultat maximum",
} as const

export function RulesEditor({
  scorecardId,
  questions,
  ranges,
  rules,
  caps,
  onRules,
  onCaps,
}: {
  scorecardId: string
  questions: BuilderQuestion[]
  ranges: BuilderRange[]
  rules: EligibilityRule[]
  caps: { id: string; maxPercent: number }[]
  onRules: (rules: EligibilityRule[]) => void
  onCaps: (caps: { id: string; maxPercent: number }[]) => void
}) {
  const [draft, setDraft] = useState(rules)
  const [cap, setCap] = useState(caps[0] ? String(caps[0].maxPercent) : "")
  const [pending, setPending] = useState(false)

  function updateRule(id: string, next: EligibilityRule) {
    setDraft((current) => current.map((rule) => (rule.id === id ? next : rule)))
  }

  async function saveRules() {
    setPending(true)
    const result = await saveEligibilityRules(scorecardId, draft.map(({ conditions, action, resultRangeId }) => ({ conditions, action, resultRangeId })))
    setPending(false)
    if (result.error || !result.data) {
      toast.error(result.error ?? "Les règles n'ont pas pu être enregistrées.")
      return
    }
    const saved = result.data.rules.map((rule) => ({ ...rule, scorecardId }))
    setDraft(saved)
    onRules(saved)
    toast.success(saved.length === 0 ? "Aucune règle obligatoire." : "Règles enregistrées.")
  }

  async function saveCap() {
    const value = cap.trim() === "" ? null : Number(cap)
    setPending(true)
    const result = await saveScoreCap(scorecardId, value)
    setPending(false)
    if (result.error || !result.data) {
      toast.error(result.error ?? "Le plafond n'a pas pu être enregistré.")
      return
    }
    onCaps(result.data.caps)
    toast.success(value === null ? "Plafond retiré." : "Plafond enregistré.")
  }

  return (
    <section className="space-y-4 rounded-2xl border p-5">
      <div>
        <h3 className="font-display text-2xl">Règles obligatoires</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Une règle peut remplacer le résultat du score. Le pourcentage calculé reste inchangé. Une règle plus restrictive l&apos;emporte toujours.
        </p>
      </div>
      {draft.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {questions.length === 0 || ranges.length === 0
            ? "Aucune règle. Ajoutez d'abord une question et une plage de résultat, puis créez une règle si un critère doit forcer ou limiter le résultat."
            : "Aucune règle. Le résultat suit le score. Ajoutez une règle seulement si un critère doit forcer ou limiter le résultat."}
        </p>
      ) : null}
      {draft.map((rule, index) => (
        <article key={rule.id} className="space-y-3 rounded-xl bg-muted/40 p-4">
          <p className="text-sm font-medium">Règle {index + 1}</p>
          {rule.conditions.map((condition, conditionIndex) => {
            const question = questions.find((item) => item.id === condition.questionId)
            const operators = operatorsForQuestion(question?.type ?? "short_text")
            return (
              <div key={`${rule.id}-${conditionIndex}`} className="grid gap-2 md:grid-cols-[auto_1fr_1fr_1fr_auto] md:items-end">
                <p className="pb-2 text-sm">{conditionIndex === 0 ? "SI" : "ET"}</p>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Question</span>
                  <select
                    className="h-10 w-full rounded-lg border bg-card px-3"
                    value={condition.questionId}
                    onChange={(event) => {
                      const nextQuestion = questions.find((item) => item.id === event.target.value)
                      const nextOperators = operatorsForQuestion(nextQuestion?.type ?? "short_text")
                      const conditions = rule.conditions.map((item, itemIndex) => itemIndex === conditionIndex
                        ? { questionId: event.target.value, operator: nextOperators[0] ?? "eq", value: "" }
                        : item)
                      updateRule(rule.id, { ...rule, conditions })
                    }}
                  >
                    {questions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Opérateur</span>
                  <select
                    className="h-10 w-full rounded-lg border bg-card px-3"
                    value={condition.operator}
                    onChange={(event) => {
                      const conditions = rule.conditions.map((item, itemIndex) => itemIndex === conditionIndex ? { ...item, operator: event.target.value as EligibilityOperator } : item)
                      updateRule(rule.id, { ...rule, conditions })
                    }}
                  >
                    {operators.map((operator) => <option key={operator} value={operator}>{operatorLabels[operator]}</option>)}
                  </select>
                </label>
                <ValueField
                  question={question}
                  value={condition.value}
                  onChange={(value) => {
                    const conditions = rule.conditions.map((item, itemIndex) => itemIndex === conditionIndex ? { ...item, value } : item)
                    updateRule(rule.id, { ...rule, conditions })
                  }}
                />
                {rule.conditions.length > 1 ? (
                  <Button type="button" variant="ghost" onClick={() => updateRule(rule.id, { ...rule, conditions: rule.conditions.filter((_, itemIndex) => itemIndex !== conditionIndex) })}>
                    Retirer
                  </Button>
                ) : <span />}
              </div>
            )
          })}
          <Button
            type="button"
            variant="outline"
            className="h-9"
            disabled={questions.length === 0 || rule.conditions.length >= 8}
            onClick={() => updateRule(rule.id, { ...rule, conditions: [...rule.conditions, { questionId: questions[0]?.id ?? "", operator: "eq", value: "" }] })}
          >
            Ajouter une condition
          </Button>
          <div className="grid gap-2 md:grid-cols-[auto_1fr_1fr] md:items-end">
            <p className="pb-2 text-sm">ALORS</p>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Action</span>
              <select
                className="h-10 w-full rounded-lg border bg-card px-3"
                value={rule.action}
                onChange={(event) => updateRule(rule.id, { ...rule, action: event.target.value === "max_result" ? "max_result" : "force_result" })}
              >
                <option value="force_result">{actionLabels.force_result}</option>
                <option value="max_result">{actionLabels.max_result}</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Résultat</span>
              <select
                className="h-10 w-full rounded-lg border bg-card px-3"
                value={rule.resultRangeId}
                onChange={(event) => updateRule(rule.id, { ...rule, resultRangeId: event.target.value })}
              >
                {ranges.map((range) => <option key={range.id} value={range.id}>{range.label}</option>)}
              </select>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            {rule.action === "force_result"
              ? "Le résultat final ne peut pas devenir plus favorable que le score."
              : "Le résultat final ne pourra pas dépasser ce niveau."}
          </p>
          <Button type="button" variant="ghost" onClick={() => setDraft((current) => current.filter((item) => item.id !== rule.id))}>
            Supprimer la règle
          </Button>
        </article>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={questions.length === 0 || ranges.length === 0}
          onClick={() => setDraft((current) => [...current, {
            id: `draft-${crypto.randomUUID()}`,
            scorecardId,
            conditions: [{ questionId: questions[0]?.id ?? "", operator: "eq", value: "" }],
            action: "force_result",
            resultRangeId: ranges[0]?.id ?? "",
          }])}
        >
          Ajouter une règle
        </Button>
        <Button type="button" disabled={pending} onClick={() => void saveRules()}>
          Enregistrer les règles
        </Button>
      </div>
      <div className="rounded-xl border p-4">
        <h4 className="font-medium">Plafond du score</h4>
        <p className="mt-1 text-sm text-muted-foreground">Réduit le pourcentage officiel. Contrairement aux règles de résultat, ce plafond change le score affiché.</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Maximum (%)</span>
            <Input className="h-10 w-32" type="number" min={0} max={100} value={cap} onChange={(event) => setCap(event.target.value)} placeholder="Aucun" />
          </label>
          <Button type="button" variant="outline" disabled={pending} onClick={() => void saveCap()}>
            Enregistrer le plafond
          </Button>
        </div>
      </div>
    </section>
  )
}

function ValueField({
  question,
  value,
  onChange,
}: {
  question: BuilderQuestion | undefined
  value: string
  onChange: (value: string) => void
}) {
  if (question && isChoiceType(question.type)) {
    return (
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Valeur</span>
        <select className="h-10 w-full rounded-lg border bg-card px-3" value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Choisir</option>
          {question.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
    )
  }
  return (
    <label className="space-y-1 text-sm">
      <span className="text-muted-foreground">Valeur</span>
      <Input className="h-10" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}
