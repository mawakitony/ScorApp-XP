import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { requireUser } from "@/lib/auth/session"
import { ensureMembership } from "@/lib/data/membership"
import { signOut } from "@/actions/auth"
import { Button } from "@/components/ui/button"

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
        <h1 className="font-display text-4xl">Accès non autorisé</h1>
        <p className="mt-3 text-muted-foreground">
          {user.email} n&apos;est pas membre de WOLOYEM. Demandez une invitation à un administrateur, puis reconnectez-vous.
        </p>
        <form action={signOut} className="mt-6">
          <Button type="submit" variant="outline">
            Se déconnecter
          </Button>
        </form>
      </div>
    )
  }

  return (
    <DashboardShell
      email={user.email ?? ""}
      fullName={typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : null}
      organizationName={membership.organization.name}
    >
      {children}
    </DashboardShell>
  )
}
