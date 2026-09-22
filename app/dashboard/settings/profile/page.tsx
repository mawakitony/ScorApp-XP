import { ProfileForm } from "@/components/settings/settings-forms"
import { requireUser } from "@/lib/auth/session"

export const metadata = { title: "Profil" }

export default async function ProfileSettingsPage() {
  const user = await requireUser()
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="font-display text-4xl">Profil</h1>
      <p className="text-sm text-muted-foreground">{user.email}</p>
      <ProfileForm fullName={typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : ""} />
    </div>
  )
}