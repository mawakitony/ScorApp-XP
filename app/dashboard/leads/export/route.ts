import { can } from "@/lib/auth/permissions"
import { organizationHasFeature } from "@/lib/billing/account"
import { ensureMembership } from "@/lib/data/membership"
import { queryLeads } from "@/lib/data/crm"
import { parseLeadFilters } from "@/lib/leads/filters"
import { toCsv } from "@/lib/leads/csv"
import { CSV_EXPORT_LIMIT } from "@/lib/leads/qualification"

const headers = [
  "First Name", "Last Name", "Email", "Phone", "WhatsApp", "Country", "City", "Company", "Job Title",
  "Score", "Result", "Temperature", "Status", "Scorecard", "UTM Source", "UTM Medium", "UTM Campaign",
  "Created At", "CTA Clicked",
]

export async function GET(request: Request) {
  const membership = await ensureMembership()
  if (!membership || !can({ role: membership.role }, "lead.export")) return new Response("Accès refusé.", { status: 401 })
  if (!(await organizationHasFeature(membership.organization.id, "csv_export"))) {
    return new Response("L'export CSV est disponible à partir du plan Starter.", { status: 402 })
  }
  const url = new URL(request.url)
  const filters = parseLeadFilters(Object.fromEntries(url.searchParams.entries()))
  const loaded = await queryLeads(filters, true)
  if (loaded.error === "Accès refusé.") return new Response("Accès refusé.", { status: 401 })
  if (loaded.error) return new Response("Export impossible.", { status: 500 })
  const csv = toCsv(headers, loaded.rows.map((row) => [
    row.first_name, row.last_name, row.email, row.phone, row.whatsapp, row.country, row.city, row.company, row.job_title,
    row.score, row.result, row.temperature, row.status, row.scorecard, row.utm_source, row.utm_medium, row.utm_campaign,
    row.created_at, row.cta_clicked ? "yes" : "no",
  ]))
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"woloyem-leads.csv\"",
      "X-Export-Limit": String(CSV_EXPORT_LIMIT),
    },
  })
}
