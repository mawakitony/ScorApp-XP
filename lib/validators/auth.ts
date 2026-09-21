import { z } from "zod"

export const loginSchema = z.object({
  email: z.string().trim().email("Indiquez un email valide."),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères."),
})

export const signupSchema = loginSchema.extend({
  fullName: z.string().trim().min(2, "Indiquez votre nom.").max(80),
})

export const magicLinkSchema = z.object({
  email: z.string().trim().email("Indiquez un email valide."),
})

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Indiquez votre nom.").max(80),
})

export const inviteSchema = z.object({
  email: z.string().trim().email("Indiquez un email valide."),
  role: z.enum(["admin", "member"]),
})
