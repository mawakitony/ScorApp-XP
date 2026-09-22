export type BrevoLead = {
  email: string | null
  firstName: string | null
  lastName: string | null
  phone: string | null
  whatsapp: string | null
  country: string | null
  city: string | null
  company: string | null
  jobTitle: string | null
  score: number | null
  result: string | null
  scorecard: string | null
  status: string | null
  temperature: string | null
  thirdPartyConsent: boolean
}

export function brevoContact(lead: BrevoLead, options: { allowResultConsent: boolean }) {
  if (!lead.email) return { skipped: "missing_email" as const }
  if (!lead.thirdPartyConsent && !options.allowResultConsent) return { skipped: "missing_consent" as const }
  return {
    email: lead.email,
    attributes: {
      FIRSTNAME: lead.firstName,
      LASTNAME: lead.lastName,
      SMS: lead.phone,
      WHATSAPP: lead.whatsapp,
      COUNTRY: lead.country,
      CITY: lead.city,
      COMPANY: lead.company,
      JOB_TITLE: lead.jobTitle,
      WOLOYEM_SCORE: lead.score,
      WOLOYEM_RESULT: lead.result,
      WOLOYEM_SCORECARD: lead.scorecard,
      WOLOYEM_STATUS: lead.status,
      WOLOYEM_TEMPERATURE: lead.temperature,
    },
  }
}

export function hotLeadKey(leadId: string) {
  return `hot:${leadId}`
}

export async function pushBrevoContact(input: {
  apiKey: string
  listId: number | null
  email: string
  attributes: Record<string, string | number | null>
  fetchImpl?: typeof fetch
}) {
  const attributes = Object.fromEntries(
    Object.entries(input.attributes).filter((entry) => entry[1] !== null && entry[1] !== ""),
  )
  const response = await (input.fetchImpl ?? fetch)("https://api.brevo.com/v3/contacts", {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
    headers: {
      "api-key": input.apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      updateEnabled: true,
      attributes,
      ...(input.listId ? { listIds: [input.listId] } : {}),
    }),
  })
  return { ok: response.ok || response.status === 204, status: response.status }
}
