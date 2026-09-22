import { createClient } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"
import { isPlatformHost, normalizeDomain, publicPathForHost } from "@/lib/billing/domains"
import { updateSession } from "@/lib/supabase/proxy"
import type { Json } from "@/types/database"

export async function proxy(request: NextRequest) {
  const session = await updateSession(request)
  return routeCustomDomain(request, session)
}

async function routeCustomDomain(request: NextRequest, session: NextResponse) {
  const host = request.headers.get("host") ?? ""
  if (isPlatformHost(host)) return withRequestId(session)
  const domain = normalizeDomain(host.split(":")[0] ?? "")
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!domain || !url || !key) return new NextResponse("Not found", { status: 404 })
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await supabase.rpc("resolve_verified_domain", { p_host: domain })
  const slug = readSlug(error ? null : data)
  if (!slug && error) return new NextResponse("Not found", { status: 404 })
  if (error || !data) return new NextResponse("Not found", { status: 404 })
  const mapped = publicPathForHost(request.nextUrl.pathname, slug)
  if (mapped.kind === "pass") return withRequestId(session)
  if (mapped.kind !== "rewrite") return new NextResponse("Not found", { status: 404 })
  const rewriteUrl = request.nextUrl.clone()
  rewriteUrl.pathname = mapped.pathname
  const rewritten = NextResponse.rewrite(rewriteUrl)
  session.cookies.getAll().forEach((cookie) => rewritten.cookies.set(cookie))
  return withRequestId(rewritten)
}

function readSlug(data: Json | null) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null
  return typeof data.default_slug === "string" ? data.default_slug : null
}

function withRequestId(response: NextResponse) {
  if (!response.headers.get("x-request-id")) response.headers.set("x-request-id", crypto.randomUUID())
  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
