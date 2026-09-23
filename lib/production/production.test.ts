import assert from "node:assert/strict"
import test from "node:test"
import { canonicalUrl, isPlatformHost, normalizeDomain, publicPathForHost, resolveTenantFromHost } from "../billing/domains.ts"
import { isBuilderStep } from "../constants.ts"
import { safeProviderFailure } from "../email/provider-error.ts"
import { invitationIdempotencyKey, nextEmailAttempt, renderEmail } from "../email/templates.ts"
import { e2eDatabaseAllowed, missingProductionEnv } from "../env.ts"
import { redact } from "../observability/logger.ts"
import { publicError } from "../observability/errors.ts"
import { contentSecurityPolicy, safeReportPath, validateImageFile } from "../security/limits.ts"

test("builder step check stays usable from a server page", () => {
  assert.equal(isBuilderStep("setup"), true)
  assert.equal(isBuilderStep("not-a-step"), false)
  assert.equal(isBuilderStep(undefined), false)
})

test("platform hosts are never treated as a customer domain", () => {
  assert.equal(isPlatformHost("localhost:3000"), true)
  assert.equal(isPlatformHost("woloyem-score.vercel.app"), true)
  assert.equal(isPlatformHost("score.woloyem.com"), true)
  assert.equal(isPlatformHost("score.client.com"), false)
  const row = [{ domain: "score.woloyem.com", organizationId: "org", status: "verified" as const }]
  assert.equal(resolveTenantFromHost("score.woloyem.com", row).kind, "default")
  assert.equal(resolveTenantFromHost("score.client.com", [{ domain: "score.client.com", organizationId: "org", status: "pending" }]).kind, "unverified")
})

test("a verified custom host rewrites the public path and keeps the customer URL", () => {
  assert.deepEqual(publicPathForHost("/pmp-readiness", null), { kind: "rewrite", pathname: "/s/pmp-readiness" })
  assert.deepEqual(publicPathForHost("/pmp-readiness/assessment", null), { kind: "rewrite", pathname: "/s/pmp-readiness/assessment" })
  assert.equal(publicPathForHost("/", "pmp-readiness").kind, "rewrite")
  assert.equal(publicPathForHost("/", null).kind, "missing")
  assert.equal(publicPathForHost("/dashboard", "pmp-readiness").kind, "deny")
  assert.equal(canonicalUrl({ appUrl: "https://score.woloyem.com", host: "score.client.com", slug: "pmp-readiness", customDomain: true }), "https://score.client.com/pmp-readiness")
  assert.equal(normalizeDomain("xn--mnchen-3ya.de"), "xn--mnchen-3ya.de")
  assert.equal(normalizeDomain("127.0.0.1"), null)
})

test("invitation email does not return a token and retries then die", () => {
  const key = invitationIdempotencyKey("inv-1")
  assert.equal(key, "organization_invitation:inv-1")
  assert.equal(key.includes("secret-token"), false)
  const message = renderEmail({ template: "organization_invitation", locale: "en", payload: { organizationName: "Acme", url: "https://score.woloyem.com/invite/hidden" } })
  assert.match(message.text, /Accept invitation/)
  assert.equal(nextEmailAttempt(0).status, "failed")
  assert.equal(nextEmailAttempt(5).status, "dead")
})

test("brevo failures keep status and code without secrets", () => {
  const failure = safeProviderFailure({
    status: 400,
    code: "invalid_parameter",
    message: "sender is not valid for noreply@woloyem.com api-key=x-api-key-abcdefghijklmnopqrstuvwxyz",
    requestId: "req_123456",
    sender: "noreply@woloyem.com",
  })
  assert.match(failure, /^provider_failed:400:invalid_parameter /)
  assert.match(failure, /request=req_123456/)
  assert.match(failure, /sender=n\*\*\*@woloyem.com/)
  assert.equal(failure.includes("x-api-key-abcdefghijklmnopqrstuvwxyz"), false)
  assert.equal(failure.includes("noreply@woloyem.com"), false)
  assert.equal(safeProviderFailure({ status: 401, code: "not a code", message: "", requestId: "bad id", sender: "a@b.co" }).startsWith("provider_failed:401:unknown"), true)
})

test("logs and storage paths drop secrets and traversal", () => {
  const safe = redact({ template: "organization_invitation", token: "raw", request_id: "abc" })
  assert.equal("token" in safe, false)
  assert.equal(safe.request_id, "abc")
  assert.equal(safeReportPath("11111111-1111-1111-1111-111111111111", "11111111-1111-1111-1111-111111111111/report.pdf"), true)
  assert.equal(safeReportPath("11111111-1111-1111-1111-111111111111", "../other/report.pdf"), false)
  assert.equal(validateImageFile({ type: "image/png", size: 1000, name: "logo.exe" }), "mismatch")
  assert.equal(validateImageFile({ type: "image/png", size: 1000, name: "logo.png" }), null)
})

test("production env and CSP stay strict", () => {
  assert.deepEqual(missingProductionEnv({ NODE_ENV: "development" }), [])
  assert.ok(missingProductionEnv({ NODE_ENV: "production" }).includes("CRON_SECRET"))
  assert.equal(e2eDatabaseAllowed({ NODE_ENV: "production", E2E_SUPABASE_URL: "https://e2e.supabase.co" }), false)
  assert.equal(e2eDatabaseAllowed({ NODE_ENV: "test", E2E_SUPABASE_URL: "https://e2e.supabase.co", NEXT_PUBLIC_SUPABASE_URL: "https://prod.supabase.co" }), true)
  assert.equal(e2eDatabaseAllowed({ NODE_ENV: "test", E2E_SUPABASE_URL: "https://same.supabase.co", NEXT_PUBLIC_SUPABASE_URL: "https://same.supabase.co" }), false)
  assert.equal(contentSecurityPolicy().includes("unsafe-eval"), false)
  assert.match(contentSecurityPolicy(), /frame-ancestors 'none'/)
  assert.equal(publicError("QUOTA_EXCEEDED").includes("Postgres"), false)
})
