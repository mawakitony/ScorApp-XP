import { Skeleton } from "@/components/ui/skeleton"

export default function ScorecardAnalyticsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-72" />
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  )
}
