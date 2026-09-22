import { grantPlatformAdmin, revokePlatformAdmin } from "@/actions/platform"
import { requirePlatformAdmin } from "@/lib/platform/auth"
import { canPlatform } from "@/lib/platform/permissions"
import { createAdminClient } from "@/lib/supabase/admin"

export default async function PlatformAdminsPage() {
  const actor = await requirePlatformAdmin("platform.organizations.read")
  if (!canPlatform(actor, "platform.admins.manage")) return <p>Seul un super admin gère les comptes plateforme.</p>
  const admin = createAdminClient()
  const { data } = await admin.from("platform_admins").select("user_id, role, created_at").order("created_at")
  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl">Platform admins</h1>
      <ul className="rounded-3xl bg-white p-5 text-sm">
        {(data ?? []).map((row) => (
          <li key={row.user_id} className="flex items-center justify-between border-b py-2">
            <span>{row.user_id.slice(0, 8)} · {row.role}</span>
            <form action={revoke.bind(null, row.user_id)}><button className="underline" type="submit">Retirer</button></form>
          </li>
        ))}
      </ul>
      <form action={grant} className="grid gap-2 rounded-3xl bg-white p-5 sm:grid-cols-3">
        <input name="email" type="email" required placeholder="Email" className="h-10 rounded-lg border px-3" />
        <select name="role" className="h-10 rounded-lg border px-2">
          {["support", "operations", "finance", "super_admin"].map((role) => <option key={role}>{role}</option>)}
        </select>
        <button className="h-10 rounded-lg bg-[#16324F] text-[#f7f4ee]" type="submit">Enregistrer</button>
      </form>
    </div>
  )
}

async function grant(formData: FormData) {
  "use server"
  await grantPlatformAdmin(String(formData.get("email") ?? ""), String(formData.get("role") ?? ""))
}

async function revoke(userId: string) {
  "use server"
  await revokePlatformAdmin(userId)
}
