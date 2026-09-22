export function reportEventCounts(events: string[]) {
  return {
    reports_generated: events.filter((event) => event === "report.generated").length,
    reports_downloaded: events.filter((event) => event === "report.downloaded").length,
    reports_shared: events.filter((event) => event === "report.shared").length,
    report_email_sent: events.filter((event) => event === "report.email_sent").length,
  }
}
