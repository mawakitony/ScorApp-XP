import { saveOrganization } from "@/actions/organization"
import { can } from "@/lib/auth/permissions"
import { requireUser } from "@/lib/auth/session"
import { ensureMembership } from "@/lib/data/membership"
import { createClient } from "@/lib/supabase/server"

export const metadata = { title: "Organisation" }

export default async function OrganizationSettingsPage() {
  await requireUser()
  const membership = await ensureMembership()
  if (!membership || !can({ role: membership.role }, "team.manage")) return <p>Permission refusée.</p>
  const supabase = await createClient()
  const { data } = await supabase.from("organizations").select("name, slug, website, country, timezone, default_language, footer_text").eq("id", membership.organization.id).maybeSingle()
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="font-display text-4xl">Organisation</h1>
      <form action={async (formData) => { await saveOrganization(formData) }} className="space-y-3">
        <input name="name" defaultValue={data?.name ?? ""} className="h-11 w-full rounded-xl border px-3" />
        <input name="slug" defaultValue={data?.slug ?? ""} className="h-11 w-full rounded-xl border px-3" />
        <input name="website" defaultValue={data?.website ?? ""} placeholder="Site web" className="h-11 w-full rounded-xl border px-3" />
        <input name="country" defaultValue={data?.country ?? ""} placeholder="Pays" className="h-11 w-full rounded-xl border px-3" />
        <input name="timezone" defaultValue={data?.timezone ?? "UTC"} placeholder="Fuseau" className="h-11 w-full rounded-xl border px-3" />
        <select name="language" defaultValue={data?.default_language ?? "fr"} className="h-11 w-full rounded-xl border px-3">
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
        <input name="footer" defaultValue={data?.footer_text ?? ""} placeholder="Pied de page" className="h-11 w-full rounded-xl border px-3" />
        <button className="h-11 rounded-xl bg-[#16324F] px-4 text-sm text-[#f7f4ee]" type="submit">Enregistrer</button>
      </form>
    </div>
  )
}
