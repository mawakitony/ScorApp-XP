import { z } from "zod"

const optionalUrl = z.union([
  z.literal(""),
  z.string().trim().url("Indiquez une URL valide."),
])

export const scorecardSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Le nom doit contenir au moins 2 caractères.")
    .max(160),
  slug: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Utilisez des minuscules et des tirets, sans espace.",
    ),
  description: z.string().trim().max(600),
  language: z.enum(["fr", "en"]),
  category: z.string().trim().min(2).max(80),
  status: z.enum(["draft", "published", "paused", "archived"]),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Couleur hexadécimale invalide."),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Couleur hexadécimale invalide."),
  logoUrl: optionalUrl,
  coverImageUrl: optionalUrl,
  estimatedMinutes: z.number().int().min(1).max(60),
  privacyText: z.string().trim().max(500),
  seoTitle: z.string().trim().max(70),
  seoDescription: z.string().trim().max(180),
  ogTitle: z.string().trim().max(70),
  ogDescription: z.string().trim().max(200),
  ogImageUrl: optionalUrl,
})

export type ScorecardFormValues = z.infer<typeof scorecardSchema>

export const overviewSchema = z.object({
  leads: z.number(),
  page_views: z.number(),
  started: z.number(),
  captured: z.number(),
  completed: z.number(),
  viewed: z.number(),
  cta_clicks: z.number(),
  conversion_rate: z.number(),
  average_score: z.number().nullable(),
  leads_by_day: z.array(z.object({ date: z.string(), count: z.number() })),
  completion_by_day: z.array(
    z.object({ date: z.string(), started: z.number(), completed: z.number() }),
  ),
  score_by_day: z.array(z.object({ date: z.string(), average: z.number() })),
  result_distribution: z.array(z.object({ label: z.string(), count: z.number() })),
  top_scorecards: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      leads: z.number(),
      completed: z.number(),
    }),
  ),
  sources: z.array(z.object({ source: z.string(), count: z.number() })),
})

export type Overview = z.infer<typeof overviewSchema>
