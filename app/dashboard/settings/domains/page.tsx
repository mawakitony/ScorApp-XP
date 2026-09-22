import { addDomain, removeDomain, verifyDomain } from "@/actions/organization"
import { can } from "@/lib/auth/permissions"
import { loadEntitlements } from "@/lib/billing/account"
import { hasFeature } from "@/lib/billing/entitlements"
import { activeDomainProvider } from "@/lib/domains/provider"
import { requireUser } from "@/lib/auth/session"
import { ensureMembership } from "@/lib/data/membership"
import { createAdminClient } from "@/lib/supabase/admin"

export const metadata = { title: "Domaines" }

export default async function DomainsPage() {
  await requireUser()
  const membership = await ensureMembership()
  if (!membership || !can({ role: membership.role }, "team.manage")) return <p>Permission refusée.</p>
  const entitlements = await loadEntitlements(membership.organization.id)
  const allowed = hasFeature(entitlements, "custom_domain")
  const provider = activeDomainProvider()
  let domains: { id: string; domain: string; status: string; verification_token: string }[] = []
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("custom_domains").select("id, domain, status, verification_token").eq("organization_id", membership.organization.id)
    domains = data ?? []
  } catch {
    domains = []
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-4xl">Domaines</h1>
      <p className="text-sm text-muted-foreground">Les adresses `/s/[slug]` restent disponibles. Un domaine vérifié sert la scorecard sur l&apos;hôte du client, sans redirection.</p>
      {process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID ? <p className="text-sm">SSL provisioning est géré par Vercel.</p> : <p className="text-sm">Vercel domain automation is not configured.</p>}
      {allowed ? (
        <form action={async (formData) => { await addDomain(formData) }} className="flex flex-wrap gap-2">
          <input name="domain" placeholder="score.client.com" className="h-11 rounded-xl border px-3" />
          <input name="default_slug" placeholder="slug par défaut" className="h-11 rounded-xl border px-3" />
          <button className="h-11 rounded-xl bg-[#16324F] px-4 text-sm text-[#f7f4ee]" type="submit">Ajouter</button>
        </form>
      ) : <p className="text-sm">Les domaines personnalisés sont disponibles à partir du plan Business. <a className="underline" href="/dashboard/settings/billing">Upgrade plan</a></p>}
      <ul className="space-y-4">
        {domains.map((domain) => {
          const instructions = provider.instructions(domain.domain, domain.verification_token)
          return (
            <li key={domain.id} className="rounded-3xl border bg-card p-5 text-sm">
              <p className="font-medium">{domain.domain} · {domain.status}</p>
              <p className="mt-2 font-mono text-xs">{instructions.record} {instructions.host} {instructions.value}</p>
              <div className="mt-3 flex gap-4">
                <form action={async () => { await verifyDomain(domain.id) }}>
                  <button className="underline" type="submit">Vérifier</button>
                </form>
                <form action={async () => { await removeDomain(domain.id) }}>
                  <button className="underline" type="submit">Retirer</button>
                </form>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
