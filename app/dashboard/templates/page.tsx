import { EmptyState } from "@/components/dashboard/empty-state"
import { UseTemplateButton } from "@/components/templates/use-template-button"
import { canEdit } from "@/lib/auth/session"
import { ensureMembership } from "@/lib/data/membership"
import { listTemplates } from "@/lib/data/scorecards"

export const metadata = { title: "Templates" }

export default async function TemplatesPage() {
  const membership = await ensureMembership()
  const templates = await listTemplates()
  const editor = membership ? canEdit(membership.role) : false

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Modèles WOLOYEM</p>
        <h1 className="font-display text-4xl">Templates</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Chaque modèle crée une scorecard brouillon. Les questions et le scoring seront ajoutés dans le builder.
        </p>
      </div>
      {templates.length === 0 ? (
        <EmptyState
          title="Aucun modèle"
          description="Appliquez la migration Supabase pour charger les modèles PMP®, CAPM®, ITIL®, PRINCE2® et Business Case."
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
