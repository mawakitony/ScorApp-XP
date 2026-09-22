import Link from "next/link"
import { notFound } from "next/navigation"
import { ParticipantReportActions } from "@/components/reports/participant-report-actions"
import { ReportView } from "@/components/reports/report-view"
import { loadVisitorSession } from "@/lib/assessment/store"
import { presentReport } from "@/lib/reports/present"
import { createAdminClient } from "@/lib/supabase/admin"

export const metadata = { title: "Rapport", robots: { index: false, follow: false } }

export default async function ParticipantReportPage({ params }: { params: Promise<{ slug: string; sessionId: string }> }) {
  const { slug, sessionId } = await params
  const loaded = await loadVisitorSession(slug)
  if ("error" in loaded || loaded.session.id !== sessionId) notFound()
  let report: { id: string; status: string; snapshot: unknown; ai_output: unknown } | null = null
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("assessment_reports").select("id, status, snapshot, ai_output").eq("session_id", sessionId).eq("organization_id", loaded.scorecard.organization_id).eq("report_type", "participant").order("version", { ascending: false }).limit(1).maybeSingle()
    report = data
  } catch {
    report = null
  }
  if (!report) notFound()
  const presented = presentReport(report.snapshot, report.ai_output, true)
  if (!presented) notFound()

  return (
    <main className="min-h-screen bg-[#f7f4ee]">
      <div className="mx-auto max-w-3xl px-5 pt-6">
        <Link href={`/s/${slug}/results/${sessionId}`} className="text-sm text-[#5e6d7e] underline">Résultat</Link>
      </div>
      <ReportView
        report={presented}
        downloadHref={report.status === "ready" ? `/api/reports/${report.id}/download?slug=${encodeURIComponent(slug)}` : undefined}
        preparing={report.status === "pending" || report.status === "generating"}
        failed={report.status === "failed"}
      />
      <ParticipantReportActions slug={slug} failed={report.status === "failed"} english={presented.language === "en"} />
    </main>
  )
}
