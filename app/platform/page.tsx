import Link from "next/link"
import { loadOverview } from "@/lib/platform/data"
import { requirePlatformAdmin } from "@/lib/platform/auth"
import { rangeStart, summarizeMrr } from "@/lib/platform/rules"
import { createAdminClient } from "@/lib/supabase/admin"

export default async function PlatformHomePage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requirePlatformAdmin("platform.organizations.read")
  const { range } = await searchParams
  const since = rangeStart(range)
  const overview = await loadOverview()
  const activity = await activitySince(since)
  if (!overview) return <p>La migration platform admin n&apos;est pas encore appliquée.</p>
  const paid = ["starter", "pro", "business", "enterprise"].reduce((sum, plan) => sum + (overview.plans[plan] ?? 0), 0)
  const mrr = summarizeMrr([])
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-4xl">Overview</h1>
        <div className="flex gap-3 text-sm">{[["Today", "1"], ["7 days", "7"], ["30 days", "30"], ["90 days", "90"]].map(([label, value]) => <Link key={value} className="underline" href={`/platform?range=${value}`}>{label}</Link>)}</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Organizations" value={overview.organizations} />
        <Stat label="Trial" value={overview.trialsActive} />
        <Stat label="Paid" value={paid} />
        <Stat label="Free" value={overview.plans.free ?? 0} />
        <Stat label="Internal" value={overview.plans.internal ?? 0} />
        <Stat label="Suspended" value={overview.suspended} />
        <Stat label="Assessments" value={activity?.assessments ?? overview.assessments24h} />
        <Stat label="Leads" value={activity?.leads ?? overview.leads24h} />
        <Stat label="Conversions" value={activity?.conversions ?? overview.conversions24h} />
        <Stat label="Failed jobs" value={overview.jobsFailed} />
        <Stat label="Dead jobs" value={overview.jobsDead} />
        <Stat label="Report failures" value={overview.reportsFailed} />
        <Stat label="Domains pending" value={overview.domainsPending} />
      </div>
      <section className="rounded-3xl bg-white p-5">
        <h2 className="font-display text-2xl">Plans</h2>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          {["free", "trial", "starter", "pro", "business", "enterprise", "internal"].map((plan) => (
            <li key={plan}>{plan} · {plan === "trial" ? overview.trialsActive : overview.plans[plan] ?? 0}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm">MRR {mrr.length === 0 ? "Unavailable" : mrr.map((row) => row.mrrCents === null ? `${row.currency} Unavailable` : `${row.currency} ${(row.mrrCents / 100).toFixed(2)}`).join(" · ")}</p>
        <p className="text-sm text-[#5e6d7e]">Internal n&apos;entre pas dans le revenu. Les montants Stripe ne sont pas stockés : aucune estimation n&apos;est affichée.</p>
      </section>
      <section className="rounded-3xl bg-white p-5 text-sm">
        <h2 className="font-display text-2xl">Trials</h2>
        <p className="mt-2">Actifs {overview.trialsActive} · sous 3 jours {overview.trials3d} · sous 7 jours {overview.trials7d} · expirés {overview.trialsExpired}</p>
        <p className="mt-2 text-[#5e6d7e]">Un trial n&apos;est pas un client payant. Les conversions de trial ne sont pas inférées sans événement Stripe de changement de plan.</p>
      </section>
      <p className="text-sm"><Link className="underline" href="/platform/jobs">Jobs pending et dead</Link></p>
    </div>
  )
}

async function activitySince(since: string) {
  try {
    const admin = createAdminClient()
    const [assessments, leads, conversions] = await Promise.all([
      admin.from("assessment_sessions").select("id", { count: "exact", head: true }).gte("created_at", since),
      admin.from("leads").select("id", { count: "exact", head: true }).gte("created_at", since),
      admin.from("conversions").select("id", { count: "exact", head: true }).gte("created_at", since),
    ])
    return { assessments: assessments.count ?? 0, leads: leads.count ?? 0, conversions: conversions.count ?? 0 }
  } catch {
    return null
  }
}

function Stat({ label, value }: { label: string; value: number }) {
  return <article className="rounded-2xl bg-white px-4 py-3"><p className="text-xs uppercase tracking-wide text-[#5e6d7e]">{label}</p><p className="font-display text-3xl">{value}</p></article>
}
