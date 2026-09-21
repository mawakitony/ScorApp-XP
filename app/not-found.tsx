import Link from "next/link"

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <p className="text-sm tracking-[0.18em] text-brass uppercase">WOLOYEM Score</p>
      <h1 className="font-display mt-3 text-4xl">Page introuvable</h1>
      <p className="mt-3 text-muted-foreground">Cette adresse n&apos;existe pas, ou la scorecard n&apos;est pas publiée.</p>
      <Link href="/" className="mt-6 text-sm underline">
        Retour à l&apos;accueil
      </Link>
    </main>
  )
}
