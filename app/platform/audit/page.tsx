import { requirePlatformAdmin } from "@/lib/platform/auth"
import { pageWindow } from "@/lib/platform/rules"
import { createAdminClient } from "@/lib/supabase/admin"

const PAGE = 40

export default async function PlatformAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePlatformAdmin("platform.audit.read")
  const params = await searchParams
  const window = pageWindow(Number(params.page ?? 1), PAGE)
  const admin = createAdminClient()
  let request = admin.from("audit_logs").select("id, organization_id, actor_id, action, created_at", { count: "exact" }).order("created_at", { ascending: false })
  if (params.organization) request = request.eq("organization_id", params.organization)
  if (params.actor) request = request.eq("actor_id", params.actor)
  if (params.action) request = request.eq("action", params.action.replace(/[%_]/g, ""))
  if (params.from) request = request.gte("created_at", params.from)
  const { data, count } = await request.range(window.from, window.to)
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">Audit</h1>
      <p className="text-sm text-[#5e6d7e]">Lecture seule. Aucune modification ni suppression.</p>
      <form className="flex flex-wrap gap-2 text-sm">
        <input name="organization" defaultValue={params.organization ?? ""} placeholder="Organization" className="h-10 rounded-lg border px-3" />
        <input name="actor" defaultValue={params.actor ?? ""} placeholder="Actor" className="h-10 rounded-lg border px-3" />
        <input name="action" defaultValue={params.action ?? ""} placeholder="Action" className="h-10 rounded-lg border px-3" />
        <input name="from" type="date" defaultValue={params.from ?? ""} className="h-10 rounded-lg border px-3" />
        <button className="h-10 rounded-lg bg-[#16324F] px-3 text-[#f7f4ee]" type="submit">Filtrer</button>
      </form>
      <div className="overflow-x-auto rounded-3xl bg-white">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b">{["When UTC", "Action", "Organization", "Actor"].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr></thead>
          <tbody>
            {(data ?? []).map((row) => (
              <tr key={row.id} className="border-b">
                <td className="px-3 py-2">{row.created_at.slice(0, 19)}</td>
                <td className="px-3 py-2">{row.action}</td>
                <td className="px-3 py-2">{row.organization_id.slice(0, 8)}</td>
                <td className="px-3 py-2">{row.actor_id?.slice(0, 8) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm">{count ?? 0} événements · page {window.page}</p>
    </div>
  )
}
