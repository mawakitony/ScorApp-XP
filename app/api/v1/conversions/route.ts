import { NextResponse } from "next/server"
import { z } from "zod"
import { publishIntegrationEvent } from "@/lib/integrations/dispatch"
import { hasScope, hashApiKey, rateLimitExceeded } from "@/lib/integrations/keys"
import { matchConversionTarget } from "@/lib/integrations/resolve"
import { API_KEY_RATE_LIMIT, CONVERSION_TYPES } from "@/lib/integrations/version"
import { createAdminClient } from "@/lib/supabase/admin"

const bodySchema = z.object({
  lead_id: z.string().uuid().optional(),
  session_id: z.string().uuid().optional(),
  email: z.string().email().optional(),
  external_reference: z.string().trim().min(1).max(120).optional(),
  conversion_type: z.enum(CONVERSION_TYPES),
  conversion_value: z.number().nonnegative().max(1_000_000_000).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  comment: z.string().trim().max(500).optional(),
}).refine((body) => Boolean(body.lead_id || body.session_id || body.email || body.external_reference), {
  message: "Identifiant requis.",
}).refine((body) => (body.conversion_value === undefined) === (body.currency === undefined), {
  message: "La valeur et la devise vont ensemble.",
})

export async function POST(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (!token.startsWith("wls_live_")) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 })
  }

  const { data: key } = await admin.from("api_keys").select("id, organization_id, scopes, expires_at, revoked_at").eq("key_hash", hashApiKey(token)).maybeSingle()
  if (!key || key.revoked_at || (key.expires_at && new Date(key.expires_at).getTime() < Date.now())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!hasScope(key.scopes, "conversions:write")) return NextResponse.json({ error: "forbidden" }, { status: 403 })

  const since = new Date(Date.now() - 60_000).toISOString()
  const { count } = await admin.from("api_key_requests").select("id", { count: "exact", head: true }).eq("api_key_id", key.id).gte("created_at", since)
  if (rateLimitExceeded(count ?? 0, API_KEY_RATE_LIMIT)) return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  await admin.from("api_key_requests").insert({ api_key_id: key.id })
  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id).eq("organization_id", key.organization_id)

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 })
  const body = parsed.data

  if (body.external_reference) {
    const { data: existing } = await admin.from("conversions").select("id").eq("organization_id", key.organization_id).eq("external_reference", body.external_reference).maybeSingle()
    if (existing) return NextResponse.json({ id: existing.id, duplicate: true })
  }

  const target = await matchConversionTarget(key.organization_id, {
    leadId: body.lead_id,
    sessionId: body.session_id,
    email: body.email,
  })
  if (!target || (body.lead_id && !target.leadId) || (body.session_id && !target.sessionId) || (body.email && !target.leadId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const { data, error } = await admin.from("conversions").insert({
    organization_id: key.organization_id,
    lead_id: target.leadId,
    scorecard_id: target.scorecardId,
    session_id: target.sessionId,
    conversion_type: body.conversion_type,
    conversion_value: body.conversion_value ?? null,
    currency: body.currency ?? null,
    external_reference: body.external_reference ?? null,
    metadata: body.comment ? { comment: body.comment } : {},
  }).select("id").maybeSingle()
  if (error || !data) return NextResponse.json({ error: "rejected" }, { status: 409 })

  if (target.leadId) {
    await admin.from("lead_activities").insert({
      organization_id: key.organization_id,
      lead_id: target.leadId,
      kind: "converted",
      summary: "Conversion enregistrée",
    })
    await publishIntegrationEvent({
      organizationId: key.organization_id,
      type: "lead.converted",
      leadId: target.leadId,
      sessionId: target.sessionId,
      scorecardId: target.scorecardId,
    })
  }
  return NextResponse.json({ id: data.id }, { status: 201 })
}
