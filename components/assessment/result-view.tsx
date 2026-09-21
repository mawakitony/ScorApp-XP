"use client"

export function ResultView({
  percentage,
  range,
  categories,
  categoryScores,
  namedScores,
  primaryColor,
  disclaimer,
  heading = "Résultat",
  ctaHref,
}: {
  percentage: number
  range: {
    badge: string
    title: string
    description: string
    recommendationBody: string
    ctaLabel: string
    ctaUrl: string
  } | null
  categories: { id: string; name: string }[]
  categoryScores: { categoryId: string; percent: number }[]
  namedScores?: { name: string; percent: number }[]
  primaryColor: string
  disclaimer?: string
  heading?: string
  ctaHref?: string
}) {
  const scores = namedScores ?? categoryScores.map((score) => ({
    name: categories.find((item) => item.id === score.categoryId)?.name ?? "Catégorie",
    percent: score.percent,
  }))
  const href = ctaHref || range?.ctaUrl || ""

  return (
    <section className="mx-auto w-full max-w-xl px-5 py-8" style={{ color: "#142033" }}>
      <p className="text-sm tracking-[0.16em] text-[#8a7340] uppercase">{heading}</p>
      <p className="font-display mt-3 text-5xl">{Math.round(percentage)} %</p>
      {range?.badge ? (
        <p className="mt-3 inline-flex rounded-full px-3 py-1 text-sm text-white" style={{ background: primaryColor }}>
          {range.badge}
        </p>
      ) : null}
      <h2 className="font-display mt-4 text-3xl">{range?.title || "Résultat"}</h2>
      {range?.description ? <p className="mt-3 text-[#3d4d61]">{range.description}</p> : null}
      {scores.length > 0 ? (
        <ul className="mt-6 space-y-2">
          {scores.map((score) => (
            <li key={score.name} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm">
              <span>{score.name}</span>
              <span>{Math.round(score.percent)} %</span>
            </li>
          ))}
        </ul>
      ) : null}
      {range?.recommendationBody ? <p className="mt-6 text-[#3d4d61]">{range.recommendationBody}</p> : null}
      {range?.ctaLabel && href ? (
        <a
          href={href}
          className="mt-6 inline-flex h-12 items-center justify-center rounded-xl px-6 text-white"
          style={{ background: primaryColor }}
        >
          {range.ctaLabel}
        </a>
      ) : null}
      {disclaimer ? <p className="mt-8 text-sm text-[#5e6d7e]">{disclaimer}</p> : null}
    </section>
  )
}
