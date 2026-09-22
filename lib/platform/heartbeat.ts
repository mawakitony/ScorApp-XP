import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export async function recordHeartbeat(name: "integration_worker" | "report_worker" | "email_worker" | "maintenance_worker") {
  try {
    const admin = createAdminClient()
    await admin.from("system_heartbeats").upsert({
      name,
      last_seen_at: new Date().toISOString(),
      status: "healthy",
      metadata: {},
    })
  } catch {
    return
  }
}
