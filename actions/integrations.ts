"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { can } from "@/lib/auth/permissions"
import { getUser } from "@/lib/auth/session"
import { organizationHasFeature } from "@/lib/billing/account"
import { ensureMembership } from "@/lib/data/membership"
import { encryptSecret } from "@/lib/integrations/crypto"
import { decryptSecret } from "@/lib/integrations/crypto"
import { buildWebhookBody } from "@/lib/integrations/payload"
import { assertPublicWebhookUrl } from "@/lib/integrations/ssrf"
import { deliverWebhook } from "@/lib/integrations/webhook"
import { WEBHOOK_EVENTS } from "@/lib/integrations/version"
import { generateApiKey } from "@/lib/integrations/keys"
import { parseConditions } from "@/lib/integrations/rules"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"

const nameSchema = z.string().trim().min(2).max(80)
const selectableEvents = WEBHOOK_EVENTS.filter((event) => event !== "webhook.test")
const eventsSchema = z.array(z.string().refine((event) => selectableEvents.some((item) => item === event))).min(1)

async function editor() {
  const membership = await ensureMembership()
  const user = await getUser()
  if (!membership || !user || !can({ role: membership.role }, "integration.manage")) return { error: "Permission refusée." as const }
  const supabase = await createClient()
  return { supabase, organizationId: membership.organization.id, userId: user.id }
}

function refresh() {
  revalidatePath("/dashboard/settings/integrations")
}

function secretKey() {
  const value = process.env.INTEGRATIONS_SECRET
  if (!value || value.length < 16) return null
  return value
}

export async function saveWebhook(input: {
  id?: string
  name: string
  url: string
  events: string[]
  secret?: string
  includeResponses: boolean
}) {
  const context = await editor()
  if ("error" in context) return context
  if (!(await organizationHasFeature(context.organizationId, "webhooks"))) return { error: "Webhooks are available on Starter and above." }
  const name = nameSchema.safeParse(input.name)
  const events = eventsSchema.safeParse(input.events)
  const urlIssue = await assertPublicWebhookUrl(input.url)
  if (!name.success || !events.success || urlIssue) return { error: urlIssue ?? "Configuration invalide." }
  const key = secretKey()
  if (!key) return { error: "INTEGRATIONS_SECRET est absente." }
  const config = {
    url: input.url,
    events: events.data,
    include_responses: input.includeResponses,
    has_secret: true,
  }
  if (input.id) {
    const patch: { name: string; config: Json; encrypted_credentials?: string; updated_at: string } = {
      name: name.data,
      config,
      updated_at: new Date().toISOString(),
    }
    if (input.secret && input.secret.length >= 16) patch.encrypted_credentials = encryptSecret(input.secret, key)
    const { error } = await context.supabase.from("integrations").update(patch).eq("id", input.id).eq("organization_id", context.organizationId).eq("provider", "webhook")
    if (error) return { error: "Le webhook n'a pas pu être enregistré." }
  } else {
    if (!input.secret || input.secret.length < 16) return { error: "Le secret doit contenir au moins 16 caractères." }
    const { error } = await context.supabase.from("integrations").insert({
      organization_id: context.organizationId,
      provider: "webhook",
      name: name.data,
      status: "active",
      config,
      encrypted_credentials: encryptSecret(input.secret, key),
    })
    if (error) return { error: "Le webhook n'a pas pu être créé." }
  }
  refresh()
  return { ok: true as const }
}

export async function setWebhookStatus(id: string, status: "active" | "disabled") {
  const context = await editor()
  if ("error" in context || !z.string().uuid().safeParse(id).success) return { error: "Permission refusée." }
  const { error } = await context.supabase.from("integrations").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", context.organizationId)
  if (error) return { error: "Statut non modifié." }
  refresh()
  return { ok: true as const }
}

export async function deleteWebhook(id: string) {
  const context = await editor()
  if ("error" in context || !z.string().uuid().safeParse(id).success) return { error: "Permission refusée." }
  const { error } = await context.supabase.from("integrations").delete().eq("id", id).eq("organization_id", context.organizationId).eq("provider", "webhook")
  if (error) return { error: "Suppression impossible." }
  refresh()
  return { ok: true as const }
}

export async function sendTestWebhook(id: string) {
  const context = await editor()
  if ("error" in context || !z.string().uuid().safeParse(id).success) return { error: "Permission refusée." }
  const key = secretKey()
  if (!key) return { error: "INTEGRATIONS_SECRET est absente." }
  const admin = createAdminClient()
  const { data: integration } = await admin.from("integrations").select("id, config, encrypted_credentials, status").eq("id", id).eq("organization_id", context.organizationId).eq("provider", "webhook").maybeSingle()
  if (!integration?.encrypted_credentials) return { error: "Webhook introuvable." }
  const config = integration.config && typeof integration.config === "object" && !Array.isArray(integration.config) ? integration.config : {}
  const url = typeof config.url === "string" ? config.url : ""
  const issue = await assertPublicWebhookUrl(url)
  if (issue) return { error: issue }
  let secret = ""
  try {
    secret = decryptSecret(integration.encrypted_credentials, key)
  } catch {
    return { error: "Secret illisible." }
  }
  const eventId = `evt_${randomUUID().replaceAll("-", "")}`
  const body = buildWebhookBody({
    id: eventId,
    type: "webhook.test",
    createdAt: new Date().toISOString(),
    organizationId: context.organizationId,
  })
  const delivery = await admin.from("webhook_deliveries").insert({
    organization_id: context.organizationId,
    integration_id: integration.id,
    event_type: "webhook.test",
    event_id: eventId,
    payload: body,
    status: "processing",
    attempt: 1,
  }).select("id").maybeSingle()
  if (!delivery.data) return { error: "Journal indisponible." }
  const result = await deliverWebhook({
    url,
    secret,
    event: "webhook.test",
    deliveryId: delivery.data.id,
    rawBody: JSON.stringify(body),
    attempt: 1,
  })
  const delivered = result.httpStatus !== null && result.httpStatus >= 200 && result.httpStatus < 300
  await admin.from("webhook_deliveries").update({
    status: delivered ? "delivered" : "failed",
    http_status: result.httpStatus,
    response_excerpt: result.excerpt,
    delivered_at: delivered ? new Date().toISOString() : null,
  }).eq("id", delivery.data.id)
  refresh()
  return delivered ? { ok: true as const } : { error: "Le test n'a pas abouti." }
}

export async function retryDelivery(id: string) {
  const context = await editor()
  if ("error" in context || !z.string().uuid().safeParse(id).success) return { error: "Permission refusée." }
  const { data: delivery } = await context.supabase.from("webhook_deliveries").select("id, status, event_id, event_type").eq("id", id).eq("organization_id", context.organizationId).maybeSingle()
  if (!delivery || (delivery.status !== "failed" && delivery.status !== "dead")) return { error: "Cette livraison ne peut pas être relancée." }
  await context.supabase.from("webhook_deliveries").update({ status: "pending", next_retry_at: new Date().toISOString() }).eq("id", id).eq("organization_id", context.organizationId)
  const { error } = await context.supabase.from("integration_jobs").insert({
    organization_id: context.organizationId,
    delivery_id: id,
    kind: "webhook",
    payload: { eventId: delivery.event_id, eventType: delivery.event_type },
    status: "pending",
    next_run_at: new Date().toISOString(),
  })
  if (error) return { error: "Relance impossible." }
  refresh()
  return { ok: true as const }
}

export async function saveBrevo(input: { apiKey?: string; listId?: string; enabled: boolean; allowResultConsent: boolean }) {
  const context = await editor()
  if ("error" in context) return context
  if (!(await organizationHasFeature(context.organizationId, "brevo"))) return { error: "Brevo est disponible à partir du plan Pro." }
  const key = secretKey()
  if (!key) return { error: "INTEGRATIONS_SECRET est absente." }
  const listId = input.listId?.trim() ? Number(input.listId) : null
  if (input.listId?.trim() && !Number.isInteger(listId)) return { error: "Liste invalide." }
  const { data: existing } = await context.supabase.from("integrations").select("id").eq("organization_id", context.organizationId).eq("provider", "brevo").maybeSingle()
  const config = { list_id: listId, allow_result_consent: input.allowResultConsent, has_secret: true }
  if (!existing && (!input.apiKey || input.apiKey.length < 8)) return { error: "Clé API Brevo requise." }
  const patch: { name: string; status: "active" | "disabled"; config: Json; encrypted_credentials?: string; updated_at: string } = {
    name: "Brevo",
    status: input.enabled ? "active" : "disabled",
    config,
    updated_at: new Date().toISOString(),
  }
  if (input.apiKey && input.apiKey.length >= 8) patch.encrypted_credentials = encryptSecret(input.apiKey, key)
  const query = existing
    ? context.supabase.from("integrations").update(patch).eq("id", existing.id).eq("organization_id", context.organizationId)
    : context.supabase.from("integrations").insert({ ...patch, organization_id: context.organizationId, provider: "brevo" })
  const { error } = await query
  if (error) return { error: "Brevo n'a pas pu être enregistré." }
  refresh()
  return { ok: true as const }
}

export async function createIntegrationKey(name: string) {
  const context = await editor()
  if ("error" in context) return context
  if (!(await organizationHasFeature(context.organizationId, "api"))) return { error: "Les clés API sont disponibles à partir du plan Pro." }
  const parsed = nameSchema.safeParse(name)
  if (!parsed.success) return { error: "Nom invalide." }
  const generated = generateApiKey()
  const { error } = await context.supabase.from("api_keys").insert({
    organization_id: context.organizationId,
    name: parsed.data,
    prefix: generated.prefix,
    key_hash: generated.hash,
    scopes: ["conversions:write"],
    created_by: context.userId,
  })
  if (error) return { error: "Clé non créée." }
  refresh()
  return { ok: true as const, secret: generated.secret }
}

export async function revokeIntegrationKey(id: string) {
  const context = await editor()
  if ("error" in context || !z.string().uuid().safeParse(id).success) return { error: "Permission refusée." }
  const { error } = await context.supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("organization_id", context.organizationId)
  if (error) return { error: "Révocation impossible." }
  refresh()
  return { ok: true as const }
}

const actionTypes = ["add_tag", "change_status", "send_webhook", "send_brevo_event", "generate_report", "send_report_email", "generate_ai_analysis"] as const

export async function saveAutomation(input: {
  name: string
  trigger: string
  conditions: unknown
  actionType: string
  actionConfig: Record<string, string | number>
}) {
  const context = await editor()
  if ("error" in context) return context
  const name = nameSchema.safeParse(input.name)
  const trigger = z.string().refine((event) => selectableEvents.some((item) => item === event)).safeParse(input.trigger)
  const action = z.enum(actionTypes).safeParse(input.actionType)
  const conditions = parseConditions(input.conditions)
  if (!name.success || !trigger.success || !action.success) return { error: "Règle invalide." }
  const { error } = await context.supabase.from("automation_rules").insert({
    organization_id: context.organizationId,
    name: name.data,
    trigger: trigger.data,
    conditions,
    action_type: action.data,
    action_config: input.actionConfig,
    enabled: true,
  })
  if (error) return { error: "Règle non créée." }
  refresh()
  return { ok: true as const }
}

export async function setAutomationEnabled(id: string, enabled: boolean) {
  const context = await editor()
  if ("error" in context || !z.string().uuid().safeParse(id).success) return { error: "Permission refusée." }
  const { error } = await context.supabase.from("automation_rules").update({ enabled, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", context.organizationId)
  if (error) return { error: "Règle non modifiée." }
  refresh()
  return { ok: true as const }
}
