import { InviteForm, ProfileForm, RemoveMemberButton } from "@/components/settings/settings-forms"
import { canEdit, requireUser } from "@/lib/auth/session"
import { ensureMembership, listMembers } from "@/lib/data/membership"

export const metadata = { title: "Settings" }

const roleLabels = { owner: "Propriétaire", admin: "Administrateur", member: "Membre" }

export default async function SettingsPage() {
  const user = await requireUser()
  const membership = await ensureMembership()
  if (!membership) return null
  const members = await listMembers(membership.organization.id)
  const editor = canEdit(membership.role)

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">{membership.organization.name}</p>
        <h1 className="font-display text-4xl">Settings</h1>
      </div>

      <section className="rounded-3xl border bg-card p-6">
        <h2 className="font-display text-2xl">Profil</h2>
        <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
        <div className="mt-6">
          <ProfileForm fullName={typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : ""} />
        </div>
      </section>

      <section className="rounded-3xl border bg-card p-6">
        <h2 className="font-display text-2xl">Organisation</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Nom</dt>
            <dd>{membership.organization.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Slug</dt>
            <dd>{membership.organization.slug}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Votre rôle</dt>
            <dd>{roleLabels[membership.role]}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-3xl border bg-card p-6">
        <h2 className="font-display text-2xl">Membres</h2>
        <ul className="mt-4 divide-y">
          {members.map((member) => (
            <li key={member.userId} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p>{member.fullName || "Membre"}</p>
                <p className="text-muted-foreground">{member.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <span>{roleLabels[member.role]}</span>
                {editor && member.role !== "owner" && member.userId !== user.id ? (
                  <RemoveMemberButton userId={member.userId} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {editor ? (
          <div className="mt-6">
            <p className="mb-3 text-sm text-muted-foreground">
              La personne doit déjà avoir créé un compte. Le rôle propriétaire reste unique.
            </p>
            <InviteForm />
          </div>
        ) : null}
      </section>
    </div>
  )
}
