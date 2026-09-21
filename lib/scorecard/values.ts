import type { Scorecard } from "@/types/database"
import type { ScorecardFormValues } from "@/lib/validators/scorecard"

export function toScorecardFormValues(scorecard?: Scorecard | null): ScorecardFormValues {
  return {
    name: scorecard?.name ?? "",
    slug: scorecard?.slug ?? "",
    description: scorecard?.description ?? "",
    language: scorecard?.language ?? "fr",
    category: scorecard?.category ?? "PMP",
    status: scorecard?.status ?? "draft",
    primaryColor: scorecard?.primary_color ?? "#16324F",
    secondaryColor: scorecard?.secondary_color ?? "#C4A15A",
    logoUrl: scorecard?.logo_url ?? "",
    coverImageUrl: scorecard?.cover_image_url ?? "",
    estimatedMinutes: scorecard?.estimated_minutes ?? 3,
    privacyText: scorecard?.privacy_text ?? "",
    seoTitle: scorecard?.seo_title ?? "",
    seoDescription: scorecard?.seo_description ?? "",
    ogTitle: scorecard?.og_title ?? "",
    ogDescription: scorecard?.og_description ?? "",
    ogImageUrl: scorecard?.og_image_url ?? "",
  }
}
