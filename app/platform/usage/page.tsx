import { METRICS, type UsageMetric } from "@/lib/billing/plans"
import Link from "next/link"
import { requirePlatformAdmin } from "@/lib/platform/auth"
import { loadOverview, planLimits, usageRatio } from "@/lib/platform/data"
import { createAdminClient } from "@/lib/supabase/admin"

export default async function PlatformUsagePage() {
  await requirePlatformAdmin("platform.organizations.read")
  const [overview, counters] = await Promise.all([loadOverview(), currentCounters()])
  return (
    <div className="space-y-6">
      <div className="flex justify-between"><h1 className="font-display text-4xl">Usage</h1><Link className="text-sm underline" href="/platform/usage/export">Export CSV</Link></div>
      <section className="rounded-3xl bg-white p-5">
        <h2 className="font-display text-2xl">High usage</h2>
        <ul className="mt-3 text-sm">
          {counters.filter((row) => usageRatio(row.value, row.limit) >= 0.8).map((row) => (
            <li key={`${row.organization_id}-${row.metric}`}>{row.organization_id.slice(0, 8)} · {row.metric} · {Math.round(usageRatio(row.value, row.limit) * 100)}%</li>
          ))}
        </ul>
      </section>
      <section className="rounded-3xl bg-white p-5 text-sm">
        <h2 className="font-display text-2xl">6 months</h2>
        {(overview?.usageMonths ?? []).map((row) => <p key={`${row.period_start}-${row.metric}`}>{row.period_start.slice(0, 7)} · {row.metric} · {row.value}</p>)}
      </section>
    </div>
  )
}

async function currentCounters() {
  const admin = createAdminClient()
  const start = new Date()
  start.setUTCDate(1)
  const period = start.toISOString().slice(0, 10)
  const { data } = await admin.from("usage_counters").select("organization_id, metric, value").eq("period_start", period).limit(200)
  const ids = [...new Set((data ?? []).map((row) => row.organization_id))]
  const { data: subscriptions } = ids.length ? await admin.from("subscriptions").select("organization_id, plan").in("organization_id", ids) : { data: [] }
  return (data ?? []).map((row) => {
    const plan = subscriptions?.find((item) => item.organization_id === row.organization_id)?.plan ?? "free"
    const limits = planLimits(plan)
    const limit = METRICS.some((metric) => metric === row.metric) ? limits[row.metric as UsageMetric] : null
    return { ...row, limit }
  })
}
