import { TeamPanel } from "@/components/settings/team-panel"
import { can } from "@/lib/auth/permissions"
import { requireUser } from "@/lib/auth/session"
import { ensureMembership, listMembers } from "@/lib/data/membership"

export const metadata = { title: "Équipe" }

export default async function TeamPage() {
  const user = await requireUser()
  const membership = await ensureMembership()
  if (!membership || !can({ role: membership.role }, "team.manage")) return <p>Permission refusée.</p>
  const members = await listMembers(membership.organization.id)
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-4xl">Équipe</h1>
      <ul className="divide-y rounded-3xl border bg-card">
        {members.map((member) => (
          <li key={member.userId} className="flex items-center justify-between px-5 py-3 text-sm">
            <span>{member.fullName || member.email || "Membre"} {member.userId === user.id ? "(vous)" : ""}</span>
            <span>{member.role}</span>
          </li>
        ))}
      </ul>
      <TeamPanel canTransfer={can({ role: membership.role }, "ownership.transfer")} members={members.map((member) => ({ userId: member.userId, role: member.role }))} />
    </div>
  )
}
