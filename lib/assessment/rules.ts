import type { Json } from "@/types/database"

export type StoredRule = {
  ruleType: string
  config: Json
}

/** Les règles vides laissent le moteur tel quel. Seul un plafond explicite est appliqué. */
export function applyScoreRules(percent: number, rules: StoredRule[]) {
  let value = percent
  for (const rule of rules) {
    if (rule.ruleType !== "cap" || !rule.config || typeof rule.config !== "object" || Array.isArray(rule.config)) continue
    const max = rule.config.maxPercent
    if (typeof max === "number" && Number.isFinite(max)) value = Math.min(value, max)
  }
  if (!Number.isFinite(value)) return 0
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10
}
