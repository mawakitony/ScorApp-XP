import { LeadsBoard } from "@/components/leads/leads-board"
import { TagManager } from "@/components/leads/lead-editor"
import { canEdit } from "@/lib/auth/session"
import { loadLeadFacets, queryLeads } from "@/lib/data/crm"
import { ensureMembership } from "@/lib/data/membership"
import { listScorecards } from "@/lib/data/scorecards"
import { parseLeadFilters } from "@/lib/leads/filters"

export const metadata = { title: "Leads" }

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const filters = parseLeadFilters(await searchParams)
  const membership = await ensureMembership()
  const [loaded, facets, catalog] = await Promise.all([
    queryLeads({ ...filters, ids: [] }),
    loadLeadFacets(),
    membership ? listScorecards(membership.organization.id) : Promise.resolve({ scorecards: [] }),
  ])
  const editor = membership ? canEdit(membership.role) : false

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">CRM</p>
        <h1 className="font-display text-4xl">Leads</h1>
      </div>
      <LeadsBoard
        rows={loaded.rows.map((row) => ({ ...row, email: row.email ?? null, phone: row.phone ?? null, country: row.country ?? null, scorecard: row.scorecard ?? null, utm_source: row.utm_source ?? null }))}
        total={loaded.total}
        filters={filters}
        facets={{ ...facets, scorecards: catalog.scorecards.map((scorecard) => ({ id: scorecard.id, name: scorecard.name })) }}
        canEdit={editor}
        error={loaded.error}
      />
      {editor ? <TagManager tags={facets.tags} /> : null}
    </div>
  )
}
