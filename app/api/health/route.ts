import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET() {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from("organizations").select("id").limit(1)
    if (error) return NextResponse.json({ ok: false }, { status: 503 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 })
  }
}
