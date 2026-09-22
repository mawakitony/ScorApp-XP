import { planFromPriceId, type BillingInterval, type PlanId } from "./plans"
import type { SubscriptionStatus } from "./entitlements"

export type BillingSnapshot = {
  plan: PlanId
  status: SubscriptionStatus
  billingInterval: BillingInterval
  cancelAtPeriodEnd: boolean
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  trialEnd: string | null
  pastDueAt: string | null
  customerId: string | null
  subscriptionId: string | null
}

export type AppliedStripeEvent =
  | { id: string; type: "checkout.session.completed"; organizationId: string; customerId: string | null; subscriptionId: string | null }
  | {
      id: string
      type: "customer.subscription.created" | "customer.subscription.updated"
      organizationId: string
      customerId: string | null
      subscriptionId: string
      stripeStatus: string
      priceId: string | null
      cancelAtPeriodEnd: boolean
      periodStart: string | null
      periodEnd: string | null
      trialEnd: string | null
    }
  | { id: string; type: "customer.subscription.deleted"; organizationId: string; periodEnd: string | null }
  | { id: string; type: "invoice.paid"; organizationId: string }
  | { id: string; type: "invoice.payment_failed"; organizationId: string; at: string }

const STRIPE_STATUS: Record<string, SubscriptionStatus> = {
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  canceled: "canceled",
  unpaid: "unpaid",
  incomplete: "incomplete",
  incomplete_expired: "incomplete",
  paused: "paused",
}

export function rememberStripeEvent(seen: ReadonlySet<string>, eventId: string) {
  if (seen.has(eventId)) return { duplicate: true as const, seen }
  const next = new Set(seen)
  next.add(eventId)
  return { duplicate: false as const, seen: next }
}

export function applyStripeEvent(current: BillingSnapshot, event: AppliedStripeEvent): BillingSnapshot {
  if (event.type === "checkout.session.completed") {
    return {
      ...current,
      customerId: event.customerId ?? current.customerId,
      subscriptionId: event.subscriptionId ?? current.subscriptionId,
    }
  }
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    const mapped = planFromPriceId(event.priceId)
    const status = STRIPE_STATUS[event.stripeStatus] ?? current.status
    return {
      ...current,
      plan: mapped?.plan ?? current.plan,
      billingInterval: mapped?.interval ?? current.billingInterval,
      status,
      cancelAtPeriodEnd: event.cancelAtPeriodEnd,
      currentPeriodStart: event.periodStart,
      currentPeriodEnd: event.periodEnd,
      trialEnd: event.trialEnd,
      customerId: event.customerId ?? current.customerId,
      subscriptionId: event.subscriptionId,
      pastDueAt: status === "past_due" ? current.pastDueAt : null,
    }
  }
  if (event.type === "customer.subscription.deleted") {
    return { ...current, status: "canceled", cancelAtPeriodEnd: true, currentPeriodEnd: event.periodEnd ?? current.currentPeriodEnd }
  }
  if (event.type === "invoice.paid") {
    if (current.status === "past_due" || current.status === "unpaid" || current.status === "incomplete") {
      return { ...current, status: "active", pastDueAt: null }
    }
    return current
  }
  if (event.type === "invoice.payment_failed") {
    return { ...current, status: "past_due", pastDueAt: current.pastDueAt ?? event.at }
  }
  return current
}
