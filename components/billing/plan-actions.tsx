"use client"

import { useState } from "react"
import { openBillingPortal, startCheckout } from "@/actions/billing"
import type { BillingInterval, PlanId } from "@/lib/billing/plans"

export function PlanActions({ plan, interval }: { plan: PlanId; interval: BillingInterval }) {
  const [error, setError] = useState("")
  async function checkout() {
    const result = await startCheckout(plan, interval)
    if ("url" in result && result.url) window.location.href = result.url
    else setError("error" in result ? result.error ?? "Billing information is temporarily unavailable." : "Billing information is temporarily unavailable.")
  }
  return (
    <div>
      <button type="button" className="underline" onClick={() => void checkout()}>Upgrade</button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

export function PortalButton() {
  const [error, setError] = useState("")
  async function open() {
    const result = await openBillingPortal()
    if ("url" in result && result.url) window.location.href = result.url
    else setError("error" in result ? result.error ?? "Billing information is temporarily unavailable." : "Billing information is temporarily unavailable.")
  }
  return (
    <div>
      <button type="button" className="inline-flex h-11 items-center rounded-xl bg-[#16324F] px-4 text-sm text-[#f7f4ee]" onClick={() => void open()}>Manage billing</button>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
