import Link from "next/link"
import { IntegrationsPanel } from "@/components/integrations/integrations-panel"
import { canEdit, requireUser } from "@/lib/auth/session"
import { ensureMembership } from "@/lib/data/membership"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"

export const dynamic = "force-dynamic"
export const metadata = { title: "Intégrations" }

function record(value: Json) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value
}

export default async function IntegrationsPage() {
  await requireUser()
  const membership = await ensureMembership()
  if (!membership) return null
  const supabase = await createClient()
  const [integrations, deliveries, rules, keys] = await Promise.all([
    supabase.from("integrations").select("id, provider, name, status, config").eq("organization_id", membership.organization.id).order("created_at", { ascending: false }),
    supabase.from("webhook_deliveries").select("id, integration_id, event_type, status, attempt, http_status, response_excerpt, created_at").eq("organization_id", membership.organization.id).order("created_at", { ascending: false }).limit(30),
    supabase.from("automation_rules").select("id, name, trigger, enabled, action_type").eq("organization_id", membership.organization.id).order("created_at", { ascending: false }),
    supabase.from("api_keys").select("id, name, prefix, revoked_at, last_used_at").eq("organization_id", membership.organization.id).order("created_at", { ascending: false }),
  ])
  const missing = integrations.error ?? deliveries.error ?? rules.error ?? keys.error

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/dashboard/settings" className="text-sm text-muted-foreground">Settings</Link>
        <h1 className="font-display text-4xl">Intégrations</h1>
      </div>
      {missing ? (
        <p className="rounded-2xl border bg-card px-5 py-4 text-sm">La migration des intégrations n&apos;est pas encore appliquée.</p>
      ) : (
        <IntegrationsPanel
          canEdit={canEdit(membership.role)}
          webhooks={(integrations.data ?? []).filter((item) => item.provider === "webhook").map((item) => {
            const config = record(item.config)
            return {
              id: item.id,
              name: item.name,
              status: item.status,
              url: typeof config.url === "string" ? config.url : "",
              events: Array.isArray(config.events) ? config.events.filter((event): event is string => typeof event === "string") : [],
              includeResponses: config.include_responses === true,
            }
          })}
          deliveries={(deliveries.data ?? []).map((item) => ({
            id: item.id,
            integration: (integrations.data ?? []).find((integration) => integration.id === item.integration_id)?.name ?? "Webhook",
            event: item.event_type,
            status: item.status,
            attempt: item.attempt,
            httpStatus: item.http_status,
            excerpt: item.response_excerpt,
            createdAt: item.created_at,
          }))}
          rules={(rules.data ?? []).map((rule) => ({ id: rule.id, name: rule.name, trigger: rule.trigger, enabled: rule.enabled, action: rule.action_type }))}
          keys={(keys.data ?? []).map((key) => ({ id: key.id, name: key.name, prefix: key.prefix, revoked: Boolean(key.revoked_at), lastUsed: key.last_used_at }))}
          brevoEnabled={(integrations.data ?? []).some((item) => item.provider === "brevo" && item.status === "active")}
          brevoList={String(record((integrations.data ?? []).find((item) => item.provider === "brevo")?.config ?? {}).list_id ?? "")}
          brevoConsent={record((integrations.data ?? []).find((item) => item.provider === "brevo")?.config ?? {}).allow_result_consent === true}
        />
      )}
    </div>
  )
}
