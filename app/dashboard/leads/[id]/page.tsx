import Link from "next/link"
import { notFound } from "next/navigation"
import { ConversionForm } from "@/components/leads/conversion-form"
import { LeadEditor } from "@/components/leads/lead-editor"
import { canEdit } from "@/lib/auth/session"
import { loadLeadFacets } from "@/lib/data/crm"
import { ensureMembership } from "@/lib/data/membership"
import { getLeadDetail } from "@/lib/data/leads"
import { countryName } from "@/lib/geo/countries"
import { formatDate, formatDateTime, formatPercent } from "@/lib/format"

export const metadata = { title: "Lead", robots: { index: false, follow: false } }

const statusLabel: Record<string, string> = {
  new: "Nouveau",
  contacted: "Contacté",
  qualified: "Qualifié",
  nurturing: "Nurturing",
  converted: "Converti",
  lost: "Perdu",
}
const temperatureLabel: Record<string, string> = { cold: "Froid", warm: "Tiède", hot: "Chaud" }
const qualityLabel = { low: "Faible", medium: "Moyenne", high: "Élevée" }

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const membership = await ensureMembership()
  const [lead, facets] = await Promise.all([getLeadDetail(id), loadLeadFacets()])
  if (!lead) notFound()
  const editor = membership ? canEdit(membership.role) : false
  const person = lead.person

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <Link href="/dashboard/leads" className="text-sm text-muted-foreground underline">Leads</Link>
        <Link href={`/dashboard/leads/${lead.id}/reports`} className="ml-4 text-sm underline">Reports</Link>
        <h1 className="font-display text-4xl">{[person?.first_name, person?.last_name].filter(Boolean).join(" ") || "Lead"}</h1>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Item label="Email" value={person?.email} />
          <Item label="Téléphone" value={person?.phone} />
          <Item label="Pays" value={person?.country ? countryName(person.country) : null} />
          <Item label="Score" value={lead.score === null ? null : formatPercent(lead.score)} />
          <Item label="Température" value={temperatureLabel[lead.temperature]} />
          <Item label="Statut" value={statusLabel[lead.status] ?? lead.status} />
          <Item label="Scorecard" value={lead.scorecard} />
          <Item label="Date" value={formatDate(lead.createdAt)} />
        </dl>
        <LeadEditor leadId={lead.id} status={lead.status} tags={lead.tags} catalog={facets.tags} canEdit={editor} />
        {editor ? <ConversionForm leadId={lead.id} /> : null}
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border p-5">
          <h2 className="font-medium">Overview</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <Item label="WhatsApp" value={person?.whatsapp} />
            <Item label="Entreprise" value={person?.company} />
            <Item label="Fonction" value={person?.job_title} />
            <Item label="Ville" value={person?.city} />
            <Item label="Complétude" value={formatPercent(lead.completeness)} />
            <Item label="Qualité du lead" value={`${qualityLabel[lead.qualityBand]} · ${formatPercent(lead.quality)}`} />
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">La qualité du lead est distincte du score d&apos;évaluation.</p>
        </article>
        <article className="rounded-2xl border p-5">
          <h2 className="font-medium">Assessment</h2>
          <p className="font-display mt-3 text-4xl">{lead.score === null ? "—" : formatPercent(lead.score)}</p>
          <p className="mt-2">{lead.range?.title || lead.range?.label || "Résultat non calculé"}</p>
          <ul className="mt-4 space-y-1 text-sm">
            {lead.categories.map((category) => (
              <li key={category.name} className="flex justify-between"><span>{category.name}</span><span>{formatPercent(category.percent)}</span></li>
            ))}
          </ul>
        </article>
      </section>

      <section className="rounded-2xl border p-5">
        <h2 className="font-medium">Réponses</h2>
        <ol className="mt-3 space-y-3 text-sm">
          {lead.answers.map((answer) => (
            <li key={answer.title}>
              <p className="font-medium">{answer.title}</p>
              <p className="text-muted-foreground">{answer.labels.join(", ") || "—"}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border p-5 text-sm">
          <h2 className="font-medium">Marketing</h2>
          <dl className="mt-3 space-y-1">
            <Item label="Source" value={lead.utm?.utm_source || lead.source} />
            <Item label="Medium" value={lead.utm?.utm_medium} />
            <Item label="Campaign" value={lead.utm?.utm_campaign} />
            <Item label="Content" value={lead.utm?.utm_content} />
            <Item label="Term" value={lead.utm?.utm_term} />
            <Item label="Referrer" value={lead.referrer} />
          </dl>
        </article>
        <article className="rounded-2xl border p-5 text-sm">
          <h2 className="font-medium">Activity</h2>
          <ol className="mt-3 space-y-3">
            {lead.timeline.length === 0 ? <li className="text-muted-foreground">Aucune activité.</li> : null}
            {lead.timeline.map((item) => (
              <li key={`${item.at}-${item.label}`}>
                <p className="text-muted-foreground">{formatDateTime(item.at)}</p>
                <p>{item.label}</p>
              </li>
            ))}
          </ol>
        </article>
      </section>

      <section className="rounded-2xl border p-5">
        <h2 className="font-medium">Notes</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {lead.notes.length === 0 ? <li className="text-muted-foreground">Aucune note interne.</li> : null}
          {lead.notes.map((note) => (
            <li key={note.id} className="rounded-xl bg-muted/40 p-3">
              <p className="whitespace-pre-wrap">{note.content}</p>
              <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(note.created_at)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Item({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  )
}
