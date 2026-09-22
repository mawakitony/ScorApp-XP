import assert from "node:assert/strict"
import test from "node:test"
import { toCsv } from "../leads/csv.ts"
import { credentialState, stripSecrets } from "./dto.ts"
import { canPlatform, canRevokePlatformAdmin, platformGate } from "./permissions.ts"
import {
  canEditEntitlements,
  canSuspendOrganization,
  heartbeatState,
  integrationHealth,
  maskEmail,
  maskPhone,
  pageWindow,
  rangeStart,
  reasonIsValid,
  recentAuth,
  searchTarget,
  summarizeMrr,
  supportCanRead,
  supportExpiry,
  supportIsOpen,
  SUPPORT_SESSION_MS,
} from "./rules.ts"

const now = Date.parse("2026-09-22T12:00:00.000Z")

test("a user without a platform role is denied", () => {
  assert.equal(platformGate({ admin: null, permission: "platform.organizations.read" }), "denied")
  assert.equal(canPlatform(null, "platform.organizations.read"), false)
})

test("platform roles keep billing, retry and admin powers separate", () => {
  assert.equal(canPlatform({ role: "super_admin" }, "platform.admins.manage"), true)
  assert.equal(canPlatform({ role: "support" }, "platform.jobs.retry"), false)
  assert.equal(canPlatform({ role: "support" }, "platform.billing.manage"), false)
  assert.equal(canPlatform({ role: "support" }, "platform.entitlements.manage"), false)
  assert.equal(canPlatform({ role: "finance" }, "platform.jobs.retry"), false)
  assert.equal(canPlatform({ role: "operations" }, "platform.jobs.retry"), true)
  assert.equal(canPlatform({ role: "operations" }, "platform.billing.manage"), false)
  assert.equal(platformGate({ admin: { role: "support" }, permission: "platform.support.access" }), "allowed")
})

test("support sessions require a reason and expire", () => {
  assert.equal(reasonIsValid("short"), false)
  assert.equal(reasonIsValid("Customer reported an issue publishing scorecard"), true)
  const expires = Date.parse(supportExpiry(now))
  assert.equal(expires - now, SUPPORT_SESSION_MS)
  assert.equal(supportIsOpen({ status: "active", expiresAt: new Date(now + 1000).toISOString(), now }), true)
  assert.equal(supportIsOpen({ status: "active", expiresAt: new Date(now - 1000).toISOString(), now }), false)
  assert.equal(supportIsOpen({ status: "ended", expiresAt: new Date(now + 1000).toISOString(), now }), false)
})

test("a support session cannot read another organization", () => {
  assert.equal(supportCanRead({ open: true, sessionOrgId: "org-a", requestedOrgId: "org-a" }), true)
  assert.equal(supportCanRead({ open: true, sessionOrgId: "org-a", requestedOrgId: "org-b" }), false)
  assert.equal(supportCanRead({ open: false, sessionOrgId: "org-a", requestedOrgId: "org-a" }), false)
})

test("WOLOYEM cannot be suspended or have entitlements rewritten", () => {
  assert.equal(canSuspendOrganization({ slug: "woloyem", allowed: true }), false)
  assert.equal(canEditEntitlements({ slug: "woloyem", allowed: true }), false)
  assert.equal(canSuspendOrganization({ slug: "acme", allowed: true }), true)
  assert.equal(canSuspendOrganization({ slug: "acme", allowed: false }), false)
})

test("MRR keeps currencies apart and ignores internal and trials", () => {
  const rows = summarizeMrr([
    { currency: "eur", amountCents: 2900, interval: "monthly", plan: "pro", status: "active" },
    { currency: "usd", amountCents: 12000, interval: "yearly", plan: "business", status: "active" },
    { currency: "eur", amountCents: 4900, interval: "monthly", plan: "internal", status: "active" },
    { currency: "eur", amountCents: 1900, interval: "monthly", plan: "starter", status: "trialing" },
    { currency: "xof", amountCents: null, interval: "monthly", plan: "enterprise", status: "active" },
  ])
  const eur = rows.find((row) => row.currency === "EUR")
  const usd = rows.find((row) => row.currency === "USD")
  const xof = rows.find((row) => row.currency === "XOF")
  assert.equal(eur?.mrrCents, 2900)
  assert.equal(eur?.arrCents, 2900 * 12)
  assert.equal(usd?.mrrCents, 1000)
  assert.equal(xof?.mrrCents, null)
  assert.equal(xof?.arrCents, null)
})

test("missing prices stay unavailable instead of a guessed plan price", () => {
  assert.deepEqual(summarizeMrr([]), [])
})

test("heartbeats go stale after the shared threshold", () => {
  assert.equal(heartbeatState(null, now), "unavailable")
  assert.equal(heartbeatState(new Date(now - 60_000).toISOString(), now), "healthy")
  assert.equal(heartbeatState(new Date(now - 16 * 60_000).toISOString(), now), "degraded")
})

test("organization search and pagination stay on the server window", () => {
  assert.equal(searchTarget("acme"), "organization")
  assert.equal(searchTarget("cus_123"), "stripe")
  assert.equal(searchTarget("sub_123"), "stripe")
  assert.equal(searchTarget("score.acme.com"), "domain")
  assert.deepEqual(pageWindow(2, 25), { from: 25, to: 49, page: 2 })
  assert.equal(pageWindow(Number.NaN, 25).page, 1)
})

test("personal data stays masked and secrets never leave the DTO", () => {
  assert.equal(maskEmail("tony@company.com"), "t***@company.com")
  assert.equal(maskPhone("+22890123412"), "+228 ** ** 12")
  const safe = stripSecrets({ provider: "brevo", encrypted_credentials: "cipher", secret_hash: "h", token_hash: "t", key_hash: "k", note: "sk_live_secret" })
  assert.equal("encrypted_credentials" in safe, false)
  assert.equal("secret_hash" in safe, false)
  assert.equal("token_hash" in safe, false)
  assert.equal("key_hash" in safe, false)
  assert.equal("note" in safe, false)
  assert.equal(credentialState("cipher"), "configured")
  assert.equal(credentialState(null), "not_configured")
  assert.equal(credentialState("cipher", "2026-09-22"), "revoked")
  assert.equal(JSON.stringify(safe).includes("cipher"), false)
})

test("csv exports neutralize formula injection", () => {
  const csv = toCsv(["name"], [["=cmd"], ["+1"], ["-1"], ["@sum"]])
  assert.match(csv, /'=cmd/)
  assert.match(csv, /'\+1/)
  assert.match(csv, /'-1/)
  assert.match(csv, /'@sum/)
})

test("recent authentication is required and the last super admin stays", () => {
  assert.equal(recentAuth(null, now), false)
  assert.equal(recentAuth(new Date(now - 60_000).toISOString(), now), true)
  assert.equal(recentAuth(new Date(now - 31 * 60_000).toISOString(), now), false)
  assert.equal(canRevokePlatformAdmin({ actorId: "a", targetId: "a", targetRole: "support", superAdminCount: 2 }), false)
  assert.equal(canRevokePlatformAdmin({ actorId: "a", targetId: "b", targetRole: "super_admin", superAdminCount: 1 }), false)
  assert.equal(canRevokePlatformAdmin({ actorId: "a", targetId: "b", targetRole: "support", superAdminCount: 1 }), true)
})

test("integration incidents use a fixed failure rule", () => {
  assert.equal(integrationHealth({ failures24h: 4, dead: false }), "healthy")
  assert.equal(integrationHealth({ failures24h: 5, dead: false }), "degraded")
  assert.equal(integrationHealth({ failures24h: 0, dead: true }), "degraded")
})

test("operational ranges stay in UTC offsets", () => {
  assert.equal(Date.parse(rangeStart("7", now)), now - 7 * 24 * 60 * 60 * 1000)
  assert.equal(Date.parse(rangeStart("today", now)), now - 24 * 60 * 60 * 1000)
})
