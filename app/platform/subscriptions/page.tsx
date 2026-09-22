import Link from "next/link"
import { requirePlatformAdmin } from "@/lib/platform/auth"
import { createAdminClient } from "@/lib/supabase/admin"

export default async function PlatformSubscriptionsPage() {
  await requirePlatformAdmin("platform.billing.read")
  const admin = createAdminClient()
  const { data } = await admin.from("subscriptions").select("organization_id, plan, billing_interval, status, provider_customer_id, provider_subscription_id, current_period_end, cancel_at_period_end, trial_end").order("created_at", { ascending: false }).limit(100)
  const ids = [...new Set((data ?? []).map((row) => row.organization_id))]
  const { data: organizations } = ids.length ? await admin.from("organizations").select("id, name").in("id", ids) : { data: [] }
  return (
    <div className="space-y-4">
      <div className="flex justify-between"><h1 className="font-display text-4xl">Subscriptions</h1><Link className="text-sm underline" href="/platform/subscriptions/export">Export CSV</Link></div>
      <p className="text-sm text-[#5e6d7e]">Stripe reste la source de vérité. Cette console ne modifie ni le statut, ni le plan, ni la période.</p>
      <div className="overflow-x-auto rounded-3xl bg-white">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b">{["Organization", "Plan", "Interval", "Status", "Customer", "Period", ""].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr></thead>
          <tbody>
            {(data ?? []).map((row) => (
              <tr key={row.organization_id} className="border-b">
                <td className="px-3 py-2">{organizations?.find((item) => item.id === row.organization_id)?.name ?? "—"}</td>
                <td className="px-3 py-2">{row.plan}</td>
                <td className="px-3 py-2">{row.billing_interval}</td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2">{row.provider_customer_id ?? "—"}</td>
                <td className="px-3 py-2">{row.current_period_end?.slice(0, 10) ?? "—"}{row.cancel_at_period_end ? " · cancel" : ""}{row.trial_end ? ` · trial ${row.trial_end.slice(0, 10)}` : ""}</td>
                <td className="px-3 py-2"><Link className="underline" href={`/platform/organizations/${row.organization_id}`}>Ouvrir</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

