import { z } from "zod"

export const slugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Utilisez un slug en minuscules, séparé par des tirets.")

export const questionTypes = [
  "single_choice",
  "multiple_choice",
  "yes_no",
  "scale_5",
  "scale_10",
  "short_text",
  "long_text",
  "number",
  "email",
  "phone",
  "country",
  "dropdown",
] as const

export type QuestionType = (typeof questionTypes)[number]

const optionalUrl = z.union([z.literal(""), z.string().trim().url("Indiquez une URL valide.")])

export const setupSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: slugSchema,
  description: z.string().trim().max(600),
  publicDescription: z.string().trim().max(800),
  language: z.enum(["fr", "en"]),
  category: z.string().trim().min(2).max(80),
  status: z.enum(["draft", "published", "paused", "archived"]),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  logoUrl: optionalUrl,
  coverImageUrl: optionalUrl,
  estimatedMinutes: z.number().int().min(1).max(60),
})

export const benefitSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240),
  icon: z.string().trim().max(40),
})

export const testimonialSchema = z.object({
  quote: z.string().trim().max(400),
  author: z.string().trim().max(80),
  role: z.string().trim().max(80),
})

export const landingSchema = z.object({
  eyebrow: z.string().trim().max(40),
  title: z.string().trim().min(2).max(160),
  subtitle: z.string().trim().max(220),
  description: z.string().trim().max(800),
  heroImageUrl: optionalUrl,
  ctaLabel: z.string().trim().min(2).max(60),
  estimatedTimeLabel: z.string().trim().max(60),
  showEstimatedTime: z.boolean(),
  showQuestionCount: z.boolean(),
  privacyText: z.string().trim().max(500),
  showPrivacy: z.boolean(),
  benefits: z.array(benefitSchema).max(8),
  testimonial: testimonialSchema,
})

export const questionSettingsSchema = z.object({
  scaleFrom: z.number().int().min(1).max(10),
  scaleTo: z.number().int().min(1).max(10),
  scoreFrom: z.number().min(0).max(1000),
  scoreTo: z.number().min(0).max(1000),
})

export const questionSchema = z.object({
  title: z.string().trim().min(2).max(300),
  description: z.string().trim().max(800),
  type: z.enum(questionTypes),
  questionCategoryId: z.string().uuid().nullable(),
  scoringCategoryId: z.string().uuid().nullable(),
  isRequired: z.boolean(),
  isScored: z.boolean(),
  settings: questionSettingsSchema,
})

export const optionSchema = z.object({
  label: z.string().trim().min(1).max(200),
  value: slugSchema,
  score: z.number().min(-1000).max(1000),
})

export const questionCategorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300),
  icon: z.string().trim().max(40),
  weight: z.number().positive().max(1000),
})

export const scoringCategorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300),
  weight: z.number().positive().max(100),
  maxScore: z.number().positive().max(10000),
})

export const resultRangeSchema = z
  .object({
    minPercent: z.number().min(0).max(100),
    maxPercent: z.number().min(0).max(100),
    label: z.string().trim().min(2).max(80),
    title: z.string().trim().min(2).max(180),
    description: z.string().trim().max(600),
    badge: z.string().trim().max(40),
    recommendationTitle: z.string().trim().max(160),
    recommendationBody: z.string().trim().max(600),
    ctaLabel: z.string().trim().max(80),
    ctaUrl: optionalUrl,
  })
  .refine((value) => value.minPercent <= value.maxPercent, {
    message: "Le minimum doit être inférieur ou égal au maximum.",
    path: ["minPercent"],
  })

export const leadFieldKeys = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "whatsapp",
  "company",
  "job_title",
  "country",
  "city",
] as const

export const leadFieldSchema = z.object({
  enabled: z.boolean(),
  required: z.boolean(),
  label: z.string().trim().min(1).max(80),
  placeholder: z.string().trim().max(120),
})

export const leadFormSchema = z.object({
  timing: z.enum(["before", "during", "before_results", "after_results"]),
  consentRequired: z.boolean(),
  consentLabel: z.string().trim().max(400),
  privacyPolicyUrl: optionalUrl,
  fields: z.object({
    first_name: leadFieldSchema,
    last_name: leadFieldSchema,
    email: leadFieldSchema,
    phone: leadFieldSchema,
    whatsapp: leadFieldSchema,
    company: leadFieldSchema,
    job_title: leadFieldSchema,
    country: leadFieldSchema,
    city: leadFieldSchema,
  }),
})

export type SetupInput = z.infer<typeof setupSchema>
export type LandingInput = z.infer<typeof landingSchema>
export type QuestionInput = z.infer<typeof questionSchema>
export type OptionInput = z.infer<typeof optionSchema>
export type QuestionCategoryInput = z.infer<typeof questionCategorySchema>
export type ScoringCategoryInput = z.infer<typeof scoringCategorySchema>
export type ResultRangeInput = z.infer<typeof resultRangeSchema>
export type LeadFormInput = z.infer<typeof leadFormSchema>
