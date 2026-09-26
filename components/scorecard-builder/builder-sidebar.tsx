"use client"

import { BUILDER_STEPS, type BuilderStepId } from "@/lib/constants"
import { cn } from "@/lib/utils"

export function BuilderSidebar({
  step,
  mode,
  onMode,
  onChange,
}: {
  step: BuilderStepId
  mode: "simple" | "advanced"
  onMode: (mode: "simple" | "advanced") => void
  onChange: (step: BuilderStepId) => void
}) {
  const visible = mode === "simple" ? BUILDER_STEPS.filter((item) => item.id !== "categories" && item.id !== "scoring") : BUILDER_STEPS
  return (
    <aside className="min-w-0 max-w-full rounded-2xl border bg-card p-3">
      <p className="px-3 py-2 text-xs tracking-[0.16em] text-muted-foreground uppercase">Builder</p>
      <div className="mb-2 grid grid-cols-2 gap-1 px-1">
        <button type="button" className={cn("rounded-lg px-2 py-1 text-xs", mode === "simple" ? "bg-primary text-primary-foreground" : "hover:bg-muted")} onClick={() => onMode("simple")}>Mode simple</button>
        <button type="button" className={cn("rounded-lg px-2 py-1 text-xs", mode === "advanced" ? "bg-primary text-primary-foreground" : "hover:bg-muted")} onClick={() => onMode("advanced")}>Mode avancé</button>
      </div>
      <nav className="flex min-w-0 gap-2 overflow-x-auto lg:flex-col" aria-label="Étapes du builder">
        {visible.map((item, index) => (
          <button
            key={item.id}
            type="button"
            aria-current={step === item.id ? "step" : undefined}
            className={cn(
              "rounded-xl px-3 py-2 text-left text-sm whitespace-nowrap",
              step === item.id ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
            onClick={() => onChange(item.id)}
          >
            {index + 1}. {item.label}
          </button>
        ))}
      </nav>
    </aside>
  )
}
