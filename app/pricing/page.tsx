import Link from "next/link"
import { PLANS, publicPlans } from "@/lib/billing/plans"

export const metadata = { title: "Tarifs" }

export default function PricingPage() {
  const plans = publicPlans()
  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <p className="text-sm tracking-[0.16em] text-[#8a7340] uppercase">WOLOYEM Score</p>
      <h1 className="font-display mt-3 text-5xl">Tarifs</h1>
      <p className="mt-3 max-w-2xl text-[#3d4d61]">Les montants sont confirmés par Stripe au moment du paiement. Enterprise se traite sur devis.</p>
      <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => (
          <article key={plan.id} className="flex flex-col rounded-3xl border bg-[#f7f4ee] p-5">
            <h2 className="font-display text-3xl">{plan.name}</h2>
            <ul className="mt-4 space-y-2 text-sm text-[#3d4d61]">
              <li>{label(plan.limits.scorecards)} scorecards</li>
              <li>{label(plan.limits.assessment_starts)} démarrages / mois</li>
              <li>{label(plan.limits.team_members)} membres</li>
              {plan.features.slice(0, 4).map((feature) => <li key={feature}>{feature.replaceAll("_", " ")}</li>)}
            </ul>
            <div className="mt-6">
              {plan.id === "free" ? <Link className="underline" href="/signup">Start free</Link> : null}
              {plan.selfServe ? <Link className="underline" href="/dashboard/settings/billing">Upgrade</Link> : null}
              {plan.id === "enterprise" ? <a className="underline" href="mailto:hello@woloyem.com">Contact sales</a> : null}
            </div>
          </article>
        ))}
      </div>
      <p className="mt-8 text-sm text-[#5e6d7e]">{PLANS.internal.public ? "" : "Le plan interne n'est pas proposé ici."}</p>
    </main>
  )
}

function label(value: number | null) {
  return value === null ? "Illimité" : new Intl.NumberFormat("fr-FR").format(value)
}
