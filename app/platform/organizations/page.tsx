import Link from "next/link"
import { requirePlatformAdmin } from "@/lib/platform/auth"
import { accountState } from "@/lib/platform/data"
import { pageWindow, searchTarget } from "@/lib/platform/rules"
import { createAdminClient } from "@/lib/supabase/admin"

const PAGE = 25

export default async function PlatformOrganizationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePlatformAdmin("platform.organizations.read")
  const params = await searchParams
  const window = pageWindow(Number(params.page ?? 1), PAGE)
  const page = window.page
  const query = (params.q ?? "").replace(/[%_,]/g, "").trim()
  const admin = createAdminClient()
  const ids: string[] | null = await matchingOrganizations(admin, params, query)
  let request = admin.from("organizations").select("id, name, slug, country, created_at", { count: "exact" }).order("created_at", { ascending: false })
  if (ids !== null) request = request.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
  if (query && searchTarget(query) === "organization" && !query.includes("@")) request = request.or(`name.ilike.%${query}%,slug.ilike.%${query}%`)
  if (params.country) request = request.eq("country", params.country)
  if (params.created) request = request.gte("created_at", params.created)
  const { data, count, error } = await request.range(window.from, window.to)
  if (error) return <p>La liste est indisponible.</p>
  const pageIds = (data ?? []).map((row) => row.id)
  const [{ data: subscriptions }, counts] = await Promise.all([
    pageIds.length ? admin.from("subscriptions").select("organization_id, plan, status, trial_end, current_period_end, past_due_at, cancel_at_period_end").in("organization_id", pageIds) : Promise.resolve({ data: [] }),
    pageCounts(pageIds),
  ])
  const preserved = linkQuery(params, query)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-4xl">Organizations</h1>
        <Link className="text-sm underline" href="/platform/organizations/export">Export CSV</Link>
      </div>
      <form className="flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={query} placeholder="Nom, slug, email, cus_" className="h-10 rounded-lg border px-3" />
        <select name="plan" defaultValue={params.plan ?? ""} className="h-10 rounded-lg border px-2">
          <option value="">Plan</option>
          {["free", "starter", "pro", "business", "enterprise", "internal"].map((plan) => <option key={plan}>{plan}</option>)}
        </select>
        <select name="status" defaultValue={params.status ?? ""} className="h-10 rounded-lg border px-2">
          <option value="">Statut</option>
          {["trialing", "active", "past_due", "canceled", "unpaid", "incomplete", "paused"].map((status) => <option key={status}>{status}</option>)}
        </select>
        <select name="state" defaultValue={params.state ?? ""} className="h-10 rounded-lg border px-2">
          <option value="">Compte</option>
          <option value="suspended">suspended</option>
        </select>
        <select name="trial" defaultValue={params.trial ?? ""} className="h-10 rounded-lg border px-2">
          <option value="">Trial</option>
          <option value="yes">En trial</option>
        </select>
        <input name="country" defaultValue={params.country ?? ""} placeholder="Pays" className="h-10 rounded-lg border px-3" />
        <input name="created" type="date" defaultValue={params.created ?? ""} className="h-10 rounded-lg border px-3" />
        <select name="domain" defaultValue={params.domain ?? ""} className="h-10 rounded-lg border px-2">
          <option value="">Domaine</option>
          <option value="yes">Avec domaine</option>
        </select>
        <button className="h-10 rounded-lg bg-[#16324F] px-3 text-[#f7f4ee]" type="submit">Filtrer</button>
      </form>
      <div className="overflow-x-auto rounded-3xl bg-white">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b">{["Organization", "Plan", "Subscription", "Members", "Scorecards", "Assessments", "Leads", "Created", "Last activity", "Status", ""].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr></thead>
          <tbody>
            {(data ?? []).map((organization) => {
              const subscription = subscriptions?.find((item) => item.organization_id === organization.id)
              const tally = counts.get(organization.id)
              const state = accountState({
                plan: subscription?.plan ?? "free",
                status: subscription?.status ?? "active",
                trialEnd: subscription?.trial_end ?? null,
                currentPeriodEnd: subscription?.current_period_end ?? null,
                pastDueAt: subscription?.past_due_at ?? null,
                cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
              })
              return (
                <tr key={organization.id} className="border-b">
                  <td className="px-3 py-2">{organization.name}<div className="text-[#5e6d7e]">{organization.slug}</div></td>
                  <td className="px-3 py-2">{subscription?.plan ?? "—"}</td>
                  <td className="px-3 py-2">{subscription?.status ?? "—"}</td>
                  <td className="px-3 py-2">{tally?.members ?? 0}</td>
                  <td className="px-3 py-2">{tally?.scorecards ?? 0}</td>
                  <td className="px-3 py-2">{tally?.assessments ?? 0}</td>
                  <td className="px-3 py-2">{tally?.leads ?? 0}</td>
                  <td className="px-3 py-2">{organization.created_at.slice(0, 10)}</td>
                  <td className="px-3 py-2">{tally?.activity ?? "—"}</td>
                  <td className="px-3 py-2">{state}</td>
                  <td className="px-3 py-2"><Link className="underline" href={`/platform/organizations/${organization.id}`}>Ouvrir</Link></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-[#5e6d7e]">{count ?? 0} organisations · page {page}</p>
      <div className="flex gap-3 text-sm">
        {page > 1 ? <Link className="underline" href={`/platform/organizations?${preserved}&page=${page - 1}`}>Précédent</Link> : null}
        {(count ?? 0) > page * PAGE ? <Link className="underline" href={`/platform/organizations?${preserved}&page=${page + 1}`}>Suivant</Link> : null}
      </div>
    </div>
  )
}

async function matchingOrganizations(admin: ReturnType<typeof createAdminClient>, params: Record<string, string | undefined>, query: string): Promise<string[] | null> {
  const box: { ids: string[] | null } = { ids: null }
  const take = (next: string[]) => {
    box.ids = box.ids ? box.ids.filter((id) => next.includes(id)) : next
  }
  const target = searchTarget(query)
  if (query && target === "stripe") {
    const column = query.startsWith("sub_") ? "provider_subscription_id" : "provider_customer_id"
    const { data } = await admin.from("subscriptions").select("organization_id").eq(column, query).limit(PAGE)
    take((data ?? []).map((row) => row.organization_id))
  }
  if (query && target === "domain") {
    const { data } = await admin.from("custom_domains").select("organization_id").ilike("domain", query).limit(PAGE)
    take((data ?? []).map((row) => row.organization_id))
  }
  if (query.includes("@")) {
    const { data: profiles } = await admin.from("profiles").select("id").ilike("email", query).limit(10)
    const profileIds = (profiles ?? []).map((row) => row.id)
    const { data } = profileIds.length ? await admin.from("organization_members").select("organization_id").in("user_id", profileIds).eq("role", "owner") : { data: [] }
    take((data ?? []).map((row) => row.organization_id))
  }
  if (params.plan || params.status || params.trial === "yes") {
    let request = admin.from("subscriptions").select("organization_id")
    if (params.plan) request = request.eq("plan", params.plan)
    if (params.status) request = request.eq("status", params.status)
    if (params.trial === "yes") request = request.eq("status", "trialing")
    const { data } = await request.limit(1000)
    take((data ?? []).map((row) => row.organization_id))
  }
  if (params.domain === "yes") {
    const { data } = await admin.from("custom_domains").select("organization_id").limit(1000)
    take([...new Set((data ?? []).map((row) => row.organization_id))])
  }
  if (params.state === "suspended") {
    const { data } = await admin.from("organization_suspensions").select("organization_id").is("lifted_at", null)
    take((data ?? []).map((row) => row.organization_id))
  }
  return box.ids
}

async function pageCounts(ids: string[]) {
  const counts = new Map<string, { members: number; scorecards: number; assessments: number; leads: number; activity: string | null }>()
  if (!ids.length) return counts
  const admin = createAdminClient()
  await Promise.all(ids.map(async (id) => {
    const [members, scorecards, leads] = await Promise.all([
      admin.from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", id),
      admin.from("scorecards").select("id").eq("organization_id", id),
      admin.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", id),
    ])
    const cardIds = (scorecards.data ?? []).map((card) => card.id)
    const assessments = cardIds.length
      ? await admin.from("assessment_sessions").select("id", { count: "exact", head: true }).in("scorecard_id", cardIds)
      : { count: 0 }
    const activity = cardIds.length
      ? await admin.from("assessment_sessions").select("last_activity_at").in("scorecard_id", cardIds).order("last_activity_at", { ascending: false }).limit(1).maybeSingle()
      : { data: null }
    counts.set(id, {
      members: members.count ?? 0,
      scorecards: cardIds.length,
      assessments: assessments.count ?? 0,
      leads: leads.count ?? 0,
      activity: activity.data?.last_activity_at.slice(0, 10) ?? null,
    })
  }))
  return counts
}

function linkQuery(params: Record<string, string | undefined>, query: string) {
  const search = new URLSearchParams()
  if (query) search.set("q", query)
  for (const key of ["plan", "status", "state", "trial", "country", "created", "domain"]) {
    const value = params[key]
    if (value) search.set(key, value)
  }
  return search.toString()
}
