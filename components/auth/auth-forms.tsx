"use client"

import { useState } from "react"
import { useFormStatus } from "react-dom"
import { toast } from "sonner"
import { sendMagicLink, signIn, signUp } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function LoginForm({ next, configured }: { next: string; configured: boolean }) {
  return (
    <Tabs defaultValue="password">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="password">Mot de passe</TabsTrigger>
        <TabsTrigger value="magic">Lien magique</TabsTrigger>
      </TabsList>
      <TabsContent value="password" className="mt-6">
        <AuthForm
          configured={configured}
          action={async (formData) => {
            formData.set("next", next)
            const result = await signIn(formData)
            if (result?.error) toast.error(result.error)
          }}
        >
          <EmailField />
          <PasswordField />
          <Submit label="Se connecter" />
        </AuthForm>
      </TabsContent>
      <TabsContent value="magic" className="mt-6">
        <AuthForm
          configured={configured}
          action={async (formData) => {
            const result = await sendMagicLink(formData)
            if (result?.error) toast.error(result.error)
            if (result?.message) toast.success(result.message)
          }}
        >
          <EmailField />
          <Submit label="Recevoir le lien" />
        </AuthForm>
      </TabsContent>
    </Tabs>
  )
}

export function SignupForm({ configured }: { configured: boolean }) {
  const [message, setMessage] = useState<string | null>(null)

  return (
    <AuthForm
      configured={configured}
      action={async (formData) => {
        const result = await signUp(formData)
        if (result?.error) toast.error(result.error)
        if (result?.message) setMessage(result.message)
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="fullName">Nom</Label>
        <Input id="fullName" name="fullName" className="h-10" required />
      </div>
      <EmailField />
      <PasswordField />
      <Submit label="Créer le compte" />
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </AuthForm>
  )
}

function AuthForm({
  action,
  children,
  configured,
}: {
  action: (formData: FormData) => Promise<void>
  children: React.ReactNode
  configured: boolean
}) {
  return (
    <form action={action}>
      <fieldset disabled={!configured} className="space-y-4 disabled:opacity-60">
        {children}
      </fieldset>
      {configured ? null : (
        <p className="mt-4 text-sm text-destructive">
          Renseignez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY dans .env.local.
        </p>
      )}
    </form>
  )
}

function EmailField() {
  return (
    <div className="space-y-2">
      <Label htmlFor="email">Email</Label>
      <Input id="email" name="email" type="email" autoComplete="email" className="h-10" required />
    </div>
  )
}

function PasswordField() {
  return (
    <div className="space-y-2">
      <Label htmlFor="password">Mot de passe</Label>
      <Input id="password" name="password" type="password" autoComplete="current-password" className="h-10" required minLength={8} />
    </div>
  )
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="h-10 w-full" disabled={pending}>
      {pending ? "Veuillez patienter..." : label}
    </Button>
  )
}
