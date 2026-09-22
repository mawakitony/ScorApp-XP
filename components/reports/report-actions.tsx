"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createReportShare, regenerateLeadReport, retryReport, revokeReportShare } from "@/actions/reports"

export function ReportActions({
  reportId,
  sessionId,
  shares,
}: {
  reportId: string
  sessionId: string
  shares: { id: string; expires_at: string; revoked_at: string | null }[]
}) {
  const router = useRouter()
  const [token, setToken] = useState("")
  const [error, setError] = useState("")

  async function run(action: Promise<{ error?: string; token?: string }>) {
    const result = await action
    setError(result.error ?? "")
    if (result.token) setToken(result.token)
    if (!result.error) router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="underline" onClick={() => void run(regenerateLeadReport(sessionId, "participant"))}>Nouvelle version</button>
      <button type="button" className="underline" onClick={() => void run(regenerateLeadReport(sessionId, "admin"))}>Rapport interne</button>
      <button type="button" className="underline" onClick={() => void run(createReportShare(reportId, 1))}>Lien 1 jour</button>
      <button type="button" className="underline" onClick={() => void run(createReportShare(reportId, 7))}>Lien 7 jours</button>
      <button type="button" className="underline" onClick={() => void run(createReportShare(reportId, 30))}>Lien 30 jours</button>
      <button type="button" className="underline" onClick={() => void run(retryReport(reportId))}>Réessayer</button>
      {shares.filter((share) => !share.revoked_at).map((share) => (
        <button key={share.id} type="button" className="underline" onClick={() => void run(revokeReportShare(share.id))}>Révoquer</button>
      ))}
      {token ? <span className="font-mono text-xs">/r/{token}</span> : null}
      {error ? <span className="text-destructive">{error}</span> : null}
    </div>
  )
}
