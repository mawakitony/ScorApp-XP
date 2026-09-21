import type { LucideIcon } from "lucide-react"

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: string
  hint: string
  icon: LucideIcon
}) {
  return (
    <article className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-primary">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="font-display mt-4 text-3xl tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </article>
  )
}
