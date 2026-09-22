import assert from "node:assert/strict"
import test from "node:test"
import Stripe from "stripe"
import { can, canRemoveMember, rolesAfterTransfer } from "../auth/permissions.ts"
import { createInviteToken, hashInviteToken, invitationIsActive } from "../auth/invitations.ts"
import { resolvePublicBrand } from "./brand.ts"
import { normalizeDomain, resolveTenantFromHost } from "./domains.ts"
import { getOrganizationAccessState, hasFeature, resolveEntitlements, withinLimit } from "./entitlements.ts"
import { PLANS, planFromPriceId } from "./plans.ts"
import { applyStripeEvent, rememberStripeEvent, type BillingSnapshot } from "./stripe-apply.ts"
import { monthPeriod, quotaAllows, usageLevel } from "./usage.ts"

const now = Date.parse("2026-09-22T00:00:00.000Z")
const base: BillingSnapshot = {
  plan: "starter",
  status: "active",
  billingInterval: "monthly",
  cancelAtPeriodEnd: false,
  currentPeriodStart: "2026-09-01T00:00:00.000Z",
  currentPeriodEnd: "2026-10-01T00:00:00.000Z",
  trialEnd: null,
  pastDueAt: null,
  customerId: "cus_1",
  subscriptionId: "sub_1",
}

test("entitlements come from features, with enterprise overrides", () => {
  const free = resolveEntitlements({ plan: "free", status: "active", trialEnd: null, currentPeriodEnd: null, pastDueAt: null, cancelAtPeriodEnd: false })
  assert.equal(hasFeature(free, "ai"), false)
  assert.equal(hasFeature(free, "webhooks"), false)
  const internal = resolveEntitlements({ plan: "internal", status: "active", trialEnd: null, currentPeriodEnd: null, pastDueAt: null, cancelAtPeriodEnd: false })
  assert.equal(hasFeature(internal, "custom_domain"), true)
  assert.equal(internal.limits.scorecards, null)
  const overridden = resolveEntitlements({
    plan: "free",
    status: "active",
    trialEnd: null,
    currentPeriodEnd: null,
    pastDueAt: null,
    cancelAtPeriodEnd: false,
    overrides: [{ feature: "ai", enabled: true }],
  })
  assert.equal(hasFeature(overridden, "ai"), true)
  assert.equal(PLANS.internal.public, false)
})

test("quotas allow under the limit and block at the limit", () => {
  assert.equal(quotaAllows(4, 5), true)
  assert.equal(quotaAllows(5, 5), false)
  assert.equal(quotaAllows(20, null), true)
  assert.equal(usageLevel(800, 1000), "warn80")
  assert.equal(usageLevel(900, 1000), "warn90")
  assert.equal(usageLevel(1000, 1000), "full")
  const starter = resolveEntitlements({ plan: "starter", status: "active", trialEnd: null, currentPeriodEnd: null, pastDueAt: null, cancelAtPeriodEnd: false })
  assert.equal(withinLimit(starter, "scorecards", 4), true)
  assert.equal(withinLimit(starter, "scorecards", 5), false)
  assert.equal(withinLimit(starter, "team_members", 3), false)
})

test("monthly periods stay distinct and are not deleted", () => {
  const september = monthPeriod(new Date("2026-09-22T12:00:00.000Z"))
  const october = monthPeriod(new Date("2026-10-01T00:00:00.000Z"))
  assert.equal(september.start, "2026-09-01")
  assert.notEqual(september.start, october.start)
})

test("stripe events are idempotent and an invalid signature is rejected", () => {
  const first = rememberStripeEvent(new Set(), "evt_1")
  const second = rememberStripeEvent(first.seen, "evt_1")
  assert.equal(first.duplicate, false)
  assert.equal(second.duplicate, true)
  const stripe = new Stripe("sk_test_placeholder")
  const payload = JSON.stringify({ id: "evt_test", object: "event" })
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_test" })
  assert.throws(() => stripe.webhooks.constructEvent(payload, header, "whsec_other"))
})

test("upgrade, downgrade, cancel and past due follow the webhook", () => {
  process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro"
  process.env.STRIPE_PRICE_STARTER_MONTHLY = "price_starter"
  const upgraded = applyStripeEvent(base, {
    id: "evt_up",
    type: "customer.subscription.updated",
    organizationId: "org",
    customerId: "cus_1",
    subscriptionId: "sub_1",
    stripeStatus: "active",
    priceId: "price_pro",
    cancelAtPeriodEnd: false,
    periodStart: base.currentPeriodStart,
    periodEnd: base.currentPeriodEnd,
    trialEnd: null,
  })
  assert.equal(upgraded.plan, "pro")
  assert.equal(planFromPriceId("price_pro")?.plan, "pro")
  const downgraded = applyStripeEvent(upgraded, { ...upgraded, id: "evt_down", type: "customer.subscription.updated", organizationId: "org", customerId: "cus_1", subscriptionId: "sub_1", stripeStatus: "active", priceId: "price_starter", cancelAtPeriodEnd: false, periodStart: base.currentPeriodStart, periodEnd: base.currentPeriodEnd, trialEnd: null })
  assert.equal(downgraded.plan, "starter")
  const canceled = applyStripeEvent(downgraded, { id: "evt_cancel", type: "customer.subscription.deleted", organizationId: "org", periodEnd: "2026-10-01T00:00:00.000Z" })
  assert.equal(canceled.status, "canceled")
  const stillActive = getOrganizationAccessState({ plan: canceled.plan, status: canceled.status, trialEnd: null, currentPeriodEnd: canceled.currentPeriodEnd, pastDueAt: null, cancelAtPeriodEnd: true }, now)
  assert.equal(stillActive.access, "active")
  const afterPeriod = getOrganizationAccessState({ plan: "pro", status: "canceled", trialEnd: null, currentPeriodEnd: "2026-09-01T00:00:00.000Z", pastDueAt: null, cancelAtPeriodEnd: true }, now)
  assert.equal(afterPeriod.plan, "free")
  const grace = getOrganizationAccessState({ plan: "pro", status: "past_due", trialEnd: null, currentPeriodEnd: null, pastDueAt: "2026-09-20T00:00:00.000Z", cancelAtPeriodEnd: false }, now)
  assert.equal(grace.access, "grace_period")
  const restricted = getOrganizationAccessState({ plan: "pro", status: "past_due", trialEnd: null, currentPeriodEnd: null, pastDueAt: "2026-09-01T00:00:00.000Z", cancelAtPeriodEnd: false }, now)
  assert.equal(restricted.access, "restricted")
  assert.equal(restricted.plan, "free")
})

test("an expired trial falls back without deleting the plan history flag", () => {
  const trialing = getOrganizationAccessState({ plan: "starter", status: "trialing", trialEnd: "2026-09-30T00:00:00.000Z", currentPeriodEnd: null, pastDueAt: null, cancelAtPeriodEnd: false }, now)
  assert.equal(trialing.access, "active")
  const expired = getOrganizationAccessState({ plan: "starter", status: "trialing", trialEnd: "2026-09-01T00:00:00.000Z", currentPeriodEnd: null, pastDueAt: null, cancelAtPeriodEnd: false }, now)
  assert.equal(expired.plan, "free")
  assert.equal(expired.access, "restricted")
})

test("roles, invitations and the last owner are protected", () => {
  assert.equal(can({ role: "editor" }, "scorecard.edit"), true)
  assert.equal(can({ role: "editor" }, "billing.manage"), false)
  assert.equal(can({ role: "analyst" }, "lead.export"), true)
  assert.equal(can({ role: "viewer" }, "lead.export"), false)
  assert.equal(can({ role: "admin" }, "ownership.transfer"), false)
  assert.equal(can({ role: "owner" }, "billing.manage"), true)
  assert.equal(can({ role: "member" }, "scorecard.edit"), false)
  assert.equal(canRemoveMember({ callerRole: "owner", targetRole: "owner", ownerCount: 1 }), false)
  assert.equal(canRemoveMember({ callerRole: "admin", targetRole: "editor", ownerCount: 1 }), true)
  assert.deepEqual(rolesAfterTransfer({ callerId: "a", targetId: "b", callerRole: "owner" }), { b: "owner", a: "admin" })
  assert.equal(rolesAfterTransfer({ callerId: "a", targetId: "b", callerRole: "admin" }), null)
  const invite = createInviteToken()
  assert.equal(invite.hash, hashInviteToken(invite.token))
  assert.equal(invitationIsActive({ acceptedAt: null, expiresAt: "2026-09-23T00:00:00.000Z", now }), true)
  assert.equal(invitationIsActive({ acceptedAt: null, expiresAt: "2026-09-21T00:00:00.000Z", now }), false)
  assert.equal(invitationIsActive({ acceptedAt: "2026-09-22T00:00:00.000Z", expiresAt: "2026-09-23T00:00:00.000Z", now }), false)
})

test("custom domains reject unsafe hosts and foreign tenants", () => {
  assert.equal(normalizeDomain("HTTPS://Score.Client.com/path"), null)
  assert.equal(normalizeDomain("localhost"), null)
  assert.equal(normalizeDomain("127.0.0.1"), null)
  assert.equal(normalizeDomain("10.0.0.8"), null)
  assert.equal(normalizeDomain("score.client.com"), "score.client.com")
  const domains = [{ domain: "score.client.com", organizationId: "org-a", status: "verified" as const }]
  assert.equal(resolveTenantFromHost("score.client.com", domains).kind, "custom")
  assert.equal(resolveTenantFromHost("score.client.com", [{ ...domains[0], status: "pending" }]).kind, "unverified")
  assert.equal(resolveTenantFromHost("score.woloyem.com", domains).kind, "default")
  const resolved = resolveTenantFromHost("score.client.com", domains)
  assert.equal(resolved.kind === "custom" && resolved.organizationId === "org-b", false)
  const brand = resolvePublicBrand({
    entitlements: resolveEntitlements({ plan: "free", status: "active", trialEnd: null, currentPeriodEnd: null, pastDueAt: null, cancelAtPeriodEnd: false }),
    organization: { name: "Acme", logoUrl: "https://cdn/logo.png", primaryColor: "#000000", secondaryColor: "#111111" },
    scorecard: { logoUrl: "https://cdn/card.png", primaryColor: "#222222", secondaryColor: "#333333" },
  })
  assert.equal(brand.poweredBy, true)
  assert.equal(brand.logoUrl, "")
})
