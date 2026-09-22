import "server-only"

import { activeAiProvider } from "@/lib/ai/provider"
import { stripeClient } from "@/lib/billing/stripe"
import { heartbeatState } from "@/lib/platform/rules"
import { createAdminClient } from "@/lib/supabase/admin"

export type HealthStatus = "healthy" | "degraded" | "unavailable" | "not_configured"

export async function loadHealth(): Promise<{ name: string; status: HealthStatus }[]> {
  const database = await databaseStatus()
  const stripe = await stripeStatus()
  const heartbeats = await workerStatus()
  const storage = await storageStatus()
  const ai = activeAiProvider().configured ? "healthy" as const : "not_configured" as const
  const brevo = process.env.BREVO_API_KEY ? "healthy" as const : "not_configured" as const
  return [
    { name: "Database", status: database },
    { name: "Stripe", status: stripe },
    { name: "Report worker", status: heartbeats.report_worker },
    { name: "Integration worker", status: heartbeats.integration_worker },
    { name: "Email worker", status: heartbeats.email_worker },
    { name: "Maintenance", status: heartbeats.maintenance_worker },
    { name: "Storage", status: storage },
    { name: "AI provider", status: ai },
    { name: "Brevo", status: brevo },
  ]
}

async function databaseStatus(): Promise<HealthStatus> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from("organizations").select("id").limit(1)
    return error ? "unavailable" : "healthy"
  } catch {
    return "unavailable"
  }
}

async function stripeStatus(): Promise<HealthStatus> {
  const stripe = stripeClient()
  if (!stripe) return "not_configured"
  try {
    await stripe.balance.retrieve()
    return "healthy"
  } catch {
    return "unavailable"
  }
}

async function workerStatus() {
  const fallback = {
    integration_worker: "unavailable" as HealthStatus,
    report_worker: "unavailable" as HealthStatus,
    email_worker: "unavailable" as HealthStatus,
    maintenance_worker: "unavailable" as HealthStatus,
  }
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from("system_heartbeats").select("name, last_seen_at")
    if (error || !data) return fallback
    for (const row of data) {
      if (row.name === "integration_worker" || row.name === "report_worker" || row.name === "email_worker" || row.name === "maintenance_worker") fallback[row.name] = heartbeatState(row.last_seen_at)
    }
    return fallback
  } catch {
    return fallback
  }
}

async function storageStatus(): Promise<HealthStatus> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.storage.getBucket("assessment-reports")
    if (error || !data) return "unavailable"
    return "healthy"
  } catch {
    return "unavailable"
  }
}

export async function syncPlatformAlerts(input: { deadJobs: number; workersDegraded: boolean }) {
  const alerts: { code: string; message: string }[] = []
  if (input.deadJobs >= 5) alerts.push({ code: "many_dead_jobs", message: "Plusieurs jobs de rapports sont morts." })
  if (input.workersDegraded) alerts.push({ code: "cron_stale", message: "Un worker n'a pas envoyé de heartbeat récent." })
  try {
    const admin = createAdminClient()
    for (const alert of alerts) {
      const { data } = await admin.from("platform_alerts").select("id").eq("code", alert.code).is("resolved_at", null).maybeSingle()
      if (!data) await admin.from("platform_alerts").insert(alert)
    }
  } catch {
    return
  }
}
