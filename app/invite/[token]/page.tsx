import { acceptInvitation } from "@/actions/organization"
import { requireUser } from "@/lib/auth/session"

export const metadata = { title: "Invitation" }

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  await requireUser()
  const { token } = await params
  const query = await searchParams
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5">
      <h1 className="font-display text-4xl">Rejoindre l&apos;organisation</h1>
      {query.error ? <p className="mt-3 text-sm">Cette invitation n&apos;est plus valable.</p> : null}
      <form action={acceptInvitation.bind(null, token)} className="mt-6">
        <button className="h-11 rounded-xl bg-[#16324F] px-4 text-sm text-[#f7f4ee]" type="submit">Accepter l&apos;invitation</button>
      </form>
    </main>
  )
}
