import { notFound } from "next/navigation"
import { ReportView } from "@/components/reports/report-view"
import { presentReport } from "@/lib/reports/present"
import { hashShareToken, shareIsActive } from "@/lib/reports/share"
import { createAdminClient } from "@/lib/supabase/admin"

export const metadata = { title: "Rapport partagé", robots: { index: false, follow: false } }

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (token.length < 20) notFound()
  let report: { snapshot: unknown; ai_output: unknown; report_type: string } | null = null
  try {
    const admin = createAdminClient()
    const { data: share } = await admin.from("report_shares").select("report_id, expires_at, revoked_at").eq("token_hash", hashShareToken(token)).maybeSingle()
    if (!share || !shareIsActive({ revokedAt: share.revoked_at, expiresAt: share.expires_at })) notFound()
    const { data } = await admin.from("assessment_reports").select("snapshot, ai_output, report_type").eq("id", share.report_id).eq("report_type", "participant").maybeSingle()
    report = data
  } catch {
    notFound()
  }
  if (!report || report.report_type !== "participant") notFound()
  const presented = presentReport(report.snapshot, report.ai_output, false)
  if (!presented) notFound()
  return (
    <main className="min-h-screen bg-[#f7f4ee]">
      <ReportView report={presented} />
    </main>
  )
}
