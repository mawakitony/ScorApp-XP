"use client"

import { createContext, useContext, useEffect, useState } from "react"
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

  const label = labelFor(state)

  return (
    <p className="text-sm text-muted-foreground" aria-live="polite">
      {label}
    </p>
  )
}

function labelFor(state: SaveState) {
  if (state.status === "saving") return "Saving..."
  if (state.status === "error") return "Échec de l'enregistrement"
  if (state.status !== "saved" || !state.savedAt) return ""
  const seconds = Math.round((Date.now() - state.savedAt) / 1000)
  if (seconds < 8) return "Saved"
  if (seconds < 60) return "Last saved just now"
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `Last saved ${minutes} min ago`
}
