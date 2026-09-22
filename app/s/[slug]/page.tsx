import type { Metadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import { LandingView } from "@/components/assessment/landing-view"
import { StartAssessmentButton } from "@/components/assessment/start-button"
import { getPublicEntry } from "@/lib/assessment/entry"
import { loadEntitlements } from "@/lib/billing/account"
import { resolvePublicBrand } from "@/lib/billing/brand"
import { recordLandingView } from "@/lib/assessment/store"
import { headers } from "next/headers"
import { canonicalUrl, isPlatformHost } from "@/lib/billing/domains"
import { getAppUrl } from "@/lib/env"
import { createAdminClient } from "@/lib/supabase/admin"
import { parseBenefits, parseTestimonial } from "@/lib/scorecard/content"

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }

async function verifiedDomain(organizationId: string) {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("custom_domains").select("domain").eq("organization_id", organizationId).eq("status", "verified").limit(1).maybeSingle()
    return data?.domain ?? null
  } catch {
    return null
  }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const { preview } = await searchParams
  const entry = await getPublicEntry(slug, preview === "1")
  if (!entry) return { title: "Scorecard" }
  const scorecard = entry.scorecard
  const title = scorecard.seo_title || scorecard.page?.title || scorecard.name
  const description = scorecard.seo_description || scorecard.page?.subtitle || scorecard.description || undefined
  const image = scorecard.og_image_url || scorecard.cover_image_url || undefined
  const host = (await headers()).get("host") ?? ""
  const onCustomDomain = !isPlatformHost(host)
  const ownedDomain = onCustomDomain ? null : await verifiedDomain(scorecard.organization_id)
  const canonical = canonicalUrl({
    appUrl: getAppUrl(),
    host: onCustomDomain ? host : ownedDomain ?? host,
    slug: scorecard.slug,
    customDomain: onCustomDomain || Boolean(ownedDomain),
  })
  const indexable = entry.access === "published" && (onCustomDomain || !ownedDomain)
  return {
    title,
    description,
    alternates: { canonical },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
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
  const entitlements = await loadEntitlements(scorecard.organization_id)
  const brand = resolvePublicBrand({
    entitlements,
    organization: {
      name: "WOLOYEM Score",
      logoUrl: null,
      primaryColor: scorecard.primary_color,
      secondaryColor: scorecard.secondary_color,
    },
    scorecard: {
      logoUrl: scorecard.logo_url,
      primaryColor: scorecard.primary_color,
      secondaryColor: scorecard.secondary_color,
    },
  })
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
        primaryColor: brand.primaryColor,
        secondaryColor: brand.secondaryColor,
        logoUrl: brand.logoUrl,
        poweredBy: brand.poweredBy,
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
