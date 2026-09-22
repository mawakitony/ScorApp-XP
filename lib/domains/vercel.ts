import "server-only"

import { normalizeDomain } from "@/lib/billing/domains"

export type VercelDomainResult =
  | { configured: false }
  | { configured: true; ok: false; status: number }
  | { configured: true; ok: true; verified: boolean; ssl: "provisioning" | "active" | "error"; records: { type: string; name: string; value: string }[] }

function auth() {
  const token = process.env.VERCEL_TOKEN
  const project = process.env.VERCEL_PROJECT_ID
  if (!token || !project) return null
  const team = process.env.VERCEL_TEAM_ID
  return { token, project, team }
}

function url(path: string, team: string | undefined) {
  const query = team ? `?teamId=${encodeURIComponent(team)}` : ""
  return `https://api.vercel.com${path}${query}`
}

export async function addVercelDomain(domain: string): Promise<VercelDomainResult> {
  const normalized = normalizeDomain(domain)
  const access = auth()
  if (!normalized || !access) return { configured: false }
  const response = await fetch(url(`/v10/projects/${access.project}/domains`, access.team), {
    method: "POST",
    headers: { authorization: `Bearer ${access.token}`, "content-type": "application/json" },
    body: JSON.stringify({ name: normalized }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) return { configured: true, ok: false, status: response.status }
  return readDomain(response)
}

export async function removeVercelDomain(domain: string): Promise<VercelDomainResult> {
  const normalized = normalizeDomain(domain)
  const access = auth()
  if (!normalized || !access) return { configured: false }
  const response = await fetch(url(`/v9/projects/${access.project}/domains/${normalized}`, access.team), {
    method: "DELETE",
    headers: { authorization: `Bearer ${access.token}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok && response.status !== 404) return { configured: true, ok: false, status: response.status }
  return { configured: true, ok: true, verified: false, ssl: "error", records: [] }
}

export async function getVercelDomain(domain: string): Promise<VercelDomainResult> {
  const normalized = normalizeDomain(domain)
  const access = auth()
  if (!normalized || !access) return { configured: false }
  const response = await fetch(url(`/v9/projects/${access.project}/domains/${normalized}`, access.team), {
    headers: { authorization: `Bearer ${access.token}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) return { configured: true, ok: false, status: response.status }
  return readDomain(response)
}

async function readDomain(response: Response): Promise<VercelDomainResult> {
  const body = await response.json() as { verified?: boolean; verification?: { type?: string; domain?: string; value?: string }[] }
  const records = Array.isArray(body.verification)
    ? body.verification.flatMap((item) => item.type && item.domain && item.value ? [{ type: item.type, name: item.domain, value: item.value }] : [])
    : []
  return {
    configured: true,
    ok: true,
    verified: Boolean(body.verified),
    ssl: body.verified ? "active" : "provisioning",
    records,
  }
}
