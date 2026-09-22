export const PLATFORM_ROLES = ["super_admin", "support", "operations", "finance"] as const
export type PlatformRole = (typeof PLATFORM_ROLES)[number]

export const PLATFORM_PERMISSIONS = [
  "platform.organizations.read",
  "platform.organizations.manage",
  "platform.support.access",
  "platform.billing.read",
  "platform.billing.manage",
  "platform.jobs.read",
  "platform.jobs.retry",
  "platform.entitlements.manage",
  "platform.audit.read",
  "platform.admins.manage",
] as const
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number]

const ALL = PLATFORM_PERMISSIONS

const MATRIX: Record<PlatformRole, readonly PlatformPermission[]> = {
  super_admin: ALL,
  support: ["platform.organizations.read", "platform.support.access", "platform.billing.read", "platform.jobs.read", "platform.audit.read"],
  operations: ["platform.organizations.read", "platform.jobs.read", "platform.jobs.retry", "platform.audit.read"],
  finance: ["platform.organizations.read", "platform.billing.read", "platform.audit.read"],
}

export function normalizePlatformRole(value: string | null | undefined): PlatformRole {
  if (value === "super_admin" || value === "support" || value === "operations" || value === "finance") return value
  return "support"
}

export function canPlatform(actor: { role: string } | null, permission: PlatformPermission) {
  if (!actor) return false
  return MATRIX[normalizePlatformRole(actor.role)].includes(permission)
}

export function canRevokePlatformAdmin(input: { actorId: string; targetId: string; targetRole: string; superAdminCount: number }) {
  if (input.actorId === input.targetId) return false
  if (input.targetRole === "super_admin" && input.superAdminCount <= 1) return false
  return true
}

export function platformGate(input: { admin: { role: string } | null; permission: PlatformPermission }) {
  if (!input.admin) return "denied" as const
  if (!canPlatform(input.admin, input.permission)) return "denied" as const
  return "allowed" as const
}
