"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { inviteMember, removeMember, updateProfile } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function ProfileForm({ fullName }: { fullName: string }) {
  const router = useRouter()
  return (
    <form
      className="space-y-4"
      action={async (formData) => {
        const result = await updateProfile(formData)
        if (result.error) toast.error(result.error)
        if (result.message) {
          toast.success(result.message)
          router.refresh()
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="fullName">Nom</Label>
        <Input id="fullName" name="fullName" defaultValue={fullName} className="h-10" />
      </div>
      <Button type="submit" className="h-10">
        Enregistrer
      </Button>
    </form>
  )
}

export function InviteForm() {
  const router = useRouter()
  return (
    <form
      className="grid gap-3 md:grid-cols-[1fr_160px_auto]"
      action={async (formData) => {
        const result = await inviteMember(formData)
        if (result.error) toast.error(result.error)
        if (result.message) {
          toast.success(result.message)
          router.refresh()
        }
      }}
    >
      <Input name="email" type="email" required placeholder="email@woloyem.com" className="h-10" aria-label="Email" />
      <select name="role" className="h-10 rounded-lg border bg-card px-2 text-sm" defaultValue="member" aria-label="Rôle">
        <option value="member">Membre</option>
        <option value="admin">Administrateur</option>
      </select>
      <Button type="submit" className="h-10">
        Ajouter
      </Button>
    </form>
  )
}

export function RemoveMemberButton({ userId }: { userId: string }) {
  const router = useRouter()
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        void removeMember(userId).then((result) => {
          if (result.error) toast.error(result.error)
          if (result.message) {
            toast.success(result.message)
            router.refresh()
          }
        })
      }}
    >
      Retirer
    </Button>
  )
}
