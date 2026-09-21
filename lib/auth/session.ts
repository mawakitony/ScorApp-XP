import { redirect } from "next/navigation"
import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"
import type { OrgRole } from "@/types/database"

export async function getUser() {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return data.user
}

export async function requireUser() {
  const user = await getUser()
  if (!user) redirect("/login")
  return user
}

export function canEdit(role: OrgRole) {
  return role === "owner" || role === "admin"
}
