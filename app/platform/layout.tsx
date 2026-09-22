import { PlatformShell } from "@/components/platform/shell"
import { requirePlatformAdmin } from "@/lib/platform/auth"
import { readSupportSession } from "@/lib/platform/data"

export const dynamic = "force-dynamic"
export const metadata = { title: "Platform Admin", robots: { index: false, follow: false } }

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin()
  const support = await readSupportSession(admin.userId)
  return <PlatformShell admin={admin} supportName={support?.organization.name ?? null}>{children}</PlatformShell>
}
