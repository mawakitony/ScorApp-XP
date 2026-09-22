import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AfterResultLead } from "@/components/assessment/after-result-lead"
import { ResultView } from "@/components/assessment/result-view"
import { StartAssessmentButton } from "@/components/assessment/start-button"
import { loadPublicResult } from "@/lib/assessment/store"

export const metadata = { title: "Résultat", robots: { index: false, follow: false } }

export default async function PublicResultPage({
  params,
}: {
  params: Promise<{ slug: string; sessionId: string }>
}) {
  const { slug, sessionId } = await params
  const result = await loadPublicResult(slug, sessionId)
  if (!result) notFound()

  return (
    <main className="min-h-screen" style={{ background: "#f7f4ee" }}>
      <ResultView
        heading="Votre score"
        percentage={result.percentage}
        range={{
          badge: result.badge,
          title: result.title,
          description: result.description,
          recommendationBody: result.recommendation,
          ctaLabel: result.ctaLabel,
          ctaUrl: "",
        }}
        categories={[]}
        categoryScores={[]}
        namedScores={result.categories}
        primaryColor={result.primaryColor}
        disclaimer={result.disclaimer}
        ctaHref={result.hasCta ? `/s/${slug}/results/${sessionId}/cta` : undefined}
      />
      <div className="mx-auto max-w-xl px-5">
        <Link href={`/s/${slug}/results/${sessionId}/report`} className="text-sm underline" style={{ color: result.primaryColor }}>
          {result.language === "en" ? "Download my report" : "Télécharger mon rapport"}
        </Link>
      </div>
      {result.showLead && result.lead ? <AfterResultLead slug={slug} form={result.lead} /> : null}
      <div className="mx-auto max-w-xl px-5 pb-12">
        <Suspense fallback={null}>
          <StartAssessmentButton slug={slug} label="Recommencer" color={result.primaryColor} />
        </Suspense>
      </div>
    </main>
  )
}
