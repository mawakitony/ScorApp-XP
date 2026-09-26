"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { startAssessment } from "@/actions/assessment"

export function StartAssessmentButton({
  slug,
  label,
  color,
}: {
  slug: string
  label: string
  color: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  return (
    <form
      className="mt-8"
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        setPending(true)
        setError("")
        void startAssessment({
          slug,
          honeypot: String(data.get("company_website") ?? ""),
          referrer: document.referrer,
          utmSource: params.get("utm_source") ?? "",
          utmMedium: params.get("utm_medium") ?? "",
          utmCampaign: params.get("utm_campaign") ?? "",
          utmContent: params.get("utm_content") ?? "",
          utmTerm: params.get("utm_term") ?? "",
        }).then((result) => {
          if ("error" in result && result.error) {
            setError(result.error)
            setPending(false)
            return
          }
          if ("href" in result && result.href) router.push(result.href)
        })
      }}
    >
      <input name="company_website" tabIndex={-1} autoComplete="off" className="absolute h-0 w-0 opacity-0" aria-hidden="true" suppressHydrationWarning />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 items-center justify-center rounded-xl px-6 text-base text-white disabled:opacity-60"
        style={{ background: color }}
      >
        {pending ? "Ouverture..." : label || "Commencer"}
      </button>
      {error ? <p className="mt-3 text-sm text-[#8d3b32]" role="alert">{error}</p> : null}
    </form>
  )
}
