import type { ParticipantReport } from "@/lib/reports/dto"

export function ReportView({
  report,
  downloadHref,
  preparing,
  failed,
}: {
  report: ParticipantReport
  downloadHref?: string
  preparing?: boolean
  failed?: boolean
}) {
  const english = report.language === "en"
  return (
    <article className="report-sheet mx-auto w-full max-w-3xl px-5 py-10 text-[#16324F] print:max-w-none print:px-0">
      <style>{`@media print { .report-actions { display: none } body { background: white } }`}</style>
      <p className="text-sm tracking-[0.18em] text-[#8a7340] uppercase">{report.brandName}</p>
      <h1 className="font-display mt-4 text-4xl">{report.scorecardTitle}</h1>
      <p className="mt-2 text-[#3d4d61]">{report.participantLabel}</p>
      <p className="font-display mt-6 text-6xl">{Math.round(report.overallPercent)} %</p>
      {report.badge ? <p className="mt-3 inline-flex rounded-full bg-[#16324F] px-3 py-1 text-sm text-[#f7f4ee]">{report.badge}</p> : null}
      <p className="mt-6 max-w-2xl text-[#3d4d61]">{report.summary}</p>
      {report.categories.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-display text-2xl">{english ? "Categories" : "Catégories"}</h2>
          <ul className="mt-4 space-y-3">
            {report.categories.map((category) => (
              <li key={category.name}>
                <div className="mb-1 flex justify-between text-sm"><span>{category.name}</span><span>{Math.round(category.percent)} %</span></div>
                <div className="h-2 rounded-full bg-[#e6e0d4]"><div className="h-2 rounded-full bg-[#16324F]" style={{ width: `${Math.max(0, Math.min(100, category.percent))}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {report.strengths.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl">{english ? "Strengths" : "Forces"}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[#3d4d61]">{report.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      ) : null}
      {report.improvementAreas.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl">{english ? "Areas to strengthen" : "Axes d'amélioration"}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[#3d4d61]">{report.improvementAreas.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      ) : null}
      {report.recommendations.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl">{english ? "Recommendation" : "Recommandation"}</h2>
          {report.recommendations.map((item) => <p key={item} className="mt-3 text-[#3d4d61]">{item}</p>)}
        </section>
      ) : null}
      <div className="report-actions mt-8 flex flex-wrap gap-3">
        {downloadHref ? <a className="inline-flex h-11 items-center rounded-xl bg-[#16324F] px-5 text-sm text-[#f7f4ee]" href={downloadHref}>{english ? "Download my report" : "Télécharger mon rapport"}</a> : null}
        {preparing ? <p className="text-sm text-[#5e6d7e]">{english ? "Preparing your report..." : "Préparation de votre rapport..."}</p> : null}
        {failed ? <p className="text-sm text-[#5e6d7e]">{english ? "Report generation failed" : "La génération du rapport a échoué"}</p> : null}
      </div>
      {report.ctaLabel ? <p className="mt-8 font-medium">{report.ctaLabel}</p> : null}
      {report.disclaimer ? <p className="mt-8 text-sm text-[#5e6d7e]">{report.disclaimer}</p> : null}
      <p className="mt-4 text-sm text-[#5e6d7e]">{[report.brandName, report.website, report.contactEmail, report.footer].filter(Boolean).join(" · ")}</p>
    </article>
  )
}
