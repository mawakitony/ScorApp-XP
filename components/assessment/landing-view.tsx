"use client"

import Link from "next/link"
import type { BuilderBenefit, BuilderTestimonial } from "@/types/builder"

export type LandingContent = {
  eyebrow: string
  title: string
  subtitle: string
  description: string
  heroImageUrl: string
  ctaLabel: string
  estimatedTimeLabel: string
  showEstimatedTime: boolean
  showQuestionCount: boolean
  showPrivacy: boolean
  privacyText: string
  benefits: BuilderBenefit[]
  testimonial: BuilderTestimonial
  primaryColor: string
  secondaryColor: string
  logoUrl: string
  estimatedMinutes: number
  questionCount: number
  previewBanner?: boolean
  poweredBy?: boolean
}

export function LandingView({
  content,
  ctaHref,
  onStart,
  cta,
}: {
  content: LandingContent
  ctaHref?: string
  onStart?: () => void
  cta?: React.ReactNode
}) {
  const timeLabel = content.estimatedTimeLabel || `${content.estimatedMinutes} min`

  return (
    <div className="min-h-full" style={{ background: "#f7f4ee", color: "#142033" }}>
      <div className="mx-auto flex w-full max-w-3xl flex-col px-5 py-8 md:py-12">
        {content.previewBanner ? (
          <p className="mb-6 rounded-xl bg-[#f3e6c4] px-4 py-2 text-sm">Aperçu privé. Cette scorecard n&apos;est pas publique.</p>
        ) : null}
        {content.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={content.logoUrl} alt="" className="mb-6 h-10 w-auto object-contain object-left" />
        ) : (
          <p className="text-sm tracking-[0.2em] uppercase" style={{ color: content.secondaryColor }}>
            WOLOYEM
          </p>
        )}
        {content.eyebrow ? (
          <p className="mt-4 text-sm font-medium" style={{ color: content.secondaryColor }}>
            {content.eyebrow}
          </p>
        ) : null}
        <h1 className="font-display mt-3 text-4xl leading-tight md:text-5xl">{content.title}</h1>
        {content.subtitle ? <p className="mt-4 text-xl text-[#3d4d61]">{content.subtitle}</p> : null}
        {content.description ? <p className="mt-4 max-w-xl text-[#3d4d61]">{content.description}</p> : null}
        {content.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={content.heroImageUrl} alt="" className="mt-6 aspect-[16/8] w-full rounded-2xl object-cover" />
        ) : null}
        {content.benefits.length > 0 ? (
          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {content.benefits.map((benefit) => (
              <li key={benefit.title} className="rounded-2xl bg-white/70 p-4">
                <p className="font-medium">{benefit.title}</p>
                {benefit.description ? <p className="mt-1 text-sm text-[#3d4d61]">{benefit.description}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-8 flex flex-wrap gap-4 text-sm text-[#5e6d7e]">
          {content.showEstimatedTime ? <span>{timeLabel}</span> : null}
          {content.showQuestionCount ? <span>{content.questionCount} questions</span> : null}
        </div>
        {cta ? (
          cta
        ) : onStart ? (
          <button
            type="button"
            onClick={onStart}
            className="mt-8 inline-flex h-12 items-center justify-center rounded-xl px-6 text-base text-white"
            style={{ background: content.primaryColor }}
          >
            {content.ctaLabel || "Commencer"}
          </button>
        ) : (
          <Link
            href={ctaHref || "#"}
            className="mt-8 inline-flex h-12 items-center justify-center rounded-xl px-6 text-base text-white"
            style={{ background: content.primaryColor }}
          >
            {content.ctaLabel || "Commencer"}
          </Link>
        )}
        {content.testimonial.quote ? (
          <figure className="mt-10 border-l-2 pl-4" style={{ borderColor: content.secondaryColor }}>
            <blockquote className="text-[#3d4d61]">“{content.testimonial.quote}”</blockquote>
            <figcaption className="mt-2 text-sm">
              {content.testimonial.author}
              {content.testimonial.role ? ` · ${content.testimonial.role}` : ""}
            </figcaption>
          </figure>
        ) : null}
        {content.showPrivacy && content.privacyText ? (
          <p className="mt-8 max-w-xl text-sm text-[#5e6d7e]">{content.privacyText}</p>
        ) : null}
        {content.poweredBy !== false ? <p className="mt-8 text-xs tracking-wide text-[#8a7340] uppercase">Powered by WOLOYEM Score</p> : null}
      </div>
    </div>
  )
}
