import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export async function allowRate(bucket: string, windowSeconds: number, limit: number) {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc("consume_rate_limit", {
      p_bucket: bucket,
      p_window_seconds: windowSeconds,
      p_limit: limit,
    })
    if (error && /does not exist|schema cache|Could not find/i.test(error.message)) return true
    if (error) return false
    return data !== false
  } catch {
    return true
  }
}
