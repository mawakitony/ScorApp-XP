"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Copy, Eye, MoreHorizontal, Pause, Pencil, Play, Share2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { deleteScorecard, duplicateScorecard, setScorecardStatus } from "@/actions/scorecards"
import { StatusBadge } from "@/components/scorecard/status-badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { getAppUrl } from "@/lib/env"
import { formatDate, formatNumber, formatPercent } from "@/lib/format"
import type { ScorecardListItem } from "@/lib/data/scorecards"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function ScorecardsTable({ items }: { items: ScorecardListItem[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Visiteurs</TableHead>
              <TableHead>Participants</TableHead>
              <TableHead>Résultats</TableHead>
              <TableHead>Conversion</TableHead>
              <TableHead>Créée le</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <a href={`/dashboard/scorecards/${item.id}`} className="font-medium hover:underline">
                    {item.name}
                  </a>
                  <p className="text-xs text-muted-foreground">/s/{item.slug}</p>
                </TableCell>
                <TableCell>
                  <StatusBadge status={item.status} />
                </TableCell>
                <TableCell>{formatNumber(item.visitors)}</TableCell>
                <TableCell>{formatNumber(item.participants)}</TableCell>
                <TableCell>{formatNumber(item.results)}</TableCell>
                <TableCell>{formatPercent(item.conversionRate)}</TableCell>
                <TableCell>{formatDate(item.created_at)}</TableCell>
                <TableCell>
                  <ScorecardActions item={item} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 md:hidden">
        {items.map((item) => (
          <article key={item.id} className="rounded-2xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <a href={`/dashboard/scorecards/${item.id}`} className="font-medium">
                  {item.name}
                </a>
                <p className="text-xs text-muted-foreground">/s/{item.slug}</p>
              </div>
              <ScorecardActions item={item} />
            </div>
            <div className="mt-3">
              <StatusBadge status={item.status} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Metric label="Visiteurs" value={formatNumber(item.visitors)} />
              <Metric label="Participants" value={formatNumber(item.participants)} />
              <Metric label="Résultats" value={formatNumber(item.results)} />
              <Metric label="Conversion" value={formatPercent(item.conversionRate)} />
            </dl>
          </article>
        ))}
      </div>
    </>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function ScorecardActions({ item }: { item: ScorecardListItem }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const paused = item.status === "paused" || item.status === "archived"
  const publicUrl = `${getAppUrl()}/s/${item.slug}`

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions pour ${item.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => router.push(`/dashboard/scorecards/${item.id}/builder`)}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => window.open(`${publicUrl}?preview=1`, "_blank", "noopener,noreferrer")}>
            <Eye /> Preview
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push(`/dashboard/scorecards/${item.id}/results`)}>
            Results
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              void duplicateScorecard(item.id).then((result) => {
                if (result.error) toast.error(result.error)
                else {
                  toast.success("Scorecard dupliquée.")
                  router.refresh()
                }
              })
            }}
          >
            <Copy /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              void navigator.clipboard.writeText(publicUrl).then(() => toast.success("Lien copié."))
            }}
          >
            <Share2 /> Share
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              void setScorecardStatus(item.id, paused ? "published" : "paused").then((result) => {
                if (result.error) toast.error(result.error)
                else {
                  toast.success(paused ? "Scorecard réactivée." : "Scorecard mise en pause.")
                  router.refresh()
                }
              })
            }}
          >
            {paused ? <Play /> : <Pause />}
            {paused ? "Enable" : "Disable"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setOpen(true)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette scorecard ?</AlertDialogTitle>
            <AlertDialogDescription>
              {item.name} et ses questions, résultats et pages associés seront supprimés. Cette action est définitive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                void deleteScorecard(item.id)
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
