import Link from "next/link"
import { retryPlatformJob } from "@/actions/platform"
import { requirePlatformAdmin } from "@/lib/platform/auth"
import { canPlatform } from "@/lib/platform/permissions"
import { createAdminClient } from "@/lib/supabase/admin"

const JOB_STATUSES = ["pending", "processing", "completed", "failed", "dead"] as const

export default async function PlatformJobsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const admin = await requirePlatformAdmin("platform.jobs.read")
  const { status: rawStatus } = await searchParams
  const status = JOB_STATUSES.find((item) => item === rawStatus)
  const client = createAdminClient()
  let reports = client.from("report_jobs").select("id, organization_id, kind, status, attempts, next_run_at, last_error, created_at").order("created_at", { ascending: false }).limit(50)
  let integrations = client.from("integration_jobs").select("id, organization_id, kind, status, attempts, next_run_at, last_error, created_at").order("created_at", { ascending: false }).limit(50)
  if (status && status !== "dead") {
    reports = reports.eq("status", status)
    integrations = integrations.eq("status", status)
  }
  if (status === "dead") reports = reports.eq("status", "dead")
  let deliveries = client.from("webhook_deliveries").select("id, organization_id, event_type, status, attempt, response_excerpt, created_at").order("created_at", { ascending: false }).limit(50)
  let automations = client.from("automation_runs").select("id, organization_id, status, error, started_at").order("started_at", { ascending: false }).limit(50)
  if (status === "completed") deliveries = deliveries.eq("status", "delivered")
  else if (status === "dead") deliveries = deliveries.eq("status", "dead")
  else if (status) deliveries = deliveries.eq("status", status)
  if (status === "failed" || status === "completed") automations = automations.eq("status", status === "completed" ? "completed" : "failed")
  const [reportRows, integrationRows, deliveryRows, automationRows] = await Promise.all([
    reports,
    status === "dead" ? Promise.resolve({ data: [] }) : integrations,
    status === "completed" || status === "dead" || status === "pending" || status === "processing" || status === "failed" || !status ? deliveries : Promise.resolve({ data: [] }),
    status === "pending" || status === "processing" || status === "dead" ? Promise.resolve({ data: [] }) : automations,
  ])
  const jobs = [
    ...(reportRows.data ?? []).map((row) => ({ id: row.id, source: "report", kind: row.kind, status: row.status, attempts: row.attempts, error: row.last_error, retry: row.status === "failed" || row.status === "dead" ? "report" as const : null })),
    ...(integrationRows.data ?? []).map((row) => ({ id: row.id, source: "integration", kind: row.kind, status: row.status, attempts: row.attempts, error: row.last_error, retry: row.status === "failed" ? "integration" as const : null })),
    ...(deliveryRows.data ?? []).map((row) => ({ id: row.id, source: "webhook", kind: row.event_type, status: row.status, attempts: row.attempt, error: row.response_excerpt, retry: null })),
    ...(automationRows.data ?? []).map((row) => ({ id: row.id, source: "automation", kind: "automation", status: row.status, attempts: 1, error: row.error, retry: null })),
  ]
  const canRetry = canPlatform(admin, "platform.jobs.retry")
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">Jobs</h1>
      <div className="flex gap-3 text-sm">{["pending", "processing", "completed", "failed", "dead"].map((item) => <Link key={item} className="underline" href={`/platform/jobs?status=${item}`}>{item}</Link>)}</div>
      <div className="overflow-x-auto rounded-3xl bg-white">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b">{["Type", "Status", "Attempts", "Error", ""].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr></thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b">
                <td className="px-3 py-2">{job.source} · {job.kind}</td>
                <td className="px-3 py-2">{job.status}</td>
                <td className="px-3 py-2">{job.attempts}</td>
                <td className="px-3 py-2">{job.error?.slice(0, 120) ?? "—"}</td>
                <td className="px-3 py-2">{canRetry && job.retry ? <form action={retry.bind(null, job.retry, job.id)}><button className="underline" type="submit">Retry</button></form> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

async function retry(kind: "integration" | "report", jobId: string) {
  "use server"
  await retryPlatformJob(kind, jobId)
}
