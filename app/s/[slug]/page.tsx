import type { Metadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import { LandingView } from "@/components/assessment/landing-view"
import { StartAssessmentButton } from "@/components/assessment/start-button"
import { getPublicEntry } from "@/lib/assessment/entry"
import { recordLandingView } from "@/lib/assessment/store"
import { getAppUrl } from "@/lib/env"
import { parseBenefits, parseTestimonial } from "@/lib/scorecard/content"

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const { preview } = await searchParams
  const entry = await getPublicEntry(slug, preview === "1")
  if (!entry) return { title: "Scorecard" }
  const scorecard = entry.scorecard
  const title = scorecard.seo_title || scorecard.page?.title || scorecard.name
  const description = scorecard.seo_description || scorecard.page?.subtitle || scorecard.description || undefined
  const image = scorecard.og_image_url || scorecard.cover_image_url || undefined
  const canonical = `${getAppUrl()}/s/${scorecard.slug}`
  return {
    title,
    description,
    alternates: { canonical },
    robots: entry.access === "published" ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      title: scorecard.og_title || title,
      description: scorecard.og_description || description,
      url: canonical,
      images: image ? [image] : undefined,
      type: "website",
    },
  }
}

export default async function PublicScorecardPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { preview } = await searchParams
  const entry = await getPublicEntry(slug, preview === "1")
  if (!entry) notFound()
  if (entry.access === "paused") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-16">
        <p className="text-sm tracking-[0.18em] text-[#8a7340] uppercase">WOLOYEM</p>
        <h1 className="font-display mt-4 text-4xl">Cette évaluation est momentanément indisponible.</h1>
      </main>
    )
  }

  const scorecard = entry.scorecard
  const page = scorecard.page
  if (entry.access === "published") {
    await recordLandingView(scorecard.id, scorecard.organization_id)
  }

  return (
    <LandingView
      content={{
        eyebrow: page?.eyebrow ?? "",
        title: page?.title || scorecard.name,
        subtitle: page?.subtitle ?? "",
        description: page?.description || scorecard.description || "",
        heroImageUrl: page?.hero_image_url ?? "",
        ctaLabel: page?.cta_text || "Commencer",
        estimatedTimeLabel: page?.estimated_time_label ?? "",
        showEstimatedTime: page?.show_estimated_time !== false,
        showQuestionCount: page?.show_question_count !== false,
        showPrivacy: page?.show_privacy !== false,
        privacyText: scorecard.privacy_text ?? "",
        benefits: parseBenefits(page?.benefits ?? null),
        testimonial: parseTestimonial(page?.testimonial ?? null),
        primaryColor: scorecard.primary_color,
        secondaryColor: scorecard.secondary_color,
        logoUrl: scorecard.logo_url ?? "",
        estimatedMinutes: scorecard.estimated_minutes,
        questionCount: scorecard.questionCount,
        previewBanner: entry.access !== "published",
      }}
      cta={
        entry.access === "published" ? (
          <Suspense fallback={null}>
            <StartAssessmentButton slug={scorecard.slug} label={page?.cta_text || "Commencer"} color={scorecard.primary_color} />
          </Suspense>
        ) : (
          <p className="mt-8 text-sm text-[#5e6d7e]">Aperçu administrateur. Aucune session visiteur n&apos;est créée.</p>
        )
      }
    />
  )
}
