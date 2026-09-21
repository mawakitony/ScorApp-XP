import { Skeleton } from "@/components/ui/skeleton"

export default function LeadsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-48" />
      <div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-10 rounded-lg" />)}</div>
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  )
}
