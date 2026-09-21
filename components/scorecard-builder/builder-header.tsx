"use client"

import { Eye } from "lucide-react"
import { PublishDialog } from "@/components/scorecard-builder/publish-dialog"
import { SaveIndicator } from "@/components/scorecard-builder/save-status"
import { StatusBadge } from "@/components/scorecard/status-badge"
import { Button } from "@/components/ui/button"
import type { SaveState } from "@/types/builder"
import type { ScorecardStatus } from "@/types/database"

export function BuilderHeader({
  name,
  status,
  save,
  scorecardId,
  onPreview,
}: {
  name: string
  status: ScorecardStatus
  save: SaveState
  scorecardId: string
  onPreview: () => void
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display truncate text-2xl">{name}</h1>
          <StatusBadge status={status} />
        </div>
        <div className="mt-1 min-h-5">
          <SaveIndicator state={save} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="h-10" onClick={onPreview}>
          <Eye />
          Preview
        </Button>
        <PublishDialog scorecardId={scorecardId} />
      </div>
    </div>
  )
}
