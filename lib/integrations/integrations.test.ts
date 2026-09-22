import assert from "node:assert/strict"
import test from "node:test"
import { brevoContact, hotLeadKey } from "./brevo.ts"
import { valuesByCurrency, sameTenant } from "./conversion.ts"
import { decryptSecret, encryptSecret } from "./crypto.ts"
import { generateApiKey, hasScope, hashApiKey, rateLimitExceeded } from "./keys.ts"
import { buildWebhookBody, payloadIssue } from "./payload.ts"
import { retryPlan, shouldRetry } from "./retry.ts"
import { automationRunKey, conditionsMatch, type AutomationContext } from "./rules.ts"
import { signWebhook, timestampIsFresh, webhookSignatureHeader } from "./signature.ts"
import { webhookUrlIssue } from "./ssrf.ts"
import { deliverWebhook } from "./webhook.ts"

const context: AutomationContext = {
  score: 80,
  country: "CI",
  status: "qualified",
  temperature: "hot",
  scorecardId: "scorecard-1",
  result: "Pret",
  ctaClicked: true,
  tags: ["PMP"],
}

test("webhook signature uses timestamp and raw body", () => {
  const body = JSON.stringify({ id: "evt_1" })
  const header = webhookSignatureHeader("secret-value", "1700000000", body)
  assert.equal(header, `v1=${signWebhook("secret-value", "1700000000", body)}`)
  assert.notEqual(signWebhook("secret-value", "1700000000", body), signWebhook("secret-value", "1700000001", body))
})

test("invalid signature does not match", () => {
  assert.notEqual(signWebhook("secret-value", "1700000000", "{}"), signWebhook("other-secret", "1700000000", "{}"))
})

test("timestamp window is five minutes", () => {
  assert.equal(timestampIsFresh("1700000000", 1700000200), true)
  assert.equal(timestampIsFresh("1700000000", 1700000401), false)
})

test("webhook retries timeout, 408, 429 and 500, not a plain 400", () => {
  assert.equal(shouldRetry({ httpStatus: null, networkError: true }), true)
  assert.equal(retryPlan(1, { httpStatus: 400, networkError: false }).status, "failed")
  assert.equal(retryPlan(1, { httpStatus: 408, networkError: false }).status, "pending")
  assert.equal(retryPlan(1, { httpStatus: 429, networkError: false }).delayMs, 60_000)
  assert.equal(retryPlan(2, { httpStatus: 500, networkError: false }).delayMs, 5 * 60_000)
})

test("dead status follows the last backoff", () => {
  assert.equal(retryPlan(6, { httpStatus: 500, networkError: false }).delayMs, 24 * 60 * 60_000)
  assert.equal(retryPlan(7, { httpStatus: 500, networkError: false }).status, "dead")
})

test("delivery sends the signature and does not follow redirects", async () => {
  let seen: RequestInit | undefined
  const result = await deliverWebhook({
    url: "https://example.com/hook",
    secret: "secret-value",
    event: "webhook.test",
    deliveryId: "del_1",
    rawBody: "{}",
    attempt: 1,
    nowSeconds: 1700000000,
    fetchImpl: async (_url, init) => {
      seen = init
      return new Response("ok", { status: 200 })
    },
  })
  assert.equal(result.status, "delivered")
  assert.equal(result.httpStatus, 200)
  assert.equal(seen?.redirect, "manual")
  const headers = seen?.headers as Record<string, string>
  assert.equal(headers["X-Woloyem-Signature"], webhookSignatureHeader("secret-value", "1700000000", "{}"))
})

test("ssrf rejects localhost and private addresses", () => {
  assert.ok(webhookUrlIssue("http://localhost/hook", { production: false }))
  assert.ok(webhookUrlIssue("http://127.0.0.1/hook", { production: false }))
  assert.ok(webhookUrlIssue("http://10.1.1.1/hook", { production: false }))
  assert.ok(webhookUrlIssue("http://[::1]/hook", { production: false }))
  assert.ok(webhookUrlIssue("https://hooks.example.com/woloyem", { production: true, addresses: ["192.168.0.8"] }))
  assert.equal(webhookUrlIssue("https://hooks.example.com/woloyem", { production: true, addresses: ["8.8.8.8"] }), null)
  assert.ok(webhookUrlIssue("http://hooks.example.com/woloyem", { production: true }))
})

test("automation conditions are combined with AND", () => {
  assert.equal(conditionsMatch([{ field: "score", op: "gte", value: 75 }], context), true)
  assert.equal(conditionsMatch([{ field: "score", op: "gte", value: 75 }, { field: "country", op: "eq", value: "ci" }], context), true)
  assert.equal(conditionsMatch([{ field: "score", op: "gte", value: 90 }, { field: "country", op: "eq", value: "CI" }], context), false)
  assert.equal(conditionsMatch([{ field: "status", op: "eq", value: "qualified" }, { field: "tag", op: "eq", value: "PMP" }], context), true)
  assert.equal(conditionsMatch([{ field: "cta_clicked", op: "eq", value: true }], context), true)
})

test("automation run key is stable for the same event", () => {
  assert.equal(automationRunKey("rule-1", "evt_1"), automationRunKey("rule-1", "evt_1"))
  assert.notEqual(automationRunKey("rule-1", "evt_1"), automationRunKey("rule-1", "evt_2"))
})

test("brevo mapping skips a missing email and keeps attributes", () => {
  const skipped = brevoContact({ ...emptyLead, email: null, thirdPartyConsent: true }, { allowResultConsent: false })
  assert.equal("skipped" in skipped && skipped.skipped, "missing_email")
  const mapped = brevoContact({ ...emptyLead, email: "ada@example.com", firstName: "Ada", score: 81, thirdPartyConsent: true }, { allowResultConsent: false })
  assert.equal("email" in mapped && mapped.email, "ada@example.com")
  if ("attributes" in mapped) assert.equal(mapped.attributes.WOLOYEM_SCORE, 81)
  const noConsent = brevoContact({ ...emptyLead, email: "ada@example.com", thirdPartyConsent: false }, { allowResultConsent: false })
  assert.equal("skipped" in noConsent && noConsent.skipped, "missing_consent")
})

test("api keys are hashed, scoped and rate limited", () => {
  const key = generateApiKey()
  assert.equal(key.secret.startsWith("wls_live_"), true)
  assert.notEqual(key.hash, key.secret)
  assert.equal(key.hash, hashApiKey(key.secret))
  assert.equal(key.prefix, key.secret.slice(0, 16))
  assert.equal(hasScope(["conversions:write"], "conversions:write"), true)
  assert.equal(hasScope(["leads:read"], "conversions:write"), false)
  assert.equal(rateLimitExceeded(100), true)
  assert.equal(rateLimitExceeded(99), false)
})

test("conversion matching stays inside the organization and separates currencies", () => {
  assert.equal(sameTenant("org-a", "org-b"), false)
  assert.equal(sameTenant("org-a", "org-a"), true)
  const values = valuesByCurrency([
    { currency: "xof", value: 100 },
    { currency: "EUR", value: 20 },
    { currency: "XOF", value: 50 },
  ])
  assert.deepEqual(values, [
    { currency: "XOF", total: 150 },
    { currency: "EUR", total: 20 },
  ])
})

test("hot lead notification key is stable", () => {
  assert.equal(hotLeadKey("lead-1"), "hot:lead-1")
  assert.equal(hotLeadKey("lead-1"), hotLeadKey("lead-1"))
})

test("credentials round-trip without storing the plaintext", () => {
  const packed = encryptSecret("brevo-key", "integrations-secret-value")
  assert.equal(packed.includes("brevo-key"), false)
  assert.equal(decryptSecret(packed, "integrations-secret-value"), "brevo-key")
})

test("webhook payload is versioned and rejects secrets", () => {
  const body = buildWebhookBody({
    id: "evt_1",
    type: "webhook.test",
    createdAt: "2026-09-21T00:00:00.000Z",
    organizationId: "org-1",
  })
  assert.equal(body.version, "2026-09-01")
  assert.equal(body.data.test, true)
  assert.equal(payloadIssue({ secret: "nope" }), "Payload refusé.")
})

const emptyLead = {
  email: null,
  firstName: null,
  lastName: null,
  phone: null,
  whatsapp: null,
  country: null,
  city: null,
  company: null,
  jobTitle: null,
  score: null,
  result: null,
  scorecard: null,
  status: null,
  temperature: null,
  thirdPartyConsent: false,
}
