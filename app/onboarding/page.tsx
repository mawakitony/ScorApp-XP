import { redirect } from "next/navigation"
import { createOrganization } from "@/actions/organization"
import { requireUser } from "@/lib/auth/session"
import { getMembership } from "@/lib/data/membership"

export const metadata = { title: "Créer une organisation" }

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser()
  const membership = await getMembership()
  if (membership) redirect("/dashboard")
  const params = await searchParams
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5">
      <p className="text-sm tracking-[0.16em] text-[#8a7340] uppercase">WOLOYEM Score</p>
      <h1 className="font-display mt-3 text-4xl">Créer votre organisation</h1>
      <p className="mt-3 text-sm text-[#5e6d7e]">Vous devenez propriétaire. Un essai de 14 jours est proposé une seule fois par compte.</p>
      {params.error ? <p className="mt-4 text-sm text-destructive">Cette organisation n&apos;a pas pu être créée.</p> : null}
      <form action={createOrganization} className="mt-6 space-y-3">
        <input name="name" required minLength={2} placeholder="Nom" className="h-11 w-full rounded-xl border px-3" />
        <input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="slug" className="h-11 w-full rounded-xl border px-3" />
        <input name="useCase" placeholder="Usage principal" className="h-11 w-full rounded-xl border px-3" />
        <button className="h-11 rounded-xl bg-[#16324F] px-4 text-sm text-[#f7f4ee]" type="submit">Continuer</button>
      </form>
    </main>
  )
}
