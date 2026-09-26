"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useSaveReporter } from "@/components/scorecard-builder/save-status"
import type { SaveState } from "@/types/builder"

type SaveResult = { error?: string; quiet?: boolean }

export function useAutosave<T>(value: T, save: (value: T) => Promise<SaveResult>, epoch = 0) {
  const report = useSaveReporter()
  const saveRef = useRef(save)
  const valueRef = useRef(value)
  const skip = useRef(true)
  const dirty = useRef(false)
  const seenEpoch = useRef(epoch)
  const ignore = useRef<string | null>(null)
  const [state, setState] = useState<SaveState>({ status: "idle", savedAt: null })
  const serialized = JSON.stringify(value)

  useEffect(() => {
    saveRef.current = save
    valueRef.current = value
  })

  useEffect(() => {
    if (state.status === "idle") return
    report(state)
  }, [report, state])

  useEffect(() => {
    if (skip.current) {
      skip.current = false
      return
    }
    if (seenEpoch.current !== epoch) {
      seenEpoch.current = epoch
      ignore.current = serialized
      dirty.current = false
      return
    }
    if (ignore.current === serialized) {
      ignore.current = null
      return
    }

    dirty.current = true
    setState((current) => ({ ...current, status: "saving" }))
    const timer = window.setTimeout(() => {
      void saveRef.current(valueRef.current).then((result) => {
        dirty.current = false
        if (result.error) {
          if (!result.quiet) toast.error(result.error)
          setState((current) => ({ ...current, status: "error" }))
          return
        }
        setState({ status: "saved", savedAt: Date.now() })
      })
    }, 700)

    return () => window.clearTimeout(timer)
  }, [epoch, serialized])

  useEffect(() => {
    return () => {
      if (!dirty.current) return
      dirty.current = false
      void saveRef.current(valueRef.current)
    }
  }, [])

  return state
}
