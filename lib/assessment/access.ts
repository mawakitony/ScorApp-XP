import type { ScorecardStatus } from "@/types/database"

export type PublicAccess = "published" | "paused" | "preview" | "hidden"

export function publicAccess(status: ScorecardStatus, preview: boolean, isMember: boolean): PublicAccess {
  if (status === "published") return "published"
  if (status === "paused") return "paused"
  if (status === "draft" && preview && isMember) return "preview"
  return "hidden"
}

export function canStartSession(status: ScorecardStatus) {
  return status === "published"
}

export function canContinueSession(status: ScorecardStatus) {
  return status === "published" || status === "paused"
}
