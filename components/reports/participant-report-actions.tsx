"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { retryOwnReport, shareOwnReport } from "@/actions/reports"

export function ParticipantReportActions({
  slug,
  failed,
  english,
}: {
  slug: string
  failed: boolean
  english: boolean
}) {
  const router = useRouter()
  const [token, setToken] = useState("")
  const [error, setError] = useState("")
  const [days, setDays] = useState<1 | 7 | 30>(7)

  async function share() {
    const result = await shareOwnReport(slug, days)
    setError("error" in result ? result.error ?? "" : "")
    if ("token" in result && result.token) setToken(result.token)
  }

  async function retry() {
    const result = await retryOwnReport(slug)
    setError("error" in result ? result.error ?? "" : "")
    if (!("error" in result)) router.refresh()
  }

  return (
    <div className="report-actions mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-5 pb-10 text-sm text-[#16324F]">
      <label className="flex items-center gap-2">
        <span>{english ? "Share for" : "Partager pendant"}</span>
        <select
          className="rounded-lg border border-[#d9d1c3] bg-white px-2 py-1"
          value={days}
          onChange={(event) => setDays(Number(event.target.value) as 1 | 7 | 30)}
        >
          <option value={1}>{english ? "1 day" : "1 jour"}</option>
          <option value={7}>{english ? "7 days" : "7 jours"}</option>
          <option value={30}>{english ? "30 days" : "30 jours"}</option>
        </select>
      </label>
      <button type="button" className="underline" onClick={() => void share()}>
        {english ? "Create link" : "Créer un lien"}
      </button>
      {failed ? (
        <button type="button" className="underline" onClick={() => void retry()}>
          {english ? "Try again" : "Réessayer"}
        </button>
      ) : null}
      {token ? <span className="font-mono text-xs">/r/{token}</span> : null}
      {error ? <span>{english ? "This action could not be completed." : error}</span> : null}
    </div>
  )
}
