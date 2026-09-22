import { endSupportSession } from "@/actions/platform"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { requireUser } from "@/lib/auth/session"
import { ensureMembership } from "@/lib/data/membership"
import { isPlatformAdmin } from "@/lib/platform/auth"
import { activeSuspension, readSupportSession } from "@/lib/platform/data"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { signOut } from "@/actions/auth"
import { Button } from "@/components/ui/button"

async function MaintenanceBanner() {
  const message = await maintenanceMessage()
  if (!message) return null
  return <p className="mb-4 rounded-xl border px-4 py-3 text-sm">{message}</p>
}

async function maintenanceMessage() {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("platform_settings").select("maintenance_message").eq("id", 1).maybeSingle()
    return data?.maintenance_message ?? null
  } catch {
    return null
  }
}

export const dynamic = "force-dynamic"

export const metadata = {
  robots: { index: false, follow: false },
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const membership = await ensureMembership()

  if (!membership) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
        <h1 className="font-display text-4xl">Créer votre espace</h1>
        <p className="mt-3 text-muted-foreground">
          {user.email} n&apos;appartient encore à aucune organisation. Créez la vôtre, ou acceptez une invitation.
        </p>
        <a href="/onboarding" className="mt-6 inline-flex h-11 items-center rounded-xl bg-[#16324F] px-4 text-sm text-[#f7f4ee]">Créer une organisation</a>
        <form action={signOut} className="mt-6">
          <Button type="submit" variant="outline">
            Se déconnecter
          </Button>
        </form>
      </div>
    )
  }

  const suspension = await activeSuspension(membership.organization.id)
  if (suspension) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
        <h1 className="font-display text-4xl">Espace temporairement indisponible</h1>
        <p className="mt-3 text-muted-foreground">Vos données sont conservées. Réessayez plus tard.</p>
      </div>
    )
  }

  const platform = await isPlatformAdmin()
  const support = platform ? await readSupportSession(platform.userId) : null
  const supabase = await createClient()
  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, title, message, read_at, created_at")
    .eq("organization_id", membership.organization.id)
    .order("created_at", { ascending: false })
    .limit(8)

  return (
    <DashboardShell
      email={user.email ?? ""}
      fullName={typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : null}
      organizationName={membership.organization.name}
      notifications={(notifications ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        message: item.message,
        createdAt: item.created_at,
        read: Boolean(item.read_at),
      }))}
    >
      {support ? (
        <form action={endSupportSession} className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-[#8a7340] px-4 py-3 text-sm text-[#f7f4ee]">
          <strong>SUPPORT MODE — Viewing {support.organization.name}</strong>
          <button type="submit">Exit support mode</button>
        </form>
      ) : null}
      {platform ? <a className="mb-4 inline-block text-sm underline" href="/platform">WOLOYEM Platform Admin</a> : null}
      <MaintenanceBanner />
      {children}
    </DashboardShell>
  )
}
