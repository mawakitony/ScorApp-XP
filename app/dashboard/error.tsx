"use client"

import { Button } from "@/components/ui/button"

export default function DashboardError({
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div className="rounded-2xl border bg-card p-8">
      <h1 className="font-display text-3xl">Impossible de charger cette page</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Vérifiez la connexion à Supabase, puis réessayez.
      </p>
      <Button className="mt-6" onClick={reset}>
        Réessayer
      </Button>
    </div>
  )
}
