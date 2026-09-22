import React from "react"
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer"
import type { AdminReport, ParticipantReport } from "./dto"

export type InternalDetails = Pick<AdminReport, "leadStatus" | "temperature" | "quality" | "source" | "campaign" | "email" | "phone" | "answers" | "notes">

const styles = StyleSheet.create({
  page: { padding: 48, backgroundColor: "#F7F4EE", color: "#16324F", fontFamily: "Helvetica" },
  brand: { fontSize: 11, letterSpacing: 2, color: "#8A7340" },
  title: { fontSize: 26, marginTop: 16, fontFamily: "Helvetica-Bold" },
  score: { fontSize: 42, marginTop: 18 },
  badge: { marginTop: 10, alignSelf: "flex-start", backgroundColor: "#16324F", color: "#F7F4EE", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, fontSize: 11 },
  body: { fontSize: 12, lineHeight: 1.5, marginTop: 12, color: "#3D4D61" },
  heading: { fontSize: 16, marginTop: 8, marginBottom: 8, fontFamily: "Helvetica-Bold" },
  row: { marginBottom: 8 },
  label: { fontSize: 11, marginBottom: 3 },
  track: { height: 8, backgroundColor: "#E6E0D4", borderRadius: 4 },
  bar: { height: 8, backgroundColor: "#16324F", borderRadius: 4 },
  item: { fontSize: 12, marginBottom: 6, color: "#3D4D61" },
  footer: { marginTop: 24, fontSize: 10, color: "#5E6D7E" },
  internal: { marginTop: 8, fontSize: 12, color: "#8A7340" },
})

export function ReportDocument({ report, internal = false, details = null }: { report: ParticipantReport; internal?: boolean; details?: InternalDetails | null }) {
  const english = report.language === "en"
  return React.createElement(
    Document,
    { title: report.scorecardTitle, author: report.brandName },
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(Text, { style: styles.brand }, report.brandName),
      internal ? React.createElement(Text, { style: styles.internal }, "Internal") : null,
      React.createElement(Text, { style: styles.title }, report.scorecardTitle),
      React.createElement(Text, { style: styles.body }, report.participantLabel),
      React.createElement(Text, { style: styles.score }, `${Math.round(report.overallPercent)}%`),
      report.badge ? React.createElement(Text, { style: styles.badge }, report.badge) : null,
      React.createElement(Text, { style: styles.body }, report.summary),
    ),
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(Text, { style: styles.heading }, english ? "Categories" : "Catégories"),
      ...report.categories.map((category) => React.createElement(
        View,
        { key: category.name, style: styles.row },
        React.createElement(Text, { style: styles.label }, `${category.name} · ${Math.round(category.percent)}%`),
        React.createElement(View, { style: styles.track }, React.createElement(View, { style: [styles.bar, { width: `${Math.max(0, Math.min(100, category.percent))}%` }] })),
      )),
      React.createElement(Text, { style: styles.heading }, english ? "Strengths" : "Forces"),
      ...report.strengths.map((item) => React.createElement(Text, { key: item, style: styles.item }, `• ${item}`)),
    ),
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(Text, { style: styles.heading }, english ? "Areas to strengthen" : "Axes d'amélioration"),
      ...report.improvementAreas.map((item) => React.createElement(Text, { key: item, style: styles.item }, `• ${item}`)),
      React.createElement(Text, { style: styles.heading }, english ? "Recommendation" : "Recommandation"),
      ...report.recommendations.map((item) => React.createElement(Text, { key: item, style: styles.item }, item)),
      report.ctaLabel ? React.createElement(Text, { style: styles.body }, report.ctaLabel) : null,
      report.disclaimer ? React.createElement(Text, { style: styles.footer }, report.disclaimer) : null,
      React.createElement(Text, { style: styles.footer }, [report.brandName, report.website, report.contactEmail, report.footer].filter(Boolean).join(" · ")),
    ),
    internal && details
      ? React.createElement(
          Page,
          { size: "A4", style: styles.page },
          React.createElement(Text, { style: styles.internal }, "Internal"),
          React.createElement(Text, { style: styles.heading }, english ? "Lead" : "Lead"),
          React.createElement(Text, { style: styles.item }, `${english ? "Status" : "Statut"} · ${details.leadStatus ?? "—"}`),
          React.createElement(Text, { style: styles.item }, `${english ? "Temperature" : "Température"} · ${details.temperature ?? "—"}`),
          React.createElement(Text, { style: styles.item }, `${english ? "Quality" : "Qualité"} · ${details.quality ?? "—"}`),
          React.createElement(Text, { style: styles.item }, `Source · ${details.source ?? "—"}`),
          React.createElement(Text, { style: styles.item }, `${english ? "Campaign" : "Campagne"} · ${details.campaign ?? "—"}`),
          details.email ? React.createElement(Text, { style: styles.item }, details.email) : null,
          details.phone ? React.createElement(Text, { style: styles.item }, details.phone) : null,
          React.createElement(Text, { style: styles.heading }, english ? "Answers" : "Réponses"),
          ...details.answers.slice(0, 40).map((answer, index) => React.createElement(Text, { key: `answer-${index}`, style: styles.item }, `${answer.question} · ${answer.answer}`)),
          React.createElement(Text, { style: styles.heading }, english ? "Internal notes" : "Notes internes"),
          ...details.notes.slice(0, 12).map((note, index) => React.createElement(Text, { key: `note-${index}`, style: styles.item }, note)),
        )
      : null,
  )
}

export async function renderReportPdf(report: ParticipantReport, internal = false, details: InternalDetails | null = null) {
  const output = await renderToBuffer(ReportDocument({ report, internal, details }))
  return Buffer.from(output)
}
