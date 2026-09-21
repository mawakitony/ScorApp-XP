import { NextResponse } from "next/server"
import { safeNextPath } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const next = safeNextPath(url.searchParams.get("next"))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { error: bootError } = await supabase.rpc("bootstrap_membership")
      if (bootError) {
        await supabase.auth.signOut()
        return NextResponse.redirect(new URL("/login?error=invite", url.origin))
      }
      return NextResponse.redirect(new URL(next, url.origin))
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", url.origin))
}
