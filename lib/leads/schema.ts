import { z } from "zod"
import { LEAD_STATUSES, LEAD_TEMPERATURES } from "@/lib/leads/qualification"

const numberOrNull = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}, z.number().nullable())

export const leadRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  whatsapp: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  score: numberOrNull,
  result: z.string().nullable().optional(),
  temperature: z.enum(LEAD_TEMPERATURES),
  status: z.enum(LEAD_STATUSES),
  scorecard: z.string().nullable().optional(),
  scorecard_id: z.string().nullable().optional(),
  utm_source: z.string().nullable().optional(),
  utm_medium: z.string().nullable().optional(),
  utm_campaign: z.string().nullable().optional(),
  created_at: z.string(),
  cta_clicked: z.boolean(),
  tags: z.array(z.object({ id: z.string(), name: z.string(), color: z.string() })).default([]),
})

export const leadListSchema = z.object({
  total: z.coerce.number(),
  rows: z.array(leadRowSchema),
})

const countsSchema = z.object({
  leads: z.coerce.number(),
  new_leads: z.coerce.number(),
  page_views: z.coerce.number(),
  started: z.coerce.number(),
  captured: z.coerce.number(),
  completed: z.coerce.number(),
  viewed: z.coerce.number(),
  cta_clicks: z.coerce.number(),
  average_score: numberOrNull,
  hot_leads: z.coerce.number(),
})

const channelSchema = z.object({
  name: z.string(),
  sessions: z.coerce.number(),
  leads: z.coerce.number(),
  completions: z.coerce.number(),
  cta_clicks: z.coerce.number(),
})

export const analyticsSchema = z.object({
  current: countsSchema,
  previous: countsSchema,
  score_buckets: z.array(z.object({ label: z.string(), count: z.coerce.number() })).default([]),
  result_distribution: z.array(z.object({ label: z.string(), count: z.coerce.number() })).default([]),
  countries: z.array(z.object({
    country: z.string(),
    leads: z.coerce.number(),
    completions: z.coerce.number(),
    average_score: numberOrNull,
    cta_clicks: z.coerce.number(),
  })).default([]),
  sources: z.array(channelSchema).default([]),
  campaigns: z.array(channelSchema).default([]),
  mediums: z.array(channelSchema).default([]),
  scorecards: z.array(z.object({
    id: z.string(),
    name: z.string(),
    views: z.coerce.number(),
    starts: z.coerce.number(),
    leads: z.coerce.number(),
    completed: z.coerce.number(),
    average_score: numberOrNull,
    cta_clicks: z.coerce.number(),
  })).default([]),
  cta_ranges: z.array(z.object({ label: z.string(), count: z.coerce.number() })).default([]),
  cta_destinations: z.array(z.object({ url: z.string(), count: z.coerce.number() })).default([]),
  hot_leads: z.array(z.object({
    id: z.string(),
    name: z.string(),
    score: numberOrNull,
    scorecard: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    cta_clicked: z.boolean(),
    created_at: z.string(),
  })).default([]),
  completion: z.object({
    median_seconds: numberOrNull,
    average_seconds: numberOrNull,
    sample: z.coerce.number(),
  }),
})

export const questionStatsSchema = z.object({
  started: z.coerce.number(),
  questions: z.array(z.object({
    id: z.string(),
    title: z.string(),
    type: z.string(),
    position: z.coerce.number(),
    answered: z.coerce.number(),
    options: z.array(z.object({ label: z.string(), count: z.coerce.number() })).default([]),
  })).default([]),
})
