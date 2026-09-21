"use client"

import { BUILDER_STEPS, type BuilderStepId } from "@/lib/constants"
import { cn } from "@/lib/utils"

export function BuilderSidebar({
  step,
  onChange,
}: {
  step: BuilderStepId
  onChange: (step: BuilderStepId) => void
}) {
  return (
    <aside className="rounded-2xl border bg-card p-3">
      <p className="px-3 py-2 text-xs tracking-[0.16em] text-muted-foreground uppercase">Builder</p>
      <nav className="flex gap-2 overflow-x-auto lg:flex-col" aria-label="Étapes du builder">
        {BUILDER_STEPS.map((item, index) => (
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
