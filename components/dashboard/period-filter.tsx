"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"

const options = [
  { id: "today", label: "Aujourd'hui" },
  { id: "7d", label: "7 jours" },
  { id: "30d", label: "30 jours" },
  { id: "90d", label: "90 jours" },
  { id: "custom", label: "Période" },
] as const

export function PeriodFilter({
  range,
  from,
  to,
}: {
  range: string
  from: string
  to: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function push(next: URLSearchParams) {
    router.push(`${pathname}?${next.toString()}`)
  }

  function select(id: string) {
    const next = new URLSearchParams(searchParams.toString())
    next.set("range", id)
    if (id !== "custom") {
      next.delete("from")
      next.delete("to")
    }
    push(next)
  }

  function applyCustom(formData: FormData) {
    const next = new URLSearchParams()
    next.set("range", "custom")
    next.set("from", String(formData.get("from") ?? from))
    next.set("to", String(formData.get("to") ?? to))
    push(next)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant={range === option.id ? "default" : "outline"}
            onClick={() => select(option.id)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {range === "custom" ? (
        <form action={applyCustom} className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="h-9 rounded-lg border bg-card px-2 text-sm"
            aria-label="Date de début"
          />
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="h-9 rounded-lg border bg-card px-2 text-sm"
            aria-label="Date de fin"
          />
          <Button type="submit" size="sm" variant="secondary">
            Appliquer
          </Button>
        </form>
      ) : null}
    </div>
  )
}
