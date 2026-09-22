import { isSupabaseConfigured } from "@/lib/env"
import { getMembership } from "@/lib/data/membership"
import { createClient } from "@/lib/supabase/server"
import type { Scorecard, ScorecardPage, Template } from "@/types/database"

export type ScorecardListItem = Scorecard & {
  visitors: number
  participants: number
  results: number
  conversionRate: number
}

export type PublicScorecard = Scorecard & {
  page: Pick<
    ScorecardPage,
    | "title"
    | "subtitle"
    | "description"
    | "hero_image_url"
    | "cta_text"
    | "eyebrow"
    | "estimated_time_label"
    | "benefits"
    | "testimonial"
    | "show_estimated_time"
    | "show_question_count"
    | "show_privacy"
  > | null
  questionCount: number
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export async function listScorecards(organizationId: string, query?: string) {
  if (!isSupabaseConfigured()) return { scorecards: [] as ScorecardListItem[], error: "Supabase n'est pas configuré." }

  const supabase = await createClient()
  let request = supabase
    .from("scorecards")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })

  const term = query?.trim()
  if (term) {
    const safe = term.replace(/[%_,]/g, " ")
    request = request.or(`name.ilike.%${safe}%,slug.ilike.%${safe}%`)
  }

  const { data, error } = await request
  if (error || !data) {
    return { scorecards: [] as ScorecardListItem[], error: "Impossible de charger les scorecards." }
  }

  const ids = data.map((scorecard) => scorecard.id)
  const stats = new Map<string, { visitors: number; participants: number; results: number }>()

  if (ids.length > 0) {
    const { data: statRows } = await supabase
      .from("scorecard_stats")
      .select("scorecard_id, visitors, participants, results")
      .in("scorecard_id", ids)

    statRows?.forEach((row) => {
      stats.set(row.scorecard_id, {
        visitors: row.visitors,
        participants: row.participants,
        results: row.results,
      })
    })
  }

  return {
    scorecards: data.map((scorecard) => {
      const metric = stats.get(scorecard.id)
      const participants = metric?.participants ?? 0
      const results = metric?.results ?? 0
      return {
        ...scorecard,
        visitors: metric?.visitors ?? 0,
        participants,
        results,
        conversionRate: participants === 0 ? 0 : Math.round((results / participants) * 1000) / 10,
      }
    }),
    error: null,
  }
}

export async function getScorecard(organizationId: string, id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("scorecards")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle()

  if (error || !data) return null
  return data
}

export async function getScorecardBySlug(slug: string) {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("scorecards")
    .select(
      "*, page:scorecard_pages(title, subtitle, description, hero_image_url, cta_text, eyebrow, estimated_time_label, benefits, testimonial, show_estimated_time, show_question_count, show_privacy)",
    )
    .eq("slug", slug)
    .maybeSingle()

  if (error || !data) return null

  const { count } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("scorecard_id", data.id)

  const page = one(data.page as PublicScorecard["page"] | NonNullable<PublicScorecard["page"]>[] | null)

  const scorecard: PublicScorecard = {
    id: data.id,
    organization_id: data.organization_id,
    name: data.name,
    slug: data.slug,
    description: data.description,
    language: data.language,
    category: data.category,
    status: data.status,
    cover_image_url: data.cover_image_url,
    logo_url: data.logo_url,
    primary_color: data.primary_color,
    secondary_color: data.secondary_color,
    estimated_minutes: data.estimated_minutes,
    privacy_text: data.privacy_text,
    seo_title: data.seo_title,
    seo_description: data.seo_description,
    og_title: data.og_title,
    og_description: data.og_description,
    og_image_url: data.og_image_url,
    published_at: data.published_at,
    report_config: data.report_config,
    created_by: data.created_by,
    created_at: data.created_at,
    updated_at: data.updated_at,
    page,
    questionCount: count ?? 0,
  }

  return scorecard
}

export async function listTemplates() {
  if (!isSupabaseConfigured()) return [] as Template[]
  const supabase = await createClient()
  const { data } = await supabase
    .from("templates")
    .select("*")
    .eq("is_system", true)
    .order("name", { ascending: true })
  return data ?? []
}

export async function getVisibleScorecard(slug: string, preview: boolean) {
  const scorecard = await getScorecardBySlug(slug)
  if (!scorecard) return null
  if (scorecard.status === "published") return scorecard
  if (!preview) return null
  const membership = await getMembership()
  if (membership?.organization.id !== scorecard.organization_id) return null
  return scorecard
}
