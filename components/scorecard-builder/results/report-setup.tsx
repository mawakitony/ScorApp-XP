"use client"

import { useState } from "react"
import { saveReportSetup } from "@/actions/reports"

export function ReportSetup({
  scorecardId,
  categories,
}: {
  scorecardId: string
  categories: { id: string; name: string; highMessage: string; mediumMessage: string; lowMessage: string }[]
}) {
  const [message, setMessage] = useState("")
  return (
    <form className="space-y-4 rounded-3xl border bg-card p-6" onSubmit={async (event) => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      const result = await saveReportSetup({
        scorecardId,
        enabled: data.get("enabled") === "on",
        pdf: data.get("pdf") === "on",
        categories: data.get("categories") === "on",
        strengths: data.get("strengths") === "on",
        improvements: data.get("improvements") === "on",
        cta: data.get("cta") === "on",
        disclaimer: data.get("disclaimer") === "on",
        aiMode: String(data.get("aiMode") ?? "disabled"),
        messages: categories.map((category) => ({
          id: category.id,
          high: String(data.get(`high-${category.id}`) ?? ""),
          medium: String(data.get(`medium-${category.id}`) ?? ""),
          low: String(data.get(`low-${category.id}`) ?? ""),
        })),
        rule: {
          categoryId: String(data.get("ruleCategory") ?? ""),
          operator: String(data.get("ruleOp") ?? "lt"),
          threshold: String(data.get("ruleThreshold") ?? ""),
          message: String(data.get("ruleMessage") ?? ""),
        },
      })
      setMessage(result.error ?? "Enregistré")
    }}>
      <h3 className="font-display text-2xl">Report</h3>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <label className="flex gap-2"><input type="checkbox" name="enabled" defaultChecked /> Activer le rapport participant</label>
        <label className="flex gap-2"><input type="checkbox" name="pdf" defaultChecked /> Activer le PDF</label>
        <label className="flex gap-2"><input type="checkbox" name="categories" defaultChecked /> Catégories</label>
        <label className="flex gap-2"><input type="checkbox" name="strengths" defaultChecked /> Forces</label>
        <label className="flex gap-2"><input type="checkbox" name="improvements" defaultChecked /> Axes d&apos;amélioration</label>
        <label className="flex gap-2"><input type="checkbox" name="cta" defaultChecked /> CTA</label>
        <label className="flex gap-2"><input type="checkbox" name="disclaimer" defaultChecked /> Disclaimer</label>
      </div>
      <label className="block text-sm">Analyse IA
        <select name="aiMode" defaultValue="disabled" className="mt-1 h-10 w-full rounded-xl border px-3">
          <option value="disabled">Désactivée</option>
          <option value="manual">Manuelle</option>
          <option value="automatic">Automatique</option>
        </select>
      </label>
      {categories.map((category) => (
        <fieldset key={category.id} className="grid gap-2">
          <legend className="text-sm font-medium">{category.name}</legend>
          <input name={`high-${category.id}`} defaultValue={category.highMessage} placeholder="Message élevé" aria-label={`Message élevé ${category.name}`} className="h-10 rounded-xl border px-3" />
          <input name={`medium-${category.id}`} defaultValue={category.mediumMessage} placeholder="Message moyen" aria-label={`Message moyen ${category.name}`} className="h-10 rounded-xl border px-3" />
          <input name={`low-${category.id}`} defaultValue={category.lowMessage} placeholder="Message bas" aria-label={`Message bas ${category.name}`} className="h-10 rounded-xl border px-3" />
        </fieldset>
      ))}
      <div className="grid gap-2 sm:grid-cols-4">
        <select name="ruleCategory" aria-label="Catégorie de la règle" className="h-10 rounded-xl border px-3">
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <select name="ruleOp" aria-label="Opérateur" className="h-10 rounded-xl border px-3">
          <option value="lt">inférieur à</option>
          <option value="lte">inférieur ou égal</option>
          <option value="gte">supérieur ou égal</option>
        </select>
        <input name="ruleThreshold" placeholder="60" aria-label="Seuil" className="h-10 rounded-xl border px-3" />
        <input name="ruleMessage" placeholder="Recommandation si la condition est vraie" aria-label="Message de règle" className="h-10 rounded-xl border px-3" />
      </div>
      <ReportPreview />
      <button type="submit" className="h-10 rounded-xl bg-primary px-4 text-sm text-primary-foreground">Enregistrer le rapport</button>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </form>
  )
}

function ReportPreview() {
  return (
    <aside className="rounded-2xl bg-[#f7f4ee] p-4 text-sm text-[#16324F]">
      <p className="tracking-[0.14em] text-[#8a7340] uppercase">Aperçu fictif</p>
      <p className="font-display mt-2 text-3xl">78 %</p>
      <p className="mt-1">Ready</p>
      <p className="mt-2">Experience 85 % · Knowledge 62 %</p>
      <p className="mt-2">Aucune session réelle n&apos;est créée.</p>
    </aside>
  )
}
