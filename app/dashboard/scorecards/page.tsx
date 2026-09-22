import { CreateScorecardDialog } from "@/components/scorecard/create-scorecard-dialog"
import { ScorecardsTable } from "@/components/scorecard/scorecards-table"
import { EmptyState } from "@/components/dashboard/empty-state"
import { can } from "@/lib/auth/permissions"
import { ensureMembership } from "@/lib/data/membership"
import { listScorecards } from "@/lib/data/scorecards"

export const metadata = { title: "Scorecards" }

export default async function ScorecardsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const params = await searchParams
  const membership = await ensureMembership()
  if (!membership) return null

  const { scorecards, error } = await listScorecards(membership.organization.id, params.q)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Bibliothèque</p>
          <h1 className="font-display text-4xl">Scorecards</h1>
        </div>
        {can({ role: membership.role }, "scorecard.edit") ? <CreateScorecardDialog /> : null}
      </div>

      <form action="/dashboard/scorecards" className="md:hidden">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Rechercher"
          className="h-10 w-full rounded-xl border bg-card px-3 text-sm"
        />
      </form>

      {error ? <p className="rounded-2xl border bg-card px-5 py-4 text-sm">{error}</p> : null}

      {scorecards.length === 0 && !error ? (
        <EmptyState
          title={params.q ? "Aucun résultat" : "Aucune scorecard"}
          description={
            params.q
              ? "Essayez un autre nom ou un autre slug."
              : "Créez une scorecard ou partez d'un modèle WOLOYEM."
          }
        />
      ) : (
        <ScorecardsTable items={scorecards} />
      )}
    </div>
  )
}
