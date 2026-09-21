import Link from "next/link"
import { notFound } from "next/navigation"
import { ScorecardForm } from "@/components/scorecard/scorecard-form"
import { StatusBadge } from "@/components/scorecard/status-badge"
import { Button } from "@/components/ui/button"
import { updateScorecard } from "@/actions/scorecards"
import { canEdit } from "@/lib/auth/session"
import { ensureMembership } from "@/lib/data/membership"
import { getScorecard } from "@/lib/data/scorecards"
import { getAppUrl } from "@/lib/env"
import { formatDate } from "@/lib/format"
import { toScorecardFormValues } from "@/lib/scorecard/values"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return { title: `Scorecard ${id.slice(0, 8)}` }
}

export default async function ScorecardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const membership = await ensureMembership()
  if (!membership) return null
  const scorecard = await getScorecard(membership.organization.id, id)
  if (!scorecard) notFound()
  const editor = canEdit(membership.role)

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Fiche scorecard</p>
          <h1 className="font-display text-4xl">{scorecard.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <StatusBadge status={scorecard.status} />
            <span>Créée le {formatDate(scorecard.created_at)}</span>
            <span>{getAppUrl()}/s/{scorecard.slug}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="h-10" variant="outline">
            <Link href={`/dashboard/scorecards/${scorecard.id}/analytics`}>Analytics</Link>
          </Button>
          <Button asChild className="h-10">
            <Link href={`/dashboard/scorecards/${scorecard.id}/builder`}>Ouvrir le builder</Link>
          </Button>
        </div>
      </div>

      {editor ? (
        <div className="rounded-3xl border bg-card p-6 md:p-8">
          <ScorecardForm
            defaultValues={toScorecardFormValues(scorecard)}
            organizationId={membership.organization.id}
            scorecardId={scorecard.id}
            submitLabel="Enregistrer"
            onSubmit={updateScorecard.bind(null, scorecard.id)}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Votre rôle permet de consulter cette scorecard, pas de la modifier.</p>
      )}
    </div>
  )
}
