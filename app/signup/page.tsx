import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { SignupForm } from "@/components/auth/auth-forms"
import { isSupabaseConfigured } from "@/lib/env"

export const metadata = { title: "Créer un accès", robots: { index: false, follow: false } }

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center px-6 py-12">
      <div className="mx-auto w-full max-w-md">
        <Logo />
        <h1 className="font-display mt-10 text-4xl">Créer un accès</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Le premier compte devient propriétaire de l&apos;organisation WOLOYEM. Les comptes suivants doivent être invités.
        </p>
        <div className="mt-8">
          <SignupForm configured={isSupabaseConfigured()} />
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Déjà un compte ?{" "}
          <Link href="/login" className="text-foreground underline">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  )
}
