import type { Json } from "@/types/database"
import { eligibilityOperators, type EligibilityOperator, type EligibilityRule } from "@/lib/scoring/eligibility"

type Stored = { id?: string; ruleType: string; config: Json }

function text(value: unknown) {
  return typeof value === "string" ? value : ""
}

export function eligibilityFromStored(scorecardId: string, rules: Stored[]): EligibilityRule[] {
  return rules.flatMap((rule) => {
    if (rule.ruleType !== "eligibility" || !rule.config || typeof rule.config !== "object" || Array.isArray(rule.config)) return []
    const config = rule.config
    const action = config.action === "force_result" || config.action === "max_result" ? config.action : null
    const resultRangeId = text(config.resultRangeId)
    const raw = Array.isArray(config.conditions) ? config.conditions : []
    const conditions = raw.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return []
      const row = item as { operator?: unknown; questionId?: unknown; value?: unknown }
      const operator = text(row.operator)
      if (!eligibilityOperators.includes(operator as EligibilityOperator)) return []
      const questionId = text(row.questionId)
      if (!questionId) return []
      return [{ questionId, operator: operator as EligibilityOperator, value: text(row.value) }]
    })
    if (!action || !resultRangeId || conditions.length === 0 || !rule.id) return []
    return [{ id: rule.id, scorecardId, conditions, action, resultRangeId }]
  })
}

export function capsFromStored(rules: Stored[]) {
  return rules.flatMap((rule) => {
    if (rule.ruleType !== "cap" || !rule.id || !rule.config || typeof rule.config !== "object" || Array.isArray(rule.config)) return []
    const maxPercent = rule.config.maxPercent
    if (typeof maxPercent !== "number" || !Number.isFinite(maxPercent)) return []
    return [{ id: rule.id, maxPercent }]
  })
}
