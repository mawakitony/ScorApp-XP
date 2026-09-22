export type AccessRole = "owner" | "admin" | "editor" | "analyst" | "viewer" | "member"

export type Permission =
  | "scorecard.edit"
  | "scorecard.publish"
  | "billing.view"
  | "billing.manage"
  | "team.manage"
  | "ownership.transfer"
  | "organization.delete"
  | "integration.manage"
  | "lead.read"
  | "lead.edit"
  | "lead.export"
  | "report.read"
  | "analytics.read"

const ALL: Permission[] = [
  "scorecard.edit",
  "scorecard.publish",
  "billing.view",
  "billing.manage",
  "team.manage",
  "ownership.transfer",
  "organization.delete",
  "integration.manage",
  "lead.read",
  "lead.edit",
  "lead.export",
  "report.read",
  "analytics.read",
]

const ROLE_PERMISSIONS: Record<AccessRole, readonly Permission[]> = {
  owner: ALL,
  admin: ALL.filter((permission) => permission !== "ownership.transfer" && permission !== "organization.delete" && permission !== "billing.manage"),
  editor: ["scorecard.edit", "scorecard.publish", "lead.read", "report.read", "analytics.read"],
  analyst: ["lead.read", "lead.export", "report.read", "analytics.read", "billing.view"],
  viewer: ["lead.read", "report.read", "analytics.read"],
  member: ["lead.read", "report.read", "analytics.read"],
}

export function normalizeAccessRole(value: string | null | undefined): AccessRole {
  if (value === "owner" || value === "admin" || value === "editor" || value === "analyst" || value === "viewer" || value === "member") {
    return value
  }
  return "viewer"
}

export function can(actor: { role: string }, permission: Permission) {
  const role = normalizeAccessRole(actor.role)
  return ROLE_PERMISSIONS[role].includes(permission)
}

export function canRemoveMember(input: { callerRole: string; targetRole: string; ownerCount: number }) {
  if (!can({ role: input.callerRole }, "team.manage")) return false
  if (input.targetRole === "owner" && input.ownerCount <= 1) return false
  if (input.targetRole === "owner") return can({ role: input.callerRole }, "ownership.transfer")
  if (input.targetRole === "admin" && normalizeAccessRole(input.callerRole) !== "owner") return false
  return true
}

export function rolesAfterTransfer(input: { callerId: string; targetId: string; callerRole: string }) {
  if (!can({ role: input.callerRole }, "ownership.transfer") || input.callerId === input.targetId) return null
  return { [input.targetId]: "owner", [input.callerId]: "admin" } as const
}
