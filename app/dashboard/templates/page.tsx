import Link from "next/link"
import { EmptyState } from "@/components/dashboard/empty-state"
import { UseTemplateButton } from "@/components/templates/use-template-button"
import { can } from "@/lib/auth/permissions"
import { ensureMembership } from "@/lib/data/membership"
import { listTemplates } from "@/lib/data/scorecards"

export const metadata = { title: "Modèles" }

export default async function TemplatesPage() {
  const membership = await ensureMembership()
  const templates = await listTemplates()
  const editor = membership ? can({ role: membership.role }, "scorecard.edit") : false

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Modèles WOLOYEM</p>
        <h1 className="font-display text-4xl">Modèles</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Chaque modèle crée une scorecard brouillon. Les questions et le scoring seront ajoutés dans le builder.
        </p>
      </div>
      {templates.length === 0 ? (
        <EmptyState
          title="Aucun modèle"
          description="Les modèles WOLOYEM ne sont pas encore disponibles. Créez une scorecard vide en attendant."
          action={<Link className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm text-primary-foreground" href="/dashboard/scorecards">Voir les scorecards</Link>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((template) => (
            <article key={template.id} className="flex flex-col rounded-2xl border bg-card p-6">
              <p className="text-xs tracking-[0.16em] text-brass uppercase">{template.category}</p>
              <h2 className="font-display mt-2 text-2xl">{template.name}</h2>
              <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">{template.description}</p>
              {template.objective ? <p className="mt-3 text-sm">{template.objective}</p> : null}
              <div className="mt-6">
                <UseTemplateButton templateId={template.id} disabled={!editor} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
