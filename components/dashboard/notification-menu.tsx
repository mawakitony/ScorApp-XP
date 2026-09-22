"use client"

import { Bell } from "lucide-react"
import { markAllNotificationsRead, markNotificationRead } from "@/actions/notifications"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export function NotificationMenu({
  unread,
  items,
}: {
  unread: number
  items: { id: string; title: string; message: string; createdAt: string; read: boolean }[]
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative" aria-label={unread > 0 ? `${unread} notifications non lues` : "Notifications"}>
          <Bell />
          {unread > 0 ? <span className="absolute top-1 right-1 size-2 rounded-full bg-brass" /> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notifications
          {unread > 0 ? <button type="button" className="text-xs font-normal underline" onClick={() => void markAllNotificationsRead()}>Tout lire</button> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? <p className="px-2 py-3 text-sm text-muted-foreground">Aucune notification pour le moment.</p> : (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" className="w-full px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => void markNotificationRead(item.id)}>
                  <span className="flex items-center gap-2 font-medium">{item.read ? null : <span className="size-1.5 rounded-full bg-brass" />}<span>{item.title}</span></span>
                  <span className="mt-1 block text-muted-foreground">{item.message}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
