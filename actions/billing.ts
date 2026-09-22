"use server"

import { can } from "@/lib/auth/permissions"
import { getUser } from "@/lib/auth/session"
import { loadEntitlements } from "@/lib/billing/account"
import { PLANS, stripePriceId, type BillingInterval, type PlanId } from "@/lib/billing/plans"
import { stripeClient } from "@/lib/billing/stripe"
import { ensureMembership } from "@/lib/data/membership"
import { getAppUrl } from "@/lib/env"
import { createAdminClient } from "@/lib/supabase/admin"

async function billingOwner() {
  const membership = await ensureMembership()
  const user = await getUser()
  if (!membership || !user || !can({ role: membership.role }, "billing.manage")) return { error: "Permission refusée." as const }
  return { membership, user }
}

export async function startCheckout(plan: PlanId, interval: BillingInterval) {
  const context = await billingOwner()
  if ("error" in context) return context
  if (!PLANS[plan]?.selfServe) return { error: "Ce plan ne se souscrit pas en ligne." }
  const price = stripePriceId(plan, interval)
  const stripe = stripeClient()
  if (!price || !stripe) return { error: "Billing information is temporarily unavailable." }
  const entitlements = await loadEntitlements(context.membership.organization.id)
  if (entitlements.plan === "internal") return { error: "Cette organisation n'utilise pas Stripe." }

  const admin = createAdminClient()
  const { data: subscription } = await admin.from("subscriptions").select("provider_customer_id").eq("organization_id", context.membership.organization.id).maybeSingle()
  let customerId = subscription?.provider_customer_id ?? null
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: context.user.email ?? undefined,
      metadata: { organization_id: context.membership.organization.id },
    })
    customerId = customer.id
    await admin.from("subscriptions").update({ provider_customer_id: customerId }).eq("organization_id", context.membership.organization.id)
  }
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: context.membership.organization.id,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${getAppUrl()}/dashboard/settings/billing?checkout=return`,
    cancel_url: `${getAppUrl()}/dashboard/settings/billing?checkout=cancel`,
    metadata: { organization_id: context.membership.organization.id },
    subscription_data: { metadata: { organization_id: context.membership.organization.id } },
    ...(process.env.STRIPE_TAX_ENABLED === "true" ? { automatic_tax: { enabled: true } } : {}),
  })
  if (!session.url) return { error: "Billing information is temporarily unavailable." }
  return { url: session.url }
}

export async function openBillingPortal() {
  const context = await billingOwner()
  if ("error" in context) return context
  const stripe = stripeClient()
  if (!stripe) return { error: "Billing information is temporarily unavailable." }
  const admin = createAdminClient()
  const { data } = await admin.from("subscriptions").select("provider_customer_id").eq("organization_id", context.membership.organization.id).maybeSingle()
  if (!data?.provider_customer_id) return { error: "Aucun client Stripe n'est associé." }
  const portal = await stripe.billingPortal.sessions.create({
    customer: data.provider_customer_id,
    return_url: `${getAppUrl()}/dashboard/settings/billing`,
  })
  return { url: portal.url }
}
