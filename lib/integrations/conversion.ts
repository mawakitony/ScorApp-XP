export type ConversionMatchInput = {
  organizationId: string
  leadId?: string | null
  sessionId?: string | null
  email?: string | null
  externalReference?: string | null
}

export function conversionMatchOrder(input: ConversionMatchInput) {
  const steps: string[] = []
  if (input.leadId) steps.push("lead_id")
  if (input.sessionId) steps.push("session_id")
  if (input.email) steps.push("email")
  if (input.externalReference) steps.push("external_reference")
  return steps
}

export function sameTenant(left: string, right: string) {
  return left.length > 0 && left === right
}

export function valuesByCurrency(rows: { currency: string | null; value: number | null }[]) {
  const grouped = new Map<string, number>()
  for (const row of rows) {
    if (row.value === null || !row.currency) continue
    const currency = row.currency.toUpperCase()
    grouped.set(currency, (grouped.get(currency) ?? 0) + row.value)
  }
  return [...grouped.entries()].map(([currency, total]) => ({ currency, total }))
}
