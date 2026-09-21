export function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed bg-card/60 px-6 py-10 text-center">
      <p className="font-display text-xl">{title}</p>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
