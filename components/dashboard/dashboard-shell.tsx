"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  Files,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Menu,
  Search,
  Settings,
  Users,
} from "lucide-react"
import { signOut } from "@/actions/auth"
import { Logo } from "@/components/brand/logo"
import { NotificationMenu } from "@/components/dashboard/notification-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { initials } from "@/lib/format"
import { cn } from "@/lib/utils"

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/scorecards", label: "Scorecards", icon: Files, exact: false },
  { href: "/dashboard/leads", label: "Leads", icon: Users, exact: false },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3, exact: false },
  { href: "/dashboard/templates", label: "Templates", icon: LayoutTemplate, exact: false },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, exact: false },
]

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-foreground"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function DashboardShell({
  children,
  email,
  fullName,
  organizationName,
  notifications,
}: {
  children: React.ReactNode
  email: string
  fullName: string | null
  organizationName: string
  notifications: { id: string; title: string; message: string; createdAt: string; read: boolean }[]
}) {
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground lg:flex">
        <Link href="/dashboard" className="px-2">
          <Logo tone="light" />
        </Link>
        <p className="mt-6 px-3 text-[11px] tracking-[0.18em] text-brass uppercase">{organizationName}</p>
        <div className="mt-3">
          <NavLinks />
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur md:px-8">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="lg:hidden" aria-label="Ouvrir le menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar text-sidebar-foreground">
              <SheetHeader>
                <SheetTitle className="text-left text-sidebar-foreground">
                  <Logo tone="light" />
                </SheetTitle>
              </SheetHeader>
              <NavLinks />
            </SheetContent>
          </Sheet>

          <form action="/dashboard/scorecards" className="relative hidden min-w-0 flex-1 md:block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              placeholder="Rechercher une scorecard"
              className="h-10 w-full max-w-md rounded-xl border bg-card pr-3 pl-9 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/40"
            />
          </form>

          <div className="ml-auto flex items-center gap-2">
            <NotificationMenu unread={notifications.filter((item) => !item.read).length} items={notifications} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 hover:bg-muted" type="button">
                  <Avatar>
                    <AvatarFallback>{initials(fullName, email)}</AvatarFallback>
                  </Avatar>
                  <span className="hidden text-left md:block">
                    <span className="block text-sm leading-4">{fullName || "Administrateur"}</span>
                    <span className="block max-w-40 truncate text-xs text-muted-foreground">{email}</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{organizationName}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings">Paramètres</Link>
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
                  <LogOut />
                  Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  )
}
