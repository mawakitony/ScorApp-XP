import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { LoginForm } from "@/components/auth/auth-forms"
import { isSupabaseConfigured, safeNextPath } from "@/lib/env"

export const metadata = { title: "Connexion", robots: { index: false, follow: false } }

const errors: Record<string, string> = {
  config: "Ajoutez les variables Supabase dans .env.local, puis appliquez la migration SQL.",
  invite: "Ce compte n'est pas membre de WOLOYEM. Le premier compte devient propriétaire. Les suivants ont besoin d'une invitation.",
  auth: "Le lien de connexion n'est plus valable. Demandez-en un nouveau.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const params = await searchParams
  const message = params.error ? errors[params.error] : null

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden bg-primary px-12 py-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <Logo tone="light" />
        <div>
          <p className="text-sm tracking-[0.2em] text-brass uppercase">Administration</p>
          <h1 className="font-display mt-4 text-5xl leading-tight">Pilotez vos diagnostics.</h1>
          <p className="mt-4 max-w-md text-primary-foreground/80">
            Scorecards, leads et lectures de performance pour les formations WOLOYEM.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/70">Accès réservé à l&apos;équipe WOLOYEM.</p>
      </section>
      <section className="flex items-center px-6 py-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h2 className="font-display text-4xl">Connexion</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Email et mot de passe, ou lien magique. Google pourra être ajouté plus tard.
          </p>
          {message ? <p className="mt-4 rounded-xl bg-secondary px-4 py-3 text-sm">{message}</p> : null}
          <div className="mt-8">
            <LoginForm next={safeNextPath(params.next)} configured={isSupabaseConfigured()} />
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Pas encore de compte ?{" "}
            <Link href="/signup" className="text-foreground underline">
              Créer un accès
            </Link>
          </p>
        </div>
      </section>
    </div>
  )
}
