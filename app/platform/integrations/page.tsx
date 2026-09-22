import { requirePlatformAdmin } from "@/lib/platform/auth"
import { integrationHealth, rangeStart } from "@/lib/platform/rules"
import { createAdminClient } from "@/lib/supabase/admin"

export default async function PlatformIntegrationsPage() {
  await requirePlatformAdmin("platform.jobs.read")
  const admin = createAdminClient()
  const since = rangeStart("1")
  const [{ data: integrations }, { data: failed }, { data: dead }] = await Promise.all([
    admin.from("integrations").select("id, organization_id, provider, status").order("created_at", { ascending: false }).limit(100),
    admin.from("webhook_deliveries").select("integration_id").eq("status", "failed").gte("created_at", since).limit(500),
    admin.from("webhook_deliveries").select("integration_id").eq("status", "dead").limit(500),
  ])
  const failedCount = new Map<string, number>()
  for (const row of failed ?? []) failedCount.set(row.integration_id, (failedCount.get(row.integration_id) ?? 0) + 1)
  const deadIds = new Set((dead ?? []).map((row) => row.integration_id))
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">Integrations</h1>
      <p className="text-sm text-[#5e6d7e]">Webhook, Brevo, AI et Stripe. WhatsApp reste indisponible.</p>
      <div className="overflow-x-auto rounded-3xl bg-white">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b">{["Provider", "Enabled", "Failures 24h", "Health"].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr></thead>
          <tbody>
            {(integrations ?? []).map((row) => {
              const failures = failedCount.get(row.id) ?? 0
              const degraded = integrationHealth({ failures24h: failures, dead: deadIds.has(row.id) }) === "degraded"
              return (
                <tr key={row.id} className="border-b">
                  <td className="px-3 py-2">{row.provider}</td>
                  <td className="px-3 py-2">{row.status === "active" ? "yes" : "no"}</td>
                  <td className="px-3 py-2">{failures}</td>
                  <td className="px-3 py-2">{degraded ? "degraded" : "healthy"}</td>
                </tr>
              )
            })}
            <tr><td className="px-3 py-2">whatsapp</td><td className="px-3 py-2">no</td><td className="px-3 py-2">—</td><td className="px-3 py-2">unavailable</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
