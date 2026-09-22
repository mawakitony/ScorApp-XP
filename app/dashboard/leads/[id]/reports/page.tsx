import Link from "next/link"
import { notFound } from "next/navigation"
import { ReportActions } from "@/components/reports/report-actions"
import { ReportView } from "@/components/reports/report-view"
import { canEdit, requireUser } from "@/lib/auth/session"
import { ensureMembership } from "@/lib/data/membership"
import { adminDto, type AdminReport } from "@/lib/reports/dto"
import { presentReport } from "@/lib/reports/present"
import { createClient } from "@/lib/supabase/server"

export const metadata = { title: "Rapports", robots: { index: false, follow: false } }

export default async function LeadReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireUser()
  const membership = await ensureMembership()
  if (!membership) return null
  const supabase = await createClient()
  const { data: lead } = await supabase.from("leads").select("id, session_id, status, source").eq("id", id).eq("organization_id", membership.organization.id).maybeSingle()
  if (!lead) notFound()
  const { data: reports, error } = await supabase.from("assessment_reports").select("id, version, status, ai_status, download_count, report_type, created_at, snapshot, ai_output, session_id").eq("lead_id", lead.id).order("created_at", { ascending: false })
  const { data: shares } = await supabase.from("report_shares").select("id, report_id, expires_at, revoked_at").eq("organization_id", membership.organization.id)

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Link href={`/dashboard/leads/${lead.id}`} className="text-sm text-muted-foreground">Lead</Link>
        <h1 className="font-display text-4xl">Reports</h1>
      </div>
      {error ? <p className="rounded-2xl border bg-card px-5 py-4 text-sm">La migration des rapports n&apos;est pas encore appliquée.</p> : null}
      <ul className="divide-y rounded-3xl border bg-card">
        {(reports ?? []).map((report) => (
          <li key={report.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
            <div>
              <p className="font-medium">v{report.version} · {report.report_type}</p>
              <p className="text-muted-foreground">{report.status} · IA {report.ai_status} · {report.download_count} téléchargements</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {report.status === "ready" ? <a className="underline" href={`/api/reports/${report.id}/download`}>PDF</a> : null}
              {canEdit(membership.role) ? <ReportActions reportId={report.id} sessionId={report.session_id} shares={(shares ?? []).filter((share) => share.report_id === report.id)} /> : null}
            </div>
          </li>
        ))}
      </ul>
      {(reports ?? []).filter((report) => report.report_type === "participant").slice(0, 1).map((report) => {
        const presented = presentReport(report.snapshot, report.ai_output, true)
        return presented ? <ReportView key={report.id} report={presented} /> : null
      })}
      {(reports ?? []).filter((report) => report.report_type === "admin").slice(0, 1).map((report) => {
        const base = presentReport(report.snapshot, report.ai_output, true)
        if (!base) return null
        const raw = report.snapshot && typeof report.snapshot === "object" ? report.snapshot as Partial<AdminReport> : {}
        const internal = adminDto({
          ...base,
          internal: true,
          leadStatus: raw.leadStatus ?? null,
          temperature: raw.temperature ?? null,
          quality: raw.quality ?? null,
          source: raw.source ?? null,
          campaign: raw.campaign ?? null,
          email: raw.email ?? null,
          phone: raw.phone ?? null,
          notes: Array.isArray(raw.notes) ? raw.notes : [],
          answers: Array.isArray(raw.answers) ? raw.answers : [],
        })
        return <AdminPreview key={report.id} report={internal} />
      })}
    </div>
  )
}

function AdminPreview({ report }: { report: AdminReport }) {
  return (
    <section className="rounded-3xl border bg-card p-6">
      <p className="text-sm tracking-[0.16em] text-[#8a7340] uppercase">Internal</p>
      <h2 className="font-display mt-2 text-2xl">{report.scorecardTitle}</h2>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>Statut {report.leadStatus ?? "—"}</div>
        <div>Température {report.temperature ?? "—"}</div>
        <div>Qualité {report.quality ?? "—"}</div>
        <div>Source {report.source ?? "—"}</div>
        <div>Campagne {report.campaign ?? "—"}</div>
      </dl>
      {report.answers.length > 0 ? (
        <ul className="mt-4 space-y-2 text-sm">{report.answers.map((answer) => <li key={answer.question}>{answer.question} · {answer.answer}</li>)}</ul>
      ) : null}
      {report.notes.length > 0 ? <ul className="mt-4 text-sm text-muted-foreground">{report.notes.map((note) => <li key={note}>{note}</li>)}</ul> : null}
    </section>
  )
}
