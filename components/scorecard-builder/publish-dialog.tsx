"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { loadPublishReport, publishScorecard } from "@/actions/publish"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { PublishCheck } from "@/lib/assessment/publish"

export function PublishDialog({ scorecardId }: { scorecardId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [checks, setChecks] = useState<PublishCheck[] | null>(null)
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState(false)

  async function openReport() {
    setOpen(true)
    setChecks(null)
    const report = await loadPublishReport(scorecardId)
    if (report.error) {
      toast.error(report.error)
      setChecks([])
      setReady(false)
      return
    }
    setChecks(report.checks)
    setReady(report.ready)
  }

  async function publish() {
    setPending(true)
    const result = await publishScorecard(scorecardId)
    setPending(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success("Scorecard publiée.")
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <Button type="button" className="h-10" onClick={() => void openReport()}>
        Publish
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{ready ? "Ready to publish?" : "Cannot publish"}</DialogTitle>
            <DialogDescription>
              {ready ? "La scorecard pourra être ouverte par les visiteurs." : "Corrigez les points suivants avant la publication."}
            </DialogDescription>
          </DialogHeader>
          {checks === null ? <p className="text-sm text-muted-foreground">Vérification...</p> : null}
          <ul className="space-y-2 text-sm">
            {(checks ?? []).map((check) => (
              <li key={check.id}>
                <p>
                  {check.ok ? "✓" : "–"} {check.label}
                </p>
                {!check.ok && check.detail ? <p className="pl-4 text-destructive">{check.detail}</p> : null}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Fermer
            </Button>
            <Button type="button" disabled={!ready || pending} onClick={() => void publish()}>
              {pending ? "Publication..." : "Publier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
