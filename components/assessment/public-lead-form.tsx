"use client"

import { useState } from "react"
import { submitAssessmentLead } from "@/actions/assessment"
import { countryChoices } from "@/lib/geo/countries"
import { leadFieldKeys } from "@/lib/validators/builder"
import type { BuilderLeadForm } from "@/types/builder"

export function PublicLeadForm({
  slug,
  form,
  onDone,
}: {
  slug: string
  form: BuilderLeadForm
  onDone: () => void
}) {
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [consent, setConsent] = useState(false)
  const fields = leadFieldKeys.filter((key) => form.fields[key].enabled)

  return (
    <form
      className="mx-auto w-full max-w-xl px-5 py-8"
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const values = Object.fromEntries(fields.map((key) => [key, String(data.get(key) ?? "")]))
        setPending(true)
        setError("")
        void submitAssessmentLead(slug, values, consent, String(data.get("company_website") ?? "")).then((result) => {
          setPending(false)
          if (result.error) {
            setError(result.error)
            return
          }
          onDone()
        })
      }}
    >
      <h2 className="font-display text-3xl">Vos coordonnées</h2>
      <p className="mt-2 text-sm text-[#5e6d7e]">Ces informations servent à vous transmettre votre résultat.</p>
      <div className="mt-6 space-y-4">
        <input name="company_website" tabIndex={-1} autoComplete="off" className="absolute h-0 w-0 opacity-0" aria-hidden="true" />
        {fields.map((key) => {
          const field = form.fields[key]
          const inputMode = key === "email" ? "email" : key === "phone" || key === "whatsapp" ? "tel" : undefined
          if (key === "country") {
            return (
              <label key={key} className="block text-sm">
                {field.label}
                {field.required ? " *" : ""}
                <select name={key} className="mt-1 h-12 w-full rounded-xl border bg-white px-3" defaultValue="">
                  <option value="">Choisir</option>
                  {countryChoices().map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </label>
            )
          }
          return (
            <label key={key} className="block text-sm">
              {field.label}
              {field.required ? " *" : ""}
              <input
                name={key}
                required={field.required}
                placeholder={field.placeholder}
                inputMode={inputMode}
                autoComplete={key === "email" ? "email" : key === "first_name" ? "given-name" : key === "last_name" ? "family-name" : "on"}
                className="mt-1 h-12 w-full rounded-xl border bg-white px-3"
              />
            </label>
          )
        })}
        {form.consentRequired ? (
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 size-4" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>
              {form.consentLabel}
              {form.privacyPolicyUrl ? (
                <>
                  {" "}
                  <a className="underline" href={form.privacyPolicyUrl}>
                    Politique de confidentialité
                  </a>
                </>
              ) : null}
            </span>
          </label>
        ) : null}
      </div>
      {error ? (
        <p className="mt-4 text-sm text-[#8d3b32]" role="alert" aria-live="assertive">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#16324F] px-6 text-white disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Envoi..." : "Continuer"}
      </button>
    </form>
  )
}
