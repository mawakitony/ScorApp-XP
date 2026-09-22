import { requirePlatformAdmin } from "@/lib/platform/auth"
import { loadOverview } from "@/lib/platform/data"
import { loadHealth, syncPlatformAlerts } from "@/lib/platform/health"
import { createAdminClient } from "@/lib/supabase/admin"

export default async function PlatformHealthPage() {
  await requirePlatformAdmin("platform.organizations.read")
  const [checks, overview, events, alerts] = await Promise.all([loadHealth(), loadOverview(), stripeEvents(), openAlerts()])
  const degraded = checks.some((check) => check.name.endsWith("worker") && (check.status === "degraded" || check.status === "unavailable"))
  await syncPlatformAlerts({ deadJobs: overview?.jobsDead ?? 0, workersDegraded: degraded })
  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl">System Health</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {checks.map((check) => (
          <li key={check.name} className="rounded-2xl bg-white px-4 py-3 text-sm">{check.name} · {check.status}</li>
        ))}
      </ul>
      <section className="rounded-3xl bg-white p-5 text-sm">
        <h2 className="font-display text-2xl">Stripe events</h2>
        <p className="mt-2 text-[#5e6d7e]">Seuls les événements acceptés puis enregistrés sont visibles. Un webhook rejeté avant insertion n&apos;apparaît pas.</p>
        <ul className="mt-3">
          {events.map((event) => <li key={event.event_id}>{event.event_id} · {event.event_type} · {event.processed_at.slice(0, 19)} UTC</li>)}
        </ul>
      </section>
      <section className="rounded-3xl bg-white p-5 text-sm">
        <h2 className="font-display text-2xl">Alerts</h2>
        {alerts.map((alert) => <p key={alert.id}>{alert.code} · {alert.message}</p>)}
      </section>
      <section className="rounded-3xl bg-white p-5 text-sm">
        <h2 className="font-display text-2xl">Operations</h2>
        <p>Jobs failed {overview?.jobsFailed ?? "—"} · dead {overview?.jobsDead ?? "—"} · domains pending {overview?.domainsPending ?? "—"} · trials under 7 days {overview?.trials7d ?? "—"}</p>
        <p className="mt-2">AI {checks.find((check) => check.name === "AI provider")?.status}. Les générations du mois sont dans Usage. Aucune clé n&apos;est affichée.</p>
      </section>
    </div>
  )
}

async function stripeEvents() {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("stripe_events").select("event_id, event_type, processed_at").order("processed_at", { ascending: false }).limit(20)
    return data ?? []
  } catch {
    return []
  }
}

async function openAlerts() {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("platform_alerts").select("id, code, message").is("resolved_at", null).limit(20)
    return data ?? []
  } catch {
    return []
  }
}
