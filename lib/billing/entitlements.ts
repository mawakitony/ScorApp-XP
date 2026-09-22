import { FEATURES, GRACE_PERIOD_DAYS, PLANS, isPlanId, type Feature, type PlanId, type PlanLimits, type UsageMetric } from "./plans"

export const ACCESS_STATES = ["active", "grace_period", "restricted", "suspended"] as const
export type AccessState = (typeof ACCESS_STATES)[number]

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "canceled", "unpaid", "incomplete", "paused"] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export type EntitlementOverride = {
  feature: Feature
  enabled: boolean
  limitOverride?: Partial<PlanLimits>
}

export type SubscriptionView = {
  plan: string
  status: string
  trialEnd: string | null
  currentPeriodEnd: string | null
  pastDueAt: string | null
  cancelAtPeriodEnd: boolean
}

export type ResolvedEntitlements = {
  plan: PlanId
  access: AccessState
  features: ReadonlySet<Feature>
  limits: PlanLimits
  exceedsPlan: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

export function getOrganizationAccessState(input: SubscriptionView, now = Date.now()): { plan: PlanId; access: AccessState } {
  const stored = isPlanId(input.plan) ? input.plan : "free"
  if (stored === "internal") return { plan: "internal", access: "active" }
  const status = SUBSCRIPTION_STATUSES.find((item) => item === input.status) ?? "incomplete"
  const trialEnd = time(input.trialEnd)
  const periodEnd = time(input.currentPeriodEnd)
  const pastDueAt = time(input.pastDueAt)

  if (status === "trialing") {
    if (trialEnd !== null && trialEnd > now) return { plan: stored, access: "active" }
    return { plan: "free", access: "restricted" }
  }
  if (status === "active") {
    if (input.cancelAtPeriodEnd && periodEnd !== null && periodEnd <= now) return { plan: "free", access: "restricted" }
    return { plan: stored, access: "active" }
  }
  if (status === "past_due") {
    const anchor = pastDueAt ?? periodEnd ?? now
    if (now < anchor + GRACE_PERIOD_DAYS * DAY_MS) return { plan: stored, access: "grace_period" }
    return { plan: "free", access: "restricted" }
  }
  if (status === "canceled") {
    if (periodEnd !== null && periodEnd > now) return { plan: stored, access: "active" }
    return { plan: "free", access: "restricted" }
  }
  if (status === "paused" || status === "unpaid" || status === "incomplete") {
    return { plan: "free", access: "restricted" }
  }
  return { plan: "free", access: "suspended" }
}

export function resolveEntitlements(input: SubscriptionView & { overrides?: EntitlementOverride[]; limitOverrides?: Partial<PlanLimits>; usage?: Partial<PlanLimits> }, now = Date.now()): ResolvedEntitlements {
  const state = getOrganizationAccessState(input, now)
  const base = PLANS[state.plan]
  const features = new Set<Feature>(base.features)
  const limits: PlanLimits = { ...base.limits, ...input.limitOverrides }
  for (const override of input.overrides ?? []) {
    if (!FEATURES.includes(override.feature)) continue
    if (override.enabled) features.add(override.feature)
    else features.delete(override.feature)
    if (override.limitOverride) {
      for (const [metric, value] of Object.entries(override.limitOverride) as [UsageMetric, number | null][]) {
        if (metric in limits) limits[metric] = value
      }
    }
  }
  const usage = input.usage ?? {}
  const exceedsPlan = (Object.keys(limits) as UsageMetric[]).some((metric) => {
    const limit = limits[metric]
    const used = usage[metric]
    return limit !== null && typeof used === "number" && used > limit
  })
  return { plan: state.plan, access: state.access, features, limits, exceedsPlan }
}

export function hasFeature(entitlements: ResolvedEntitlements, feature: Feature) {
  return entitlements.features.has(feature)
}

export function withinLimit(entitlements: ResolvedEntitlements, metric: UsageMetric, used: number) {
  const limit = entitlements.limits[metric]
  if (limit === null) return true
  return used < limit
}

function time(value: string | null) {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}
