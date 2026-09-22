import { NextResponse } from "next/server"
import { processIntegrationJobs } from "@/lib/integrations/worker"
import { recordHeartbeat } from "@/lib/platform/heartbeat"
import { processReportJobs } from "@/lib/reports/queue"

async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get("authorization")
  if (!secret || header !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  try {
    const [integrations, reports] = await Promise.all([
      processIntegrationJobs().then(async (result) => {
        await recordHeartbeat("integration_worker")
        return result
      }),
      processReportJobs().then(async (result) => {
        await recordHeartbeat("report_worker")
        return result
      }),
    ])
    return NextResponse.json({ integrations, reports })
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 })
  }
}

export const GET = run
export const POST = run
