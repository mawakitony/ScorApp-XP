"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { saveStatusLabel } from "@/lib/ui/feedback"
import type { SaveState } from "@/types/builder"

const SaveReporterContext = createContext<(state: SaveState) => void>(() => {})

export function SaveReporterProvider({
  report,
  children,
}: {
  report: (state: SaveState) => void
  children: React.ReactNode
}) {
  return <SaveReporterContext.Provider value={report}>{children}</SaveReporterContext.Provider>
}

export function useSaveReporter() {
  return useContext(SaveReporterContext)
}

export function SaveIndicator({ state }: { state: SaveState }) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (state.status !== "saved" || !state.savedAt) return
    const timer = window.setInterval(() => setTick((value) => value + 1), 10000)
    return () => window.clearInterval(timer)
  }, [state.savedAt, state.status])

  const label = saveStatusLabel(state)

  return (
    <p className="text-sm text-muted-foreground" aria-live="polite">
      {label}
    </p>
  )
}

