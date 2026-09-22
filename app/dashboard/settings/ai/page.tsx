import { activeAiProvider } from "@/lib/ai/provider"
import { saveOrgReportSettings } from "@/actions/reports"
import { canEdit, requireUser } from "@/lib/auth/session"
import { ensureMembership } from "@/lib/data/membership"
import { createClient } from "@/lib/supabase/server"

export const metadata = { title: "IA" }

export default async function AiSettingsPage() {
  await requireUser()
  const membership = await ensureMembership()
  if (!membership) return null
  const supabase = await createClient()
  const { data } = await supabase.from("organizations").select("report_settings").eq("id", membership.organization.id).maybeSingle()
  const row = data?.report_settings && typeof data.report_settings === "object" && !Array.isArray(data.report_settings) ? data.report_settings : {}
  const current = {
    brandName: typeof row.brandName === "string" ? row.brandName : "WOLOYEM",
    website: typeof row.website === "string" ? row.website : "",
    email: typeof row.email === "string" ? row.email : "",
    footer: typeof row.footer === "string" ? row.footer : "",
    aiMode: row.aiMode === "manual" || row.aiMode === "automatic" ? row.aiMode : "disabled",
  }
  const provider = activeAiProvider()
  const editor = canEdit(membership.role)
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="font-display text-4xl">IA</h1>
      {provider.configured ? <p className="text-sm text-muted-foreground">Provider {provider.id}. L&apos;IA n&apos;écrit aucun score.</p> : <p className="text-sm text-muted-foreground">L&apos;analyse IA n&apos;est pas configurée.</p>}
      <form action={async (formData) => {
        "use server"
        await saveOrgReportSettings({ ...current, aiMode: String(formData.get("aiMode") ?? "disabled") })
      }} className="rounded-3xl border bg-card p-6">
        <select name="aiMode" defaultValue={current.aiMode} aria-label="Mode IA" disabled={!editor} className="h-10 w-full rounded-xl border px-3">
          <option value="disabled">Désactivée</option>
          <option value="manual">Manuelle</option>
          <option value="automatic">Automatique pour les scorecards qui l&apos;autorisent</option>
        </select>
        {editor ? <button type="submit" className="mt-4 h-10 rounded-xl bg-primary px-4 text-sm text-primary-foreground">Enregistrer</button> : null}
      </form>
    </div>
  )
}
