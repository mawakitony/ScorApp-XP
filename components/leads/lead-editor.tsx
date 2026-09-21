"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { addLeadNote, assignLeadTag, changeLeadStatus, createLeadTag, deleteLeadTag, removeLeadTag, renameLeadTag } from "@/actions/leads"
import { LEAD_STATUSES } from "@/lib/leads/qualification"

const statusLabel: Record<string, string> = {
  new: "Nouveau",
  contacted: "Contacté",
  qualified: "Qualifié",
  nurturing: "Nurturing",
  converted: "Converti",
  lost: "Perdu",
}

export function LeadEditor({
  leadId,
  status,
  tags,
  catalog,
  canEdit,
}: {
  leadId: string
  status: string
  tags: { id: string; name: string; color: string }[]
  catalog: { id: string; name: string; color: string }[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState("")
  if (!canEdit) return null

  async function run(action: Promise<{ error?: string }>) {
    const result = await action
    setError(result.error ?? "")
    if (!result.error) router.refresh()
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <select aria-label="Changer le statut" className="h-10 rounded-lg border bg-card px-3 text-sm" value={status} onChange={(event) => void run(changeLeadStatus(leadId, event.target.value))}>
          {LEAD_STATUSES.map((item) => <option key={item} value={item}>{statusLabel[item]}</option>)}
        </select>
        <select aria-label="Ajouter un tag" className="h-10 rounded-lg border bg-card px-3 text-sm" defaultValue="" onChange={(event) => { if (event.target.value) void run(assignLeadTag(leadId, event.target.value)) }}>
          <option value="">Ajouter un tag</option>
          {catalog.filter((tag) => !tags.some((current) => current.id === tag.id)).map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
        </select>
        <a className="inline-flex h-10 items-center rounded-lg border px-3 text-sm" href={`/dashboard/leads/export?ids=${leadId}`}>Exporter</a>
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <button key={tag.id} type="button" className="rounded-full px-3 py-1 text-xs text-white" style={{ background: tag.color }} onClick={() => void run(removeLeadTag(leadId, tag.id))}>
            {tag.name} ×
          </button>
        ))}
      </div>
      <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void run(addLeadNote(leadId, String(data.get("content") ?? ""))); event.currentTarget.reset() }}>
        <label className="text-sm" htmlFor="note">Note interne</label>
        <textarea id="note" name="content" maxLength={5000} rows={4} className="w-full rounded-xl border bg-card p-3 text-sm" placeholder="Visible uniquement par l'équipe." />
        <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm text-primary-foreground">Ajouter la note</button>
      </form>
    </div>
  )
}

export function TagManager({ tags }: { tags: { id: string; name: string; color: string }[] }) {
  const router = useRouter()
  const [error, setError] = useState("")

  async function run(action: Promise<{ error?: string }>) {
    const result = await action
    setError(result.error ?? "")
    if (!result.error) router.refresh()
  }

  return (
    <section id="tags" className="rounded-2xl border bg-card p-5">
      <h2 className="font-medium">Tags</h2>
      {error ? <p className="mt-2 text-sm text-destructive" role="alert">{error}</p> : null}
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void run(createLeadTag(String(data.get("name") ?? ""), String(data.get("color") ?? "#16324F"))); event.currentTarget.reset() }}>
        <input name="name" maxLength={50} required aria-label="Nom du tag" placeholder="Nouveau tag" className="h-10 rounded-lg border px-3 text-sm" />
        <input name="color" type="color" defaultValue="#16324F" aria-label="Couleur du tag" className="h-10 w-14 rounded-lg border bg-card" />
        <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm text-primary-foreground">Créer</button>
      </form>
      <ul className="mt-4 space-y-2">
        {tags.map((tag) => (
          <li key={tag.id} className="flex flex-wrap items-center gap-2 text-sm">
            <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void run(renameLeadTag(tag.id, String(data.get("name") ?? ""), String(data.get("color") ?? tag.color))) }}>
              <input name="name" defaultValue={tag.name} maxLength={50} aria-label={`Renommer ${tag.name}`} className="h-9 rounded-lg border px-2" />
              <input name="color" type="color" defaultValue={tag.color} aria-label={`Couleur de ${tag.name}`} className="h-9 w-12 rounded-lg border" />
              <button type="submit" className="underline">Renommer</button>
            </form>
            <button type="button" className="text-destructive underline" onClick={() => void run(deleteLeadTag(tag.id))}>Supprimer</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
