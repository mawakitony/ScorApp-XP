import { activeDomainProvider } from "@/lib/domains/provider"
import { requirePlatformAdmin } from "@/lib/platform/auth"
import { createAdminClient } from "@/lib/supabase/admin"

export default async function PlatformDomainsPage() {
  await requirePlatformAdmin("platform.organizations.read")
  const admin = createAdminClient()
  const { data } = await admin.from("custom_domains").select("id, domain, organization_id, status, verified_at, created_at").order("created_at", { ascending: false }).limit(100)
  const ids = [...new Set((data ?? []).map((row) => row.organization_id))]
  const { data: organizations } = ids.length ? await admin.from("organizations").select("id, name").in("id", ids) : { data: [] }
  const { data: subscriptions } = ids.length ? await admin.from("subscriptions").select("organization_id, plan").in("organization_id", ids) : { data: [] }
  const vercel = activeDomainProvider().id === "vercel-ready"
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">Domains</h1>
      {vercel ? null : <p className="text-sm">Vercel domain automation is not configured.</p>}
      <div className="overflow-x-auto rounded-3xl bg-white">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b">{["Domain", "Organization", "Status", "Verified", "Plan", "Created"].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr></thead>
          <tbody>
            {(data ?? []).map((row) => (
              <tr key={row.id} className="border-b">
                <td className="px-3 py-2">{row.domain}</td>
                <td className="px-3 py-2">{organizations?.find((item) => item.id === row.organization_id)?.name ?? "—"}</td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2">{row.verified_at?.slice(0, 10) ?? "—"}</td>
                <td className="px-3 py-2">{subscriptions?.find((item) => item.organization_id === row.organization_id)?.plan ?? "—"}</td>
                <td className="px-3 py-2">{row.created_at.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

