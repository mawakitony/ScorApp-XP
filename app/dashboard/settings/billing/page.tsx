import { PlanActions, PortalButton } from "@/components/billing/plan-actions"
import { can } from "@/lib/auth/permissions"
import { loadEntitlements, monthlyUsage } from "@/lib/billing/account"
import { usageLevel } from "@/lib/billing/usage"
import { PLANS } from "@/lib/billing/plans"
import { ensureMembership } from "@/lib/data/membership"
import { requireUser } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export const metadata = { title: "Facturation" }

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  await requireUser()
  const membership = await ensureMembership()
  if (!membership) return null
  const params = await searchParams
  const entitlements = await loadEntitlements(membership.organization.id)
  const manager = can({ role: membership.role }, "billing.manage")
  const viewer = manager || can({ role: membership.role }, "billing.view")
  if (!viewer) return <p className="text-sm">Permission refusée.</p>
  let periodEnd: string | null = null
  let status: string = entitlements.access
  let interval = "monthly"
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("subscriptions").select("status, billing_interval, current_period_end, trial_end").eq("organization_id", membership.organization.id).maybeSingle()
    periodEnd = data?.current_period_end ?? data?.trial_end ?? null
    status = data?.status ?? status
    interval = data?.billing_interval ?? interval
  } catch {
    status = "unavailable"
  }
  const [starts, leads, scorecards, members] = await Promise.all([
    monthlyUsage(membership.organization.id, "assessment_starts"),
    monthlyUsage(membership.organization.id, "leads"),
    countRows("scorecards", membership.organization.id),
    countRows("organization_members", membership.organization.id),
  ])
  const plan = PLANS[entitlements.plan]
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-4xl">Facturation</h1>
      {params.checkout === "return" ? <p className="text-sm">Paiement reçu par Stripe. Le plan est activé après confirmation du webhook.</p> : null}
      {status === "unavailable" ? <p className="text-sm">Billing information is temporarily unavailable.</p> : null}
      <section className="rounded-3xl border bg-card p-6">
        <p className="text-sm text-muted-foreground">Current plan</p>
        <h2 className="font-display text-3xl">{plan.name}</h2>
        <p className="mt-2 text-sm">{interval === "yearly" ? "Yearly" : "Monthly"} · {status}</p>
        <p className="text-sm">{periodEnd ? `Next billing: ${new Date(periodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "Sans échéance Stripe"}</p>
        {entitlements.exceedsPlan ? <p className="mt-3 text-sm">Your current usage exceeds your new plan limit.</p> : null}
        <div className="mt-4">{manager && entitlements.plan !== "internal" ? <PortalButton /> : null}</div>
      </section>
      <section className="rounded-3xl border bg-card p-6">
        <h2 className="font-display text-2xl">Current usage</h2>
        <Usage label="Assessments" used={starts} limit={entitlements.limits.assessment_starts} />
        <Usage label="Leads" used={leads} limit={entitlements.limits.leads} />
        <Usage label="Scorecards" used={scorecards} limit={entitlements.limits.scorecards} />
        <Usage label="Team members" used={members} limit={entitlements.limits.team_members} />
      </section>
      {manager && entitlements.plan !== "internal" ? (
        <section className="rounded-3xl border bg-card p-6">
          <h2 className="font-display text-2xl">Changer de plan</h2>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <PlanActions plan="starter" interval="monthly" />
            <PlanActions plan="pro" interval="monthly" />
            <PlanActions plan="business" interval="monthly" />
            <PlanActions plan="pro" interval="yearly" />
          </div>
        </section>
      ) : null}
      <section className="rounded-3xl border border-dashed p-6">
        <h2 className="font-display text-2xl">Danger Zone</h2>
        <p className="mt-2 text-sm text-muted-foreground">La suppression d&apos;organisation n&apos;est pas disponible tant que Stripe et le stockage ne sont pas audités.</p>
      </section>
    </div>
  )
}

function Usage({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const level = usageLevel(used, limit)
  return (
    <p className="mt-3 text-sm">
      {label} {used} / {limit === null ? "∞" : limit}
      {level === "warn80" || level === "warn90" ? ` · ${Math.round((used / (limit || 1)) * 100)} %` : ""}
      {level === "full" ? " · limite atteinte" : ""}
    </p>
  )
}

async function countRows(table: "scorecards" | "organization_members", organizationId: string) {
  const supabase = await createClient()
  const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
  return count ?? 0
}
