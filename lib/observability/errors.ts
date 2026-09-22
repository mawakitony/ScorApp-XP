export const ERROR_CODES = [
  "ASSESSMENT_SESSION_INVALID",
  "QUOTA_EXCEEDED",
  "REPORT_GENERATION_FAILED",
  "WEBHOOK_DELIVERY_FAILED",
  "BILLING_UNAVAILABLE",
  "DOMAIN_VERIFICATION_FAILED",
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

const PUBLIC_MESSAGE: Record<ErrorCode, string> = {
  ASSESSMENT_SESSION_INVALID: "Cette session n'est plus disponible.",
  QUOTA_EXCEEDED: "Cette évaluation est momentanément indisponible.",
  REPORT_GENERATION_FAILED: "Le rapport n'a pas pu être préparé.",
  WEBHOOK_DELIVERY_FAILED: "La livraison n'a pas abouti.",
  BILLING_UNAVAILABLE: "La facturation est momentanément indisponible.",
  DOMAIN_VERIFICATION_FAILED: "Le domaine n'a pas pu être vérifié.",
}

export function publicError(code: ErrorCode) {
  return PUBLIC_MESSAGE[code]
}
