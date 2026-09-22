import { categoryBand, type ReportLanguage } from "./version"

export type InsightCategory = {
  name: string
  percent: number
  high?: string
  medium?: string
  low?: string
}

export type InsightRule = {
  categoryName: string
  op: "lt" | "lte" | "gte"
  threshold: number
  message: string
}

export type RuleInsights = {
  officialPercent: number
  summary: string
  strengths: string[]
  improvementAreas: string[]
  recommendations: string[]
}

const priority = ["range", "category", "rule"] as const
export const RECOMMENDATION_PRIORITY = priority

export function generateRuleBasedInsights(input: {
  language: ReportLanguage
  officialPercent: number
  resultTitle: string
  resultDescription: string
  rangeRecommendation: string
  categories: InsightCategory[]
  rules?: InsightRule[]
}): RuleInsights {
  const strengths: string[] = []
  const improvementAreas: string[] = []
  const recommendations: string[] = []
  if (input.rangeRecommendation.trim()) recommendations.push(input.rangeRecommendation.trim())

  for (const category of input.categories) {
    const band = categoryBand(category.percent)
    const configured = band === "strength" ? category.high : band === "moderate" ? category.medium : category.low
    const text = configured?.trim() || defaultCategoryText(input.language, category.name, band)
    if (band === "strength") strengths.push(text)
    if (band === "improvement") improvementAreas.push(text)
    if (band !== "moderate" && configured?.trim()) recommendations.push(configured.trim())
  }

  for (const rule of input.rules ?? []) {
    const category = input.categories.find((item) => item.name.toLowerCase() === rule.categoryName.toLowerCase())
    if (!category || !ruleMatches(category.percent, rule)) continue
    if (rule.message.trim()) recommendations.push(rule.message.trim())
  }

  const summary = input.resultDescription.trim() || defaultSummary(input.language, input.officialPercent, input.resultTitle)
  return {
    officialPercent: input.officialPercent,
    summary,
    strengths,
    improvementAreas,
    recommendations: unique(recommendations),
  }
}

function ruleMatches(percent: number, rule: InsightRule) {
  if (rule.op === "lt") return percent < rule.threshold
  if (rule.op === "lte") return percent <= rule.threshold
  return percent >= rule.threshold
}

function defaultCategoryText(language: ReportLanguage, name: string, band: ReturnType<typeof categoryBand>) {
  if (language === "en") {
    if (band === "strength") return `${name} is a clear strength.`
    if (band === "moderate") return `${name} is a solid base that can still be consolidated.`
    return `${name} is an area to strengthen.`
  }
  if (band === "strength") return `${name} constitue un point fort.`
  if (band === "moderate") return `${name} constitue une base à consolider.`
  return `${name} est un axe à renforcer.`
}

function defaultSummary(language: ReportLanguage, percent: number, title: string) {
  if (language === "en") return `Your result is ${Math.round(percent)}% — ${title}. This reading follows the configured scorecard rules.`
  return `Votre résultat est de ${Math.round(percent)} % — ${title}. Cette lecture suit les règles configurées de la scorecard.`
}

function unique(values: string[]) {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = value.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
