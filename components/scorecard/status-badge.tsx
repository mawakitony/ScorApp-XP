import { Badge } from "@/components/ui/badge"
import { STATUS_LABELS } from "@/lib/constants"
import type { ScorecardStatus } from "@/types/database"

const styles: Record<ScorecardStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-[#e5f2ea] text-[#1d6b45]",
  paused: "bg-[#f8ecd4] text-[#8a5a12]",
  archived: "bg-[#f6e4e1] text-[#8d3b32]",
}

export function StatusBadge({ status }: { status: ScorecardStatus }) {
  return (
    <Badge variant="secondary" className={styles[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}
