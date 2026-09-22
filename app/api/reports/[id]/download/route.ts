import { NextResponse } from "next/server"
import { canEdit, getUser } from "@/lib/auth/session"
import { loadVisitorSession } from "@/lib/assessment/store"
import { ensureMembership } from "@/lib/data/membership"
import { pdfFilename, reportAccess } from "@/lib/reports/dto"
import { safeReportPath } from "@/lib/security/limits"
import { presentReport } from "@/lib/reports/present"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 })
  }
  const { data: report } = await admin.from("assessment_reports").select("id, organization_id, session_id, scorecard_id, report_type, status, storage_path, snapshot").eq("id", id).maybeSingle()
  if (!report || report.status !== "ready" || !report.storage_path || !safeReportPath(report.organization_id, report.storage_path)) return NextResponse.json({ error: "not_ready" }, { status: 404 })

  const slug = new URL(request.url).searchParams.get("slug") ?? ""
  const loaded = slug ? await loadVisitorSession(slug) : null
  const sameSession = Boolean(loaded && !("error" in loaded) && loaded.session.id === report.session_id)
  const user = await getUser()
  const membership = user ? await ensureMembership() : null
  const access = reportAccess({
    reportType: report.report_type,
    reportOrganizationId: report.organization_id,
    viewerOrganizationId: membership?.organization.id ?? null,
    sameSession,
    editor: membership ? canEdit(membership.role) : false,
  })
  if (access === "denied") return NextResponse.json({ error: "not_found" }, { status: 404 })

  const file = await admin.storage.from("assessment-reports").download(report.storage_path)
  if (file.error || !file.data) return NextResponse.json({ error: "missing" }, { status: 404 })
  const { data: current } = await admin.from("assessment_reports").select("download_count").eq("id", report.id).maybeSingle()
  await admin.from("assessment_reports").update({ download_count: (current?.download_count ?? 0) + 1 }).eq("id", report.id)
  await admin.from("report_events").insert({ organization_id: report.organization_id, report_id: report.id, event_type: "report.downloaded" })
  const presented = presentReport(report.snapshot, null, false)
  const filename = pdfFilename(presented?.scorecardTitle ?? "Assessment", access === "admin")
  const bytes = Buffer.from(await file.data.arrayBuffer())
  return new NextResponse(bytes, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, max-age=60",
    },
  })
}
