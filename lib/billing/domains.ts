export type DomainStatus = "pending" | "verified" | "failed" | "disabled"

export type DomainRecord = {
  domain: string
  organizationId: string
  status: DomainStatus
}

const PRIVATE_HOST = /^(localhost|.*\.localhost|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|169\.254\.\d+\.\d+|::1|\[::1\])$/

export function normalizeDomain(input: string) {
  const raw = input.trim().toLowerCase()
  if (!raw || raw.length > 253 || /[\s/\\?#@]/.test(raw) || raw.includes("://") || raw.includes(":")) return null
  const trimmed = raw.endsWith(".") ? raw.slice(0, -1) : raw
  let hostname = trimmed
  try {
    hostname = new URL(`http://${trimmed}`).hostname
  } catch {
    return null
  }
  if (!hostname.includes(".") || PRIVATE_HOST.test(hostname)) return null
  if (!/^[a-z0-9.-]+$/.test(hostname) || hostname.startsWith("-") || hostname.endsWith("-") || hostname.includes("..")) return null
  return hostname
}

export function domainLabel(domain: string) {
  try {
    return new URL(`http://${domain}`).hostname
  } catch {
    return domain
  }
}

export function verificationTxt(token: string) {
  return `woloyem-verification=${token}`
}

const PLATFORM_DEFAULTS = ["woloyem.com", "www.woloyem.com", "score.woloyem.com"]

export function isPlatformHost(host: string, allowlist = platformAllowlist()) {
  const hostname = (host.split(":")[0] ?? "").toLowerCase()
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".vercel.app")) return true
  return allowlist.includes(hostname)
}

export function platformAllowlist(raw = process.env.PLATFORM_HOSTS) {
  const extra = (raw ?? PLATFORM_DEFAULTS.join(",")).split(",").map((item) => item.trim().toLowerCase()).filter(Boolean)
  return [...new Set([...PLATFORM_DEFAULTS, ...extra])]
}

export function publicPathForHost(pathname: string, defaultSlug: string | null) {
  if (pathname.startsWith("/_next") || pathname.startsWith("/icon")) return { kind: "pass" as const }
  const blocked = ["/dashboard", "/platform", "/login", "/signup", "/onboarding", "/invite", "/api", "/auth"]
  if (blocked.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return { kind: "deny" as const }
  if (pathname === "/" || pathname === "") {
    if (!defaultSlug) return { kind: "missing" as const }
    return { kind: "rewrite" as const, pathname: `/s/${defaultSlug}` }
  }
  const visible = pathname.startsWith("/s/") ? pathname.slice(2) : pathname
  return { kind: "rewrite" as const, pathname: `/s${visible.startsWith("/") ? visible : `/${visible}`}` }
}

export function canonicalUrl(input: { appUrl: string; host: string; slug: string; customDomain: boolean }) {
  if (!input.customDomain) return `${input.appUrl.replace(/\/$/, "")}/s/${input.slug}`
  const hostname = input.host.split(":")[0]
  return `https://${hostname}/${input.slug}`
}

export function resolveTenantFromHost(host: string, domains: DomainRecord[], allowlist = platformAllowlist()) {
  if (isPlatformHost(host, allowlist)) return { kind: "default" as const }
  const hostname = host.split(":")[0] ?? ""
  const domain = normalizeDomain(hostname)
  if (!domain) return { kind: "default" as const }
  const match = domains.find((item) => item.domain === domain)
  if (!match || match.status !== "verified") return { kind: "unverified" as const }
  return { kind: "custom" as const, organizationId: match.organizationId, domain }
}
