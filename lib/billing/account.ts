import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { FEATURES, METRICS, type Feature, type UsageMetric } from "@/lib/billing/plans"
import { hasFeature, resolveEntitlements, type EntitlementOverride, type ResolvedEntitlements, type SubscriptionView } from "@/lib/billing/entitlements"
import { monthPeriod, usageLevel } from "@/lib/billing/usage"
import { activeSuspension } from "@/lib/platform/data"
import type { PlanLimits } from "@/lib/billing/plans"

const FEATURE_METRIC: Partial<Record<Feature, UsageMetric>> = {
  ai: "ai_generations",
  webhooks: "webhook_deliveries",
  api: "api_requests",
}

const OPEN_INTERNAL: SubscriptionView = {
  plan: "internal",
  status: "active",
  trialEnd: null,
  currentPeriodEnd: null,
  pastDueAt: null,
  cancelAtPeriodEnd: false,
}

function missingRelation(message: string) {
  return /does not exist|schema cache|Could not find/i.test(message)
}

export async function loadEntitlements(organizationId: string): Promise<ResolvedEntitlements> {
  try {
    const admin = createAdminClient()
    const [{ data: subscription, error: subscriptionError }, { data: overrides, error: overrideError }, { data: organization }] = await Promise.all([
      admin.from("subscriptions").select("plan, status, trial_end, current_period_end, past_due_at, cancel_at_period_end").eq("organization_id", organizationId).maybeSingle(),
      admin.from("organization_entitlements").select("feature, enabled, limit_override").eq("organization_id", organizationId),
      admin.from("organizations").select("slug").eq("id", organizationId).maybeSingle(),
    ])
    if (subscriptionError && missingRelation(subscriptionError.message)) return resolveEntitlements(OPEN_INTERNAL)
    if (overrideError && missingRelation(overrideError.message)) return resolveEntitlements(OPEN_INTERNAL)
    const view: SubscriptionView = subscription
      ? {
          plan: subscription.plan,
          status: subscription.status,
          trialEnd: subscription.trial_end,
          currentPeriodEnd: subscription.current_period_end,
          pastDueAt: subscription.past_due_at,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        }
      : organization?.slug === "woloyem"
        ? OPEN_INTERNAL
        : { ...OPEN_INTERNAL, plan: "free", status: "active" }
    const featureOverrides: EntitlementOverride[] = []
    const limitOverrides: Partial<PlanLimits> = {}
    for (const row of overrides ?? []) {
      if (METRICS.some((metric) => metric === row.feature) && row.limit_override !== null) {
        limitOverrides[row.feature as UsageMetric] = row.limit_override
      }
      if (!FEATURES.some((feature) => feature === row.feature)) continue
      const feature = row.feature as Feature
      const metric = FEATURE_METRIC[feature]
      featureOverrides.push({
        feature,
        enabled: row.enabled,
        limitOverride: metric && row.limit_override !== null ? { [metric]: row.limit_override } : undefined,
      })
    }
    return resolveEntitlements({ ...view, overrides: featureOverrides, limitOverrides })
  } catch {
    return resolveEntitlements(OPEN_INTERNAL)
  }
}

export async function organizationHasFeature(organizationId: string, feature: Feature) {
  return hasFeature(await loadEntitlements(organizationId), feature)
}

export async function monthlyUsage(organizationId: string, metric: UsageMetric) {
  const period = monthPeriod()
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from("usage_counters").select("value").eq("organization_id", organizationId).eq("metric", metric).eq("period_start", period.start).maybeSingle()
    if (error) return 0
    return data?.value ?? 0
  } catch {
    return 0
  }
}

export async function consumeMonthly(organizationId: string, metric: UsageMetric, limit: number | null) {
  const period = monthPeriod()
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc("consume_usage", {
      p_org: organizationId,
      p_metric: metric,
      p_limit: limit,
      p_period_start: period.start,
      p_period_end: period.end,
    })
    if (error) return missingRelation(error.message)
    if (data === -1) return false
    if (typeof data === "number" && limit !== null) {
      const level = usageLevel(data, limit)
      if (level !== "ok") {
        await admin.from("notifications").insert({
          organization_id: organizationId,
          type: "usage",
          title: level === "full" ? "Limite atteinte" : "Usage élevé",
          message: `${metric} : ${data} / ${limit}`,
          dedupe_key: `usage:${metric}:${period.start}:${level}`,
        })
      }
    }
    return true
  } catch {
    return true
  }
}

export async function allowNewAssessment(organizationId: string) {
  if (await activeSuspension(organizationId)) return false
  const entitlements = await loadEntitlements(organizationId)
  if (entitlements.access === "suspended") return false
  const leads = await monthlyUsage(organizationId, "leads")
  if (entitlements.limits.leads !== null && leads >= entitlements.limits.leads) return false
  return consumeMonthly(organizationId, "assessment_starts", entitlements.limits.assessment_starts)
}

export async function recordLead(organizationId: string) {
  const entitlements = await loadEntitlements(organizationId)
  await consumeMonthly(organizationId, "leads", null)
  return entitlements
}
