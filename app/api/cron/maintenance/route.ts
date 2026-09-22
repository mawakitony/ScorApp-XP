import { NextResponse } from "next/server"
import { runMaintenance } from "@/lib/maintenance/jobs"

async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get("authorization")
  if (!secret || header !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  try {
    await runMaintenance()
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 })
  }
}

export const GET = run
export const POST = run
