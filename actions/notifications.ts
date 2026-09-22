"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { ensureMembership } from "@/lib/data/membership"
import { createClient } from "@/lib/supabase/server"

export async function markNotificationRead(id: string) {
  const membership = await ensureMembership()
  if (!membership || !z.string().uuid().safeParse(id).success) return
  const supabase = await createClient()
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("organization_id", membership.organization.id).is("read_at", null)
  revalidatePath("/dashboard", "layout")
}

export async function markAllNotificationsRead() {
  const membership = await ensureMembership()
  if (!membership) return
  const supabase = await createClient()
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("organization_id", membership.organization.id).is("read_at", null)
  revalidatePath("/dashboard", "layout")
}
