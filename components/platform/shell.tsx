import Link from "next/link"
import { endSupportSession } from "@/actions/platform"
import type { PlatformAdmin } from "@/lib/platform/auth"

const links = [
  ["Overview", "/platform"],
  ["Organizations", "/platform/organizations"],
  ["Subscriptions", "/platform/subscriptions"],
  ["Usage", "/platform/usage"],
  ["Jobs", "/platform/jobs"],
  ["Integrations", "/platform/integrations"],
  ["Domains", "/platform/domains"],
  ["Audit", "/platform/audit"],
  ["System Health", "/platform/health"],
  ["Admins", "/platform/admins"],
]

export function PlatformShell({
  admin,
  supportName,
  children,
}: {
  admin: PlatformAdmin
  supportName: string | null
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#eef2f6] text-[#16324F]">
      {supportName ? (
        <form action={endSupportSession} className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-[#8a7340] px-5 py-3 text-sm text-[#f7f4ee]">
          <strong>SUPPORT MODE — Viewing {supportName}</strong>
          <button className="rounded-lg bg-[#16324F] px-3 py-1" type="submit">Exit support mode</button>
        </form>
      ) : null}
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-4">
          <div>
            <p className="text-xs tracking-[0.16em] uppercase">WOLOYEM Platform Admin</p>
            <p className="mt-1 text-sm text-[#5e6d7e]">{admin.role}</p>
          </div>
          <form action="/platform/organizations" className="flex gap-2">
            <input name="q" placeholder="Org, domaine, cus_" className="h-9 w-full rounded-lg border bg-white px-2 text-sm" />
          </form>
          <nav className="flex flex-col gap-2 text-sm">
            {links.map(([label, href]) => (
              <Link key={href} href={href} className="rounded-lg px-2 py-1 hover:bg-white">{label}</Link>
            ))}
            <Link href="/dashboard" className="mt-4 text-[#5e6d7e] underline">Back to WOLOYEM Score</Link>
          </nav>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
