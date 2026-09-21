"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getAppUrl, safeNextPath } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"
import { inviteSchema, loginSchema, magicLinkSchema, profileSchema, signupSchema } from "@/lib/validators/auth"

function authMessage(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes("invalid login")) return "Email ou mot de passe incorrect."
  if (normalized.includes("email not confirmed")) return "Confirmez votre email avant de vous connecter."
  if (normalized.includes("already registered") || normalized.includes("already been registered")) {
    return "Un compte existe déjà avec cet email."
  }
  if (normalized.includes("invitation") || normalized.includes("invite")) {
    return "Ce compte n'est pas encore membre de WOLOYEM. Demandez une invitation à un administrateur."
  }
  return "La connexion a échoué. Réessayez."
}

async function redirectOrigin() {
  const headerStore = await headers()
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host")
  const proto = headerStore.get("x-forwarded-proto") ?? "http"
  if (host) return `${proto}://${host}`
  return getAppUrl()
}

export async function signIn(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides." }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: authMessage(error.message) }

  const { error: bootError } = await supabase.rpc("bootstrap_membership")
  if (bootError) {
    await supabase.auth.signOut()
    return { error: authMessage(bootError.message) }
  }

  redirect(safeNextPath(String(formData.get("next") ?? "")))
}

export async function signUp(formData: FormData) {
  const parsed = signupSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides." }

  const origin = await redirectOrigin()
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${origin}/auth/callback?next=/dashboard`,
    },
  })

  if (error) return { error: authMessage(error.message) }
  if (!data.session) {
    return { message: "Compte créé. Ouvrez le lien reçu par email pour activer l'accès." }
  }

  const { error: bootError } = await supabase.rpc("bootstrap_membership")
  if (bootError) {
    await supabase.auth.signOut()
    return { error: authMessage(bootError.message) }
  }

  redirect("/dashboard")
}

export async function sendMagicLink(formData: FormData) {
  const parsed = magicLinkSchema.safeParse({ email: formData.get("email") })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Email invalide." }

  const origin = await redirectOrigin()
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/dashboard` },
  })

  if (error) return { error: "Le lien magique n'a pas pu être envoyé." }
  return { message: "Lien envoyé. Consultez votre boîte email." }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}

export async function updateProfile(formData: FormData) {
  const parsed = profileSchema.safeParse({ fullName: formData.get("fullName") })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Nom invalide." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Session expirée." }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName })
    .eq("id", user.id)

  if (error) return { error: "Le profil n'a pas pu être mis à jour." }
  return { message: "Profil enregistré." }
}

export async function inviteMember(formData: FormData) {
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invitation invalide." }

  const supabase = await createClient()
  const { error } = await supabase.rpc("add_organization_member", {
    member_email: parsed.data.email,
    member_role: parsed.data.role,
  })

  if (error) {
    return { error: error.message.includes("Aucun compte") ? error.message : "L'invitation a échoué." }
  }
  return { message: "Membre ajouté à WOLOYEM." }
}

export async function removeMember(userId: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc("remove_organization_member", { target_user: userId })
  if (error) return { error: "Ce membre n'a pas pu être retiré." }
  return { message: "Membre retiré." }
}
