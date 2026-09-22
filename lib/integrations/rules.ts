export type RuleCondition = {
  field: "score" | "country" | "status" | "temperature" | "scorecard" | "result" | "cta_clicked" | "tag"
  op: "eq" | "gte" | "lte"
  value: string | number | boolean
}

export type AutomationContext = {
  score: number | null
  country: string | null
  status: string | null
  temperature: string | null
  scorecardId: string | null
  result: string | null
  ctaClicked: boolean
  tags: string[]
}

const fields = ["score", "country", "status", "temperature", "scorecard", "result", "cta_clicked", "tag"] as const
const operators = ["eq", "gte", "lte"] as const

export function parseConditions(value: unknown): RuleCondition[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    if (!fields.some((field) => field === row.field) || !operators.some((op) => op === row.op)) return []
    if (typeof row.value !== "string" && typeof row.value !== "number" && typeof row.value !== "boolean") return []
    return [{ field: row.field as RuleCondition["field"], op: row.op as RuleCondition["op"], value: row.value }]
  })
}

export function conditionsMatch(conditions: RuleCondition[], context: AutomationContext) {
  return conditions.every((condition) => matches(condition, context))
}

export function automationRunKey(ruleId: string, eventId: string) {
  return `${ruleId}:${eventId}`
}

function matches(condition: RuleCondition, context: AutomationContext) {
  if (condition.field === "score") {
    if (context.score === null || typeof condition.value !== "number") return false
    if (condition.op === "gte") return context.score >= condition.value
    if (condition.op === "lte") return context.score <= condition.value
    return context.score === condition.value
  }
  if (condition.field === "cta_clicked") return context.ctaClicked === condition.value
  if (condition.field === "tag") return context.tags.includes(String(condition.value))
  const current = fieldValue(condition.field, context)
  if (current === null) return false
  return String(current).toLowerCase() === String(condition.value).toLowerCase()
}

function fieldValue(field: RuleCondition["field"], context: AutomationContext) {
  if (field === "country") return context.country
  if (field === "status") return context.status
  if (field === "temperature") return context.temperature
  if (field === "scorecard") return context.scorecardId
  if (field === "result") return context.result
  return null
}
