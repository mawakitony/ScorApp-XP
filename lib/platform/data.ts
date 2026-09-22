import "server-only"

import { cookies } from "next/headers"
import { getOrganizationAccessState } from "@/lib/billing/entitlements"
import { PLANS } from "@/lib/billing/plans"
import { supportIsOpen } from "@/lib/platform/rules"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Json } from "@/types/database"

export const SUPPORT_COOKIE = "woloyem_support"

export type Overview = {
  organizations: number
  plans: Record<string, number>
  statuses: Record<string, number>
  trialsActive: number
  trials3d: number
  trials7d: number
  trialsExpired: number
  assessments24h: number
  leads24h: number
  conversions24h: number
  jobsFailed: number
  jobsDead: number
  reportsFailed: number
  domainsPending: number
  suspended: number
  usageMonths: { period_start: string; metric: string; value: number }[]
}

export async function loadOverview(): Promise<Overview | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc("platform_overview")
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return null
    const row = data as Record<string, Json>
    return {
      organizations: numberValue(row.organizations),
      plans: recordValue(row.plans),
      statuses: recordValue(row.statuses),
      trialsActive: numberValue(row.trials_active),
      trials3d: numberValue(row.trials_3d),
      trials7d: numberValue(row.trials_7d),
      trialsExpired: numberValue(row.trials_expired),
      assessments24h: numberValue(row.assessments_24h),
      leads24h: numberValue(row.leads_24h),
      conversions24h: numberValue(row.conversions_24h),
      jobsFailed: numberValue(row.jobs_failed),
      jobsDead: numberValue(row.jobs_dead),
      reportsFailed: numberValue(row.reports_failed),
      domainsPending: numberValue(row.domains_pending),
      suspended: numberValue(row.suspended),
      usageMonths: Array.isArray(row.usage_months) ? row.usage_months.flatMap(monthRow) : [],
    }
  } catch {
    return null
  }
}

export async function activeSuspension(organizationId: string) {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from("organization_suspensions").select("id, reason").eq("organization_id", organizationId).is("lifted_at", null).maybeSingle()
    if (error) return null
    return data
  } catch {
    return null
  }
}

export async function readSupportSession(adminId: string) {
  const jar = await cookies()
  const id = jar.get(SUPPORT_COOKIE)?.value
  if (!id) return null
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("support_sessions").select("id, organization_id, reason, status, expires_at, platform_admin_id").eq("id", id).eq("platform_admin_id", adminId).maybeSingle()
    if (!data) return null
    if (data.status === "active" && !supportIsOpen({ status: data.status, expiresAt: data.expires_at })) {
      await admin.from("support_sessions").update({ status: "expired", ended_at: new Date().toISOString() }).eq("id", data.id).eq("status", "active")
      await admin.from("audit_logs").insert({ organization_id: data.organization_id, actor_id: adminId, action: "support_session.expired", metadata: { support_session_id: data.id } })
      return null
    }
    if (!supportIsOpen({ status: data.status, expiresAt: data.expires_at })) return null
    const { data: organization } = await admin.from("organizations").select("id, name, slug").eq("id", data.organization_id).maybeSingle()
    if (!organization) return null
    return { ...data, organization }
  } catch {
    return null
  }
}

export function accountState(input: { plan: string; status: string; trialEnd: string | null; currentPeriodEnd: string | null; pastDueAt: string | null; cancelAtPeriodEnd: boolean }) {
  return getOrganizationAccessState(input).access
}

export function usageRatio(used: number, limit: number | null) {
  if (limit === null || limit <= 0) return limit === 0 && used > 0 ? 1 : 0
  return used / limit
}

export function planLimits(plan: string) {
  if (plan === "free" || plan === "starter" || plan === "pro" || plan === "business" || plan === "enterprise" || plan === "internal") {
    return PLANS[plan].limits
  }
  return PLANS.free.limits
}

function numberValue(value: Json | undefined) {
  return typeof value === "number" ? value : 0
}

function recordValue(value: Json | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typeof item === "number" ? item : 0]))
}

function monthRow(value: Json) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  const period = value.period_start
  const metric = value.metric
  const total = value.value
  if (typeof period !== "string" || typeof metric !== "string" || typeof total !== "number") return []
  return [{ period_start: period, metric, value: total }]
}
