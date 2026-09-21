import Link from "next/link"
import { notFound } from "next/navigation"
import { EmptyState } from "@/components/dashboard/empty-state"
import { ensureMembership } from "@/lib/data/membership"
import { getScorecard } from "@/lib/data/scorecards"
import { Button } from "@/components/ui/button"

export const metadata = { title: "Résultats" }

export default async function ScorecardResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const membership = await ensureMembership()
  if (!membership) return null
  const scorecard = await getScorecard(membership.organization.id, id)
  if (!scorecard) notFound()

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{scorecard.name}</p>
        <h1 className="font-display text-4xl">Résultats</h1>
      </div>
      <EmptyState
        title="Aucun résultat individuel"
        description="Les réponses, scores par catégorie et la timeline de chaque participant seront consultables ici après l'expérience publique."
      />
      <Button asChild variant="outline">
        <Link href={`/dashboard/scorecards/${scorecard.id}`}>Retour à la fiche</Link>
      </Button>
    </div>
  )
}
