import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"
import { normalizeAccessRole, type AccessRole } from "@/lib/auth/permissions"
import type { Organization } from "@/types/database"

export type Membership = {
  role: AccessRole
  organization: Pick<
    Organization,
    "id" | "name" | "slug" | "logo_url" | "primary_color" | "secondary_color"
  >
}

type JoinedProfile = {
  full_name: string | null
  email: string | null
}

export type OrgMember = {
  userId: string
  role: AccessRole
  fullName: string | null
  email: string | null
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export async function getMembership(): Promise<Membership | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const selected = await supabase
    .from("organization_members")
    .select(
      "role, access_role, organization:organizations(id, name, slug, logo_url, primary_color, secondary_color)",
    )
    .limit(1)
    .maybeSingle()
  const data = selected.error
    ? (await supabase
        .from("organization_members")
        .select("role, organization:organizations(id, name, slug, logo_url, primary_color, secondary_color)")
        .limit(1)
        .maybeSingle()).data
    : selected.data

  if (!data) return null

  const organization = one(
    data.organization as Membership["organization"] | Membership["organization"][] | null,
  )
  if (!organization) return null

  const source = data as { role: string; access_role?: string | null }
  return { role: normalizeAccessRole(source.access_role || source.role), organization }
}

export async function ensureMembership() {
  const existing = await getMembership()
  if (existing) return existing
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const { error } = await supabase.rpc("bootstrap_membership")
  if (error) return null
  return getMembership()
}

export async function listMembers(organizationId: string): Promise<OrgMember[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("organization_members")
    .select("user_id, role, access_role, profile:profiles(full_name, email)")
    .eq("organization_id", organizationId)

  if (error || !data) return []

  return data.map((row) => {
    const profile = one(row.profile as JoinedProfile | JoinedProfile[] | null)
    return {
      userId: row.user_id as string,
      role: normalizeAccessRole(row.access_role || row.role),
      fullName: profile?.full_name ?? null,
      email: profile?.email ?? null,
    }
  })
}
