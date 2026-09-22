import { lookup } from "node:dns/promises"

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata.internal"])

function ipv4Blocked(host: string) {
  const parts = host.split(".").map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

function ipv6Blocked(host: string) {
  if (!host.includes(":")) return false
  const value = host.toLowerCase()
  return value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80")
}

export function webhookUrlIssue(raw: string, options: { production: boolean; addresses?: string[] }) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return "URL invalide."
  }
  if (url.username || url.password) return "URL invalide."
  const httpsOnly = options.production
  if (url.protocol !== "https:" && (httpsOnly || url.protocol !== "http:")) return "Seules les URL HTTP(S) sont acceptées."
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) return "Hôte refusé."
  const candidates = [host, ...(options.addresses ?? [])]
  if (candidates.some((address) => ipv4Blocked(address) || ipv6Blocked(address))) return "Adresse privée refusée."
  return null
}

function literalAddress(host: string) {
  return /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")
}

export async function assertPublicWebhookUrl(raw: string) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return "URL invalide."
  }
  const host = url.hostname.replace(/^\[|\]$/g, "")
  let addresses: string[] = []
  if (!literalAddress(host)) {
    try {
      const records = await lookup(host, { all: true, verbatim: true })
      addresses = records.map((record) => record.address)
    } catch {
      return "Hôte introuvable."
    }
  }
  return webhookUrlIssue(raw, { production: process.env.NODE_ENV === "production", addresses })
}
