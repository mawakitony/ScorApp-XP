import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { applyStripeEvent, type AppliedStripeEvent, type BillingSnapshot } from "@/lib/billing/stripe-apply"
import { stripeClient, stripeWebhookSecret } from "@/lib/billing/stripe"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const stripe = stripeClient()
  const secret = stripeWebhookSecret()
  if (!stripe || !secret) return NextResponse.json({ error: "Billing information is temporarily unavailable." }, { status: 503 })
  const signature = request.headers.get("stripe-signature")
  if (!signature) return NextResponse.json({ error: "invalid" }, { status: 400 })
  const body = await request.text()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret)
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 })
  }

  const admin = createAdminClient()
  const inserted = await admin.from("stripe_events").insert({ event_id: event.id, event_type: event.type })
  if (inserted.error?.code === "23505") return NextResponse.json({ received: true })
  if (inserted.error) return NextResponse.json({ error: "retry" }, { status: 500 })

  try {
    await reconcile(admin, event)
  } catch {
    await admin.from("stripe_events").delete().eq("event_id", event.id)
    return NextResponse.json({ error: "retry" }, { status: 500 })
  }
  return NextResponse.json({ received: true })
}

async function reconcile(admin: ReturnType<typeof createAdminClient>, event: Stripe.Event) {
  const applied = toAppliedEvent(event)
  if (!applied) return
  const organizationId = await organizationForEvent(admin, applied)
  if (!organizationId) return
  const { data: row } = await admin.from("subscriptions").select("plan, status, billing_interval, cancel_at_period_end, current_period_start, current_period_end, trial_end, past_due_at, provider_customer_id, provider_subscription_id").eq("organization_id", organizationId).maybeSingle()
  const current: BillingSnapshot = {
    plan: row?.plan === "starter" || row?.plan === "pro" || row?.plan === "business" || row?.plan === "enterprise" || row?.plan === "internal" || row?.plan === "free" ? row.plan : "free",
    status: row?.status === "trialing" || row?.status === "active" || row?.status === "past_due" || row?.status === "canceled" || row?.status === "unpaid" || row?.status === "incomplete" || row?.status === "paused" ? row.status : "incomplete",
    billingInterval: row?.billing_interval === "yearly" ? "yearly" : "monthly",
    cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
    currentPeriodStart: row?.current_period_start ?? null,
    currentPeriodEnd: row?.current_period_end ?? null,
    trialEnd: row?.trial_end ?? null,
    pastDueAt: row?.past_due_at ?? null,
    customerId: row?.provider_customer_id ?? null,
    subscriptionId: row?.provider_subscription_id ?? null,
  }
  if (current.plan === "internal") return
  const next = applyStripeEvent(current, { ...applied, organizationId })
  await admin.from("subscriptions").upsert({
    organization_id: organizationId,
    provider: "stripe",
    provider_customer_id: next.customerId,
    provider_subscription_id: next.subscriptionId,
    plan: next.plan,
    billing_interval: next.billingInterval,
    status: next.status,
    current_period_start: next.currentPeriodStart,
    current_period_end: next.currentPeriodEnd,
    cancel_at_period_end: next.cancelAtPeriodEnd,
    trial_end: next.trialEnd,
    past_due_at: next.pastDueAt,
  }, { onConflict: "organization_id" })
  await admin.from("audit_logs").insert({
    organization_id: organizationId,
    action: auditAction(applied.type, current.plan, next.plan),
    metadata: { event: applied.type, plan: next.plan, status: next.status },
  })
  if (applied.type === "invoice.payment_failed") {
    await admin.from("notifications").insert({
      organization_id: organizationId,
      type: "billing",
      title: "Paiement échoué",
      message: "Le dernier paiement n'a pas abouti. Une période de grâce est en cours.",
      dedupe_key: `billing:payment_failed:${applied.id}`,
    })
    const { data: owner } = await admin.from("organization_members").select("user_id").eq("organization_id", organizationId).eq("role", "owner").limit(1).maybeSingle()
    const { data: profile } = owner ? await admin.from("profiles").select("email").eq("id", owner.user_id).maybeSingle() : { data: null }
    if (profile?.email) {
      const { enqueueEmail } = await import("@/lib/email/queue")
      const { data: organization } = await admin.from("organizations").select("name, default_language").eq("id", organizationId).maybeSingle()
      await enqueueEmail({
        organizationId,
        template: "payment_failed",
        recipient: profile.email,
        locale: organization?.default_language === "en" ? "en" : "fr",
        idempotencyKey: `payment_failed:${applied.id}`,
        payload: { organizationName: organization?.name ?? "WOLOYEM Score" },
      })
    }
  }
}

function auditAction(type: AppliedStripeEvent["type"], previous: string, next: string) {
  if (type === "invoice.payment_failed") return "payment.failed"
  if (type === "customer.subscription.deleted") return "subscription.canceled"
  if (type === "customer.subscription.created" || type === "checkout.session.completed") return "subscription.created"
  if (previous !== next) {
    const rank = ["free", "starter", "pro", "business", "enterprise"]
    return rank.indexOf(next) > rank.indexOf(previous) ? "subscription.upgraded" : "subscription.downgraded"
  }
  return "subscription.changed"
}

async function organizationForEvent(admin: ReturnType<typeof createAdminClient>, event: AppliedStripeEvent) {
  if (event.organizationId) return event.organizationId
  return null
}

function subscriptionPeriod(subscription: Stripe.Subscription) {
  const raw = subscription as Stripe.Subscription & { current_period_start?: number; current_period_end?: number }
  const start = raw.current_period_start
  const end = raw.current_period_end
  return {
    start: start ? new Date(start * 1000).toISOString() : null,
    end: end ? new Date(end * 1000).toISOString() : null,
  }
}

function toAppliedEvent(event: Stripe.Event): AppliedStripeEvent | null {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object
    return {
      id: event.id,
      type: event.type,
      organizationId: session.metadata?.organization_id || session.client_reference_id || "",
      customerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
      subscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null,
    }
  }
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object
    const priceId = subscription.items.data[0]?.price?.id ?? null
    const period = subscriptionPeriod(subscription)
    if (event.type === "customer.subscription.deleted") {
      return {
        id: event.id,
        type: event.type,
        organizationId: subscription.metadata?.organization_id || "",
        periodEnd: period.end,
      }
    }
    return {
      id: event.id,
      type: event.type,
      organizationId: subscription.metadata?.organization_id || "",
      customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null,
      subscriptionId: subscription.id,
      stripeStatus: subscription.status,
      priceId,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      periodStart: period.start,
      periodEnd: period.end,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    }
  }
  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object
    const subscription = invoice.parent?.subscription_details?.subscription
    const organizationId = invoice.parent?.subscription_details?.metadata?.organization_id || invoice.metadata?.organization_id || ""
    if (event.type === "invoice.payment_failed") {
      return { id: event.id, type: event.type, organizationId, at: new Date((invoice.created || 0) * 1000).toISOString() }
    }
    return { id: event.id, type: "invoice.paid", organizationId: organizationId || (typeof subscription === "string" ? "" : "") }
  }
  return null
}
