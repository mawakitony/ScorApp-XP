import { notFound } from "next/navigation"
import { BuilderShell, isBuilderStep } from "@/components/scorecard-builder/builder-shell"
import { canEdit } from "@/lib/auth/session"
import { getBuilderBundle } from "@/lib/data/builder"
import { ensureMembership } from "@/lib/data/membership"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return { title: `Builder ${id.slice(0, 8)}` }
}

export default async function BuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ step?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const membership = await ensureMembership()
  if (!membership) return null
  if (!canEdit(membership.role)) notFound()

  const loaded = await getBuilderBundle(membership.organization.id, id)
  if ("error" in loaded || !loaded.bundle) {
    return (
      <section className="rounded-3xl border bg-card p-8">
        <h1 className="font-display text-3xl">Builder indisponible</h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          {loaded.error ?? "La scorecard n'a pas pu être chargée."} Vérifiez que la migration `20260921190000_builder_fields.sql` est appliquée.
        </p>
      </section>
    )
  }

  return (
    <BuilderShell
      initial={loaded.bundle}
      organizationId={membership.organization.id}
      initialStep={isBuilderStep(query.step) ? query.step : "setup"}
    />
  )
}
