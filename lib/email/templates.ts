export type EmailTemplate = "organization_invitation" | "trial_ending" | "payment_failed" | "report_ready" | "support_notice"

export function renderEmail(input: { template: EmailTemplate; locale: string; payload: Record<string, string> }) {
  const english = input.locale === "en"
  const name = input.payload.organizationName || "WOLOYEM Score"
  if (input.template === "organization_invitation") {
    return {
      subject: english ? `Invitation to ${name}` : `Invitation à rejoindre ${name}`,
      text: english
        ? `You have been invited to join ${name} on WOLOYEM Score.\n\nAccept invitation: ${input.payload.url}`
        : `Vous êtes invité à rejoindre ${name} sur WOLOYEM Score.\n\nAccepter l'invitation : ${input.payload.url}`,
    }
  }
  if (input.template === "trial_ending") {
    return {
      subject: english ? "Your trial ends soon" : "Votre essai se termine bientôt",
      text: english ? `The trial for ${name} ends on ${input.payload.date}.` : `L'essai de ${name} se termine le ${input.payload.date}.`,
    }
  }
  if (input.template === "payment_failed") {
    return {
      subject: english ? "Payment failed" : "Paiement échoué",
      text: english ? `The latest payment for ${name} did not succeed.` : `Le dernier paiement de ${name} n'a pas abouti.`,
    }
  }
  if (input.template === "report_ready") {
    return {
      subject: english ? "Your report is ready" : "Votre rapport est prêt",
      text: english ? `A report for ${name} is ready.` : `Un rapport pour ${name} est prêt.`,
    }
  }
  return {
    subject: english ? "Support access opened" : "Accès support ouvert",
    text: english
      ? `WOLOYEM support opened a temporary access to ${name}.`
      : `Le support WOLOYEM a ouvert un accès temporaire à ${name}.`,
  }
}

const DELAYS_SECONDS = [60, 300, 1800, 7200, 43200]

export function nextEmailAttempt(attempts: number, now = Date.now()) {
  if (attempts >= DELAYS_SECONDS.length) return { status: "dead" as const, nextRunAt: null }
  return { status: "failed" as const, nextRunAt: new Date(now + DELAYS_SECONDS[attempts] * 1000).toISOString() }
}

export function invitationIdempotencyKey(invitationId: string) {
  return `organization_invitation:${invitationId}`
}
