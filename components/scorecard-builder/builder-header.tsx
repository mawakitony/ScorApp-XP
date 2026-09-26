"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye } from "lucide-react"
import { toast } from "sonner"
import { restorePublishedDraft, undoDraft } from "@/actions/release"
import { PublishDialog } from "@/components/scorecard-builder/publish-dialog"
import { SaveIndicator } from "@/components/scorecard-builder/save-status"
import { StatusBadge } from "@/components/scorecard/status-badge"
import { Button } from "@/components/ui/button"
import type { BuilderStepId } from "@/lib/constants"
import type { SaveState } from "@/types/builder"
import type { ScorecardStatus } from "@/types/database"

export function BuilderHeader({
  name,
  status,
  save,
  scorecardId,
  publishedAt,
  unpublished,
  canUndo,
  onPreview,
  onFix,
}: {
  name: string
  status: ScorecardStatus
  save: SaveState
  scorecardId: string
  publishedAt: string | null
  unpublished: boolean
  canUndo: boolean
  onPreview: () => void
  onFix: (step: BuilderStepId) => void
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const publishedLabel = publishedAt
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(publishedAt))
    : null

  async function undo() {
    setPending(true)
    const result = await undoDraft(scorecardId)
    setPending(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    refreshFromServer(router)
  }

  async function restore() {
    setPending(true)
    const result = await restorePublishedDraft(scorecardId)
    setPending(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success("Brouillon rétabli sur la version publiée.")
    refreshFromServer(router)
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <Link href="/dashboard/scorecards" className="text-sm text-muted-foreground underline-offset-4 hover:underline">Retour aux scorecards</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-display truncate text-2xl">{name}</h1>
          <StatusBadge status={status} />
          {unpublished ? <span className="text-sm text-[#8d3b32]">Modifications non publiées</span> : null}
        </div>
        <div className="mt-1 min-h-5">
          <SaveIndicator state={save} />
          {publishedLabel ? <p className="text-sm text-muted-foreground">Dernière publication : {publishedLabel}</p> : null}
        </div>
      </div>
      <div className="flex max-w-full flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-10" disabled={pending || !canUndo} onClick={() => void undo()}>Annuler</Button>
        <Button type="button" variant="outline" className="h-10" disabled={pending || !publishedAt} onClick={() => void restore()}>Restaurer la version publiée</Button>
        <Button type="button" variant="outline" className="h-10" onClick={onPreview}>
          <Eye />
          Aperçu
        </Button>
        <PublishDialog scorecardId={scorecardId} onFix={onFix} />
      </div>
    </div>
  )
}

function refreshFromServer(router: { refresh: () => void }) {
  const url = new URL(window.location.href)
  url.searchParams.set("sync", "1")
  window.history.replaceState(null, "", `${url.pathname}${url.search}`)
  router.refresh()
}
