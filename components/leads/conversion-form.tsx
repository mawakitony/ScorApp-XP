"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { markLeadConverted } from "@/actions/conversions"
import { CONVERSION_TYPES } from "@/lib/integrations/version"

export function ConversionForm({ leadId }: { leadId: string }) {
  const router = useRouter()
  const [error, setError] = useState("")

  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="font-medium">Marquer comme converti</h2>
      <p className="mt-1 text-sm text-muted-foreground">Conversion réelle, distincte d&apos;un clic CTA.</p>
      {error ? <p className="mt-2 text-sm text-destructive" role="alert">{error}</p> : null}
      <form className="mt-3 grid gap-2" onSubmit={async (event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const result = await markLeadConverted({
          leadId,
          conversionType: String(data.get("type") ?? "manual"),
          value: String(data.get("value") ?? ""),
          currency: String(data.get("currency") ?? ""),
          reference: String(data.get("reference") ?? ""),
          comment: String(data.get("comment") ?? ""),
        })
        setError(result.error ?? "")
        if (!result.error) router.refresh()
      }}>
        <select name="type" aria-label="Type de conversion" className="h-10 rounded-lg border px-2">
          {CONVERSION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input name="value" inputMode="decimal" placeholder="Valeur" aria-label="Valeur" className="h-10 rounded-lg border px-3" />
          <input name="currency" maxLength={3} placeholder="XOF" aria-label="Devise" className="h-10 rounded-lg border px-3" />
        </div>
        <input name="reference" placeholder="Référence" aria-label="Référence" className="h-10 rounded-lg border px-3" />
        <input name="comment" placeholder="Commentaire" aria-label="Commentaire" className="h-10 rounded-lg border px-3" />
        <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm text-primary-foreground">Marquer comme converti</button>
      </form>
    </section>
  )
}
