"use client"

import { useState } from "react"
import { PublicLeadForm } from "@/components/assessment/public-lead-form"
import type { BuilderLeadForm } from "@/types/builder"

export function AfterResultLead({ slug, form }: { slug: string; form: BuilderLeadForm }) {
  const [done, setDone] = useState(false)
  if (done) return <p className="mx-auto max-w-xl px-5 text-sm text-[#3d4d61]">Merci, vos coordonnées sont enregistrées.</p>
  return <PublicLeadForm slug={slug} form={form} onDone={() => setDone(true)} />
}
