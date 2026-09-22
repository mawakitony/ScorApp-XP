import { saveOrgReportSettings } from "@/actions/reports"
import { canEdit, requireUser } from "@/lib/auth/session"
import { ensureMembership } from "@/lib/data/membership"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"

export const metadata = { title: "Rapports" }

function settings(value: Json | undefined) {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value : {}
  return {
    brandName: typeof row.brandName === "string" ? row.brandName : "WOLOYEM",
    website: typeof row.website === "string" ? row.website : "",
    email: typeof row.email === "string" ? row.email : "",
    footer: typeof row.footer === "string" ? row.footer : "",
    aiMode: row.aiMode === "manual" || row.aiMode === "automatic" ? row.aiMode : "disabled",
  }
}

export default async function ReportSettingsPage() {
  await requireUser()
  const membership = await ensureMembership()
  if (!membership) return null
  const supabase = await createClient()
  const { data } = await supabase.from("organizations").select("report_settings").eq("id", membership.organization.id).maybeSingle()
  const current = settings(data?.report_settings)
  const editor = canEdit(membership.role)
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-4xl">Rapports</h1>
      <form action={async (formData) => {
        "use server"
        await saveOrgReportSettings({
          brandName: String(formData.get("brandName") ?? ""),
          website: String(formData.get("website") ?? ""),
          email: String(formData.get("email") ?? ""),
          footer: String(formData.get("footer") ?? ""),
          aiMode: current.aiMode,
        })
      }} className="grid gap-3 rounded-3xl border bg-card p-6">
        <input name="brandName" defaultValue={current.brandName} aria-label="Marque" className="h-10 rounded-xl border px-3" disabled={!editor} />
        <input name="website" defaultValue={current.website} aria-label="Site" placeholder="Site web" className="h-10 rounded-xl border px-3" disabled={!editor} />
        <input name="email" defaultValue={current.email} aria-label="Email de contact" placeholder="Email de contact" className="h-10 rounded-xl border px-3" disabled={!editor} />
        <input name="footer" defaultValue={current.footer} aria-label="Pied de page" placeholder="Pied de page" className="h-10 rounded-xl border px-3" disabled={!editor} />
        {editor ? <button type="submit" className="h-10 w-fit rounded-xl bg-primary px-4 text-sm text-primary-foreground">Enregistrer</button> : null}
      </form>
    </div>
  )
}
