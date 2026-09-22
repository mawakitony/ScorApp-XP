"use client"

import { useState } from "react"
import { inviteMember, transferOwnership } from "@/actions/organization"

export function TeamPanel({ canTransfer, members }: { canTransfer: boolean; members: { userId: string; role: string }[] }) {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")

  async function invite(formData: FormData) {
    const result = await inviteMember(formData)
    setError("error" in result ? result.error ?? "" : "")
    setSent(!("error" in result))
  }

  return (
    <div className="space-y-4">
      <form action={invite} className="flex flex-wrap gap-2">
        <input name="email" type="email" required placeholder="email" className="h-11 rounded-xl border px-3" />
        <select name="role" className="h-11 rounded-xl border px-3" defaultValue="editor">
          <option value="admin">Admin</option>
          <option value="editor">Editor</option>
          <option value="analyst">Analyst</option>
          <option value="viewer">Viewer</option>
        </select>
        <button className="h-11 rounded-xl bg-[#16324F] px-4 text-sm text-[#f7f4ee]" type="submit">Inviter</button>
      </form>
      {sent ? <p className="text-sm">Invitation envoyée.</p> : null}
      {error ? <p className="text-sm">{error}</p> : null}
      {canTransfer ? members.filter((member) => member.role !== "owner").map((member) => (
        <form key={member.userId} action={async () => { await transferOwnership(member.userId) }}>
          <button className="text-sm underline" type="submit">Transférer la propriété à {member.role}</button>
        </form>
      )) : null}
    </div>
  )
}
