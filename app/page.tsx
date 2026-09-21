import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"

const points = [
  {
    title: "Qualifier",
    text: "Des questionnaires qui distinguent le niveau, l'expérience et l'intention du prospect.",
  },
  {
    title: "Scorer",
    text: "Un moteur de scoring par catégories, poids et seuils, enregistré dans la base.",
  },
  {
    title: "Orienter",
    text: "Un résultat personnalisé et une recommandation vers la formation WOLOYEM adaptée.",
  },
]

const programs = ["PMP®", "CAPM®", "PgMP®", "PMI-ACP®", "ITIL®", "PRINCE2®", "PMO", "Business Case"]

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6">
        <Logo />
        <Button asChild variant="outline" className="h-10">
          <Link href="/login">Espace admin</Link>
        </Button>
      </header>
      <main className="mx-auto w-full max-w-6xl px-5 pb-20">
        <section className="grid items-end gap-10 py-12 lg:grid-cols-[1.4fr_0.8fr] lg:py-20">
          <div>
            <p className="text-sm tracking-[0.2em] text-brass uppercase">Diagnostics professionnels</p>
            <h1 className="font-display mt-4 max-w-3xl text-5xl leading-tight tracking-tight md:text-6xl">
              La plateforme de scorecards WOLOYEM.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Créez des diagnostics, tests d&apos;éligibilité et questionnaires pour qualifier les prospects
              et les orienter vers PMP®, CAPM®, ITIL®, PRINCE2® et les autres parcours WOLOYEM.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild className="h-11 px-5">
                <Link href="/login">Ouvrir le dashboard</Link>
              </Button>
              <Button asChild variant="secondary" className="h-11 px-5">
                <Link href="/signup">Créer un accès</Link>
              </Button>
            </div>
          </div>
          <aside className="rounded-3xl bg-primary p-8 text-primary-foreground">
            <p className="text-sm text-brass">Indication préliminaire</p>
            <p className="font-display mt-6 text-6xl">78%</p>
            <p className="mt-3 text-lg">Profil proche d&apos;une préparation PMP®.</p>
            <div className="mt-8 space-y-3 text-sm">
              <Bar label="Expérience" value="90%" />
              <Bar label="Formation" value="70%" />
              <Bar label="Préparation" value="62%" />
            </div>
          </aside>
        </section>
        <section className="grid gap-4 md:grid-cols-3">
          {points.map((point) => (
            <article key={point.title} className="rounded-2xl border bg-card p-6">
              <h2 className="font-display text-2xl">{point.title}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{point.text}</p>
            </article>
          ))}
        </section>
        <section className="mt-16">
          <h2 className="font-display text-3xl">Pensée pour les certifications</h2>
          <ul className="mt-6 flex flex-wrap gap-2">
            {programs.map((program) => (
              <li key={program} className="rounded-full border bg-card px-4 py-2 text-sm">
                {program}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}

function Bar({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-t border-white/10 pt-3">
      <span>{label}</span>
      <span className="text-brass">{value}</span>
    </div>
  )
}
