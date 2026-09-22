export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}

export function isServiceRoleConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

const PRODUCTION_REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_APP_URL", "CRON_SECRET"] as const

export function missingProductionEnv(env: Record<string, string | undefined> = process.env) {
  if (env.NODE_ENV !== "production") return []
  return PRODUCTION_REQUIRED.filter((key) => !env[key]?.trim())
}

export function assertProductionEnv() {
  const missing = missingProductionEnv()
  if (missing.length) throw new Error(`Missing production environment: ${missing.join(", ")}`)
}

export function e2eDatabaseAllowed(env: Record<string, string | undefined> = process.env) {
  if (env.NODE_ENV === "production") return false
  const target = env.E2E_SUPABASE_URL?.trim()
  if (!target) return false
  if (env.STRIPE_SECRET_KEY?.startsWith("sk_live_")) return false
  return target !== env.NEXT_PUBLIC_SUPABASE_URL?.trim()
}

export function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000"
}

export function safeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/dashboard") || value.startsWith("//")) {
    return "/dashboard"
  }
  return value
}
