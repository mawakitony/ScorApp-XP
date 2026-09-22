import { notFound, redirect } from "next/navigation"
import { checkPlatformDomain, startSupportSession, suspendOrganization, unsuspendOrganization, updateEntitlement } from "@/actions/platform"
import { loadEntitlements } from "@/lib/billing/account"
import { isPlanId, PLANS, FEATURES, METRICS } from "@/lib/billing/plans"
import { requirePlatformAdmin } from "@/lib/platform/auth"
import { accountState, activeSuspension, readSupportSession } from "@/lib/platform/data"
import { credentialState } from "@/lib/platform/dto"
import { canPlatform } from "@/lib/platform/permissions"
import { canEditEntitlements, canSuspendOrganization, maskEmail, supportCanRead, WOLOYEM_SLUG } from "@/lib/platform/rules"
import { createAdminClient } from "@/lib/supabase/admin"

export default async function PlatformOrganizationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const admin = await requirePlatformAdmin("platform.organizations.read")
  const { id } = await params
  const { notice } = await searchParams
  const support = await readSupportSession(admin.userId)
  if (support && !supportCanRead({ open: true, sessionOrgId: support.organization_id, requestedOrgId: id })) notFound()
  const client = createAdminClient()
  const { data: organization } = await client.from("organizations").select("id, name, slug, country, created_at").eq("id", id).maybeSingle()
  if (!organization) notFound()
  const [{ data: subscription }, { data: members }, { data: domains }, { data: integrations }, { data: entitlements }, suspension, resolved] = await Promise.all([
    client.from("subscriptions").select("plan, status, billing_interval, provider_customer_id, provider_subscription_id, trial_end, current_period_end, past_due_at, cancel_at_period_end").eq("organization_id", id).maybeSingle(),
    client.from("organization_members").select("user_id, role, access_role, profile:profiles(email)").eq("organization_id", id),
    client.from("custom_domains").select("id, domain, status, verified_at").eq("organization_id", id),
    client.from("integrations").select("id, provider, status, encrypted_credentials").eq("organization_id", id),
    client.from("organization_entitlements").select("feature, enabled, limit_override").eq("organization_id", id),
    activeSuspension(id),
    loadEntitlements(id),
  ])
  const storedPlan = subscription?.plan ?? "free"
  const plan = isPlanId(storedPlan) ? storedPlan : "free"
  const state = accountState({
    plan,
    status: subscription?.status ?? "active",
    trialEnd: subscription?.trial_end ?? null,
    currentPeriodEnd: subscription?.current_period_end ?? null,
    pastDueAt: subscription?.past_due_at ?? null,
    cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
  })
  const canEdit = canEditEntitlements({ slug: organization.slug, allowed: canPlatform(admin, "platform.entitlements.manage") })
  const canSuspend = canSuspendOrganization({ slug: organization.slug, allowed: canPlatform(admin, "platform.organizations.manage") })
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide">Organization</p>
        <h1 className="font-display text-4xl">{organization.name}</h1>
        <p className="text-sm text-[#5e6d7e]">{organization.slug} · {plan} · {subscription?.status ?? "—"} · {state}{suspension ? " · suspended" : ""}</p>
        {notice ? <p className="mt-2 text-sm">{notice}</p> : null}
      </header>
      <section className="rounded-3xl bg-white p-5 text-sm">
        <h2 className="font-display text-2xl">Overview</h2>
        <p className="mt-2">Créée le {organization.created_at.slice(0, 10)} UTC · pays {organization.country ?? "—"} · membres {members?.length ?? 0}</p>
        <p>Stripe customer {subscription?.provider_customer_id ?? "—"} · subscription {subscription?.provider_subscription_id ?? "—"} · {subscription?.billing_interval ?? "—"}</p>
        {subscription?.provider_customer_id ? <a className="underline" href={`https://dashboard.stripe.com/customers/${subscription.provider_customer_id}`}>Open in Stripe</a> : null}
      </section>
      <section className="rounded-3xl bg-white p-5">
        <h2 className="font-display text-2xl">Members</h2>
        <ul className="mt-3 text-sm">
          {(members ?? []).map((member) => (
            <li key={member.user_id}>{maskEmail(joinedEmail(member.profile))} · {member.access_role ?? member.role}</li>
          ))}
        </ul>
      </section>
      <section className="rounded-3xl bg-white p-5">
        <h2 className="font-display text-2xl">Entitlements</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {FEATURES.map((feature) => {
            const override = entitlements?.find((item) => item.feature === feature)
            const planDefault = PLANS[plan].features.includes(feature)
            return <li key={feature}>{feature} · Plan {planDefault ? "enabled" : "disabled"} · Override {override ? (override.enabled ? "enabled" : "disabled") : "none"} · Effective {resolved.features.has(feature) ? "enabled" : "disabled"}</li>
          })}
        </ul>
        {canEdit ? (
          <form action={saveEntitlement.bind(null, id)} className="mt-4 grid gap-2 sm:grid-cols-4">
            <select name="feature" className="h-10 rounded-lg border px-2">{[...FEATURES, ...METRICS].map((feature) => <option key={feature}>{feature}</option>)}</select>
            <select name="enabled" className="h-10 rounded-lg border px-2"><option value="true">enabled</option><option value="false">disabled</option></select>
            <input name="limit" placeholder="limite ou vide" className="h-10 rounded-lg border px-3" />
            <button className="h-10 rounded-lg bg-[#16324F] text-[#f7f4ee]" type="submit">Enregistrer</button>
          </form>
        ) : <p className="mt-3 text-sm text-[#5e6d7e]">{organization.slug === WOLOYEM_SLUG ? "Le plan internal de WOLOYEM reste inchangé." : "Permission insuffisante."}</p>}
      </section>
      <section className="rounded-3xl bg-white p-5 text-sm">
        <h2 className="font-display text-2xl">Integrations</h2>
        {(integrations ?? []).map((integration) => (
          <p key={integration.id}>{integration.provider} · {credentialState(integration.encrypted_credentials)} · {integration.status}</p>
        ))}
      </section>
      <section className="rounded-3xl bg-white p-5 text-sm">
        <h2 className="font-display text-2xl">Domains</h2>
        {(domains ?? []).map((domain) => (
          <form key={domain.id} action={checkDomain.bind(null, domain.id)} className="flex items-center justify-between gap-3 border-b py-2">
            <span>{domain.domain} · {domain.status} · {domain.verified_at ?? "non vérifié"}</span>
            <button className="underline" type="submit">Check DNS</button>
          </form>
        ))}
      </section>
      {canPlatform(admin, "platform.support.access") ? (
        <form action={openSupport.bind(null, id)} className="rounded-3xl bg-white p-5">
          <h2 className="font-display text-2xl">Support</h2>
          <textarea name="reason" required minLength={20} placeholder="Reason for access" className="mt-3 min-h-24 w-full rounded-xl border p-3" />
          <button className="mt-3 rounded-lg bg-[#16324F] px-3 py-2 text-sm text-[#f7f4ee]" type="submit">Ouvrir le support mode</button>
        </form>
      ) : null}
      {canSuspend && !suspension ? (
        <form action={suspend.bind(null, id)} className="rounded-3xl bg-white p-5">
          <h2 className="font-display text-2xl">Suspension</h2>
          <input name="reason" required minLength={8} className="mt-3 h-10 w-full rounded-lg border px-3" />
          <button className="mt-3 text-sm underline" type="submit">Suspendre</button>
        </form>
      ) : null}
      {canSuspend && suspension ? (
        <form action={unsuspend.bind(null, id)}>
          <button className="text-sm underline" type="submit">Lever la suspension</button>
        </form>
      ) : null}
    </div>
  )
}

function joinedEmail(value: unknown) {
  if (Array.isArray(value)) {
    const first = value[0]
    return first && typeof first === "object" && "email" in first && typeof first.email === "string" ? first.email : null
  }
  if (value && typeof value === "object" && "email" in value && typeof value.email === "string") return value.email
  return null
}

async function saveEntitlement(organizationId: string, formData: FormData) {
  "use server"
  const result = await updateEntitlement(organizationId, String(formData.get("feature") ?? ""), String(formData.get("enabled")) === "true", String(formData.get("limit") ?? ""))
  if (result && "error" in result && result.error) redirect(`/platform/organizations/${organizationId}?notice=${encodeURIComponent(result.error)}`)
}

async function openSupport(organizationId: string, formData: FormData) {
  "use server"
  const result = await startSupportSession(organizationId, String(formData.get("reason") ?? ""))
  if (result && "error" in result && result.error) redirect(`/platform/organizations/${organizationId}?notice=${encodeURIComponent(result.error)}`)
  redirect("/platform")
}

async function suspend(organizationId: string, formData: FormData) {
  "use server"
  const result = await suspendOrganization(organizationId, String(formData.get("reason") ?? ""))
  if (result && "error" in result && result.error) redirect(`/platform/organizations/${organizationId}?notice=${encodeURIComponent(result.error)}`)
}

async function unsuspend(organizationId: string) {
  "use server"
  const result = await unsuspendOrganization(organizationId)
  if (result && "error" in result && result.error) redirect(`/platform/organizations/${organizationId}?notice=${encodeURIComponent(result.error)}`)
}

async function checkDomain(domainId: string) {
  "use server"
  await checkPlatformDomain(domainId)
}
