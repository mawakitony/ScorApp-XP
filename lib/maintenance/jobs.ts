import "server-only"

import { processEmailJobs } from "@/lib/email/worker"
import { enqueueEmail } from "@/lib/email/queue"
import { recordHeartbeat } from "@/lib/platform/heartbeat"
import { createAdminClient } from "@/lib/supabase/admin"

export async function runMaintenance() {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  await admin.from("organization_invitations").delete().is("accepted_at", null).lt("expires_at", now)
  const abandonDays = Number(process.env.ASSESSMENT_ABANDON_AFTER_DAYS ?? 7)
  if (Number.isFinite(abandonDays) && abandonDays > 0) {
    const cutoff = new Date(Date.now() - abandonDays * 24 * 60 * 60 * 1000).toISOString()
    await admin.from("assessment_sessions").update({ status: "abandoned" }).in("status", ["started", "in_progress"]).lt("last_activity_at", cutoff)
  }
  await admin.from("assessment_sessions").update({ status: "abandoned" }).in("status", ["started", "in_progress"]).lt("expires_at", now)
  await admin.from("email_jobs").update({ status: "pending" }).eq("status", "processing").lt("next_run_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
  await processEmailJobs()
  await notifyTrials(admin)
  const retention = Number(process.env.REPORT_RETENTION_DAYS ?? 0)
  if (Number.isFinite(retention) && retention > 0) await expireReports(admin, retention)
  await recordHeartbeat("maintenance_worker")
}

async function notifyTrials(admin: ReturnType<typeof createAdminClient>) {
  const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await admin.from("subscriptions").select("organization_id, trial_end").eq("status", "trialing").gt("trial_end", new Date().toISOString()).lte("trial_end", soon).limit(50)
  for (const row of data ?? []) {
    if (!row.trial_end) continue
    const { data: owner } = await admin.from("organization_members").select("user_id").eq("organization_id", row.organization_id).eq("role", "owner").limit(1).maybeSingle()
    if (!owner) continue
    const { data: profile } = await admin.from("profiles").select("email").eq("id", owner.user_id).maybeSingle()
    if (!profile?.email) continue
    const { data: organization } = await admin.from("organizations").select("name, default_language").eq("id", row.organization_id).maybeSingle()
    await enqueueEmail({
      organizationId: row.organization_id,
      template: "trial_ending",
      recipient: profile.email,
      locale: organization?.default_language === "en" ? "en" : "fr",
      idempotencyKey: `trial_ending:${row.organization_id}:${row.trial_end.slice(0, 10)}`,
      payload: { organizationName: organization?.name ?? "WOLOYEM Score", date: row.trial_end.slice(0, 10) },
    })
  }
}

async function expireReports(admin: ReturnType<typeof createAdminClient>, days: number) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await admin.from("assessment_reports").select("id, organization_id, storage_path").lt("created_at", cutoff).not("storage_path", "is", null).limit(50)
  for (const report of data ?? []) {
    if (!report.storage_path?.startsWith(`${report.organization_id}/`)) continue
    await admin.storage.from("assessment-reports").remove([report.storage_path])
    await admin.from("assessment_reports").update({ storage_path: null }).eq("id", report.id).eq("organization_id", report.organization_id)
  }
}
