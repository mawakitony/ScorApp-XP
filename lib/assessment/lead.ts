import { TEXT_LIMITS } from "@/lib/assessment/config"
import { isCountryCode } from "@/lib/geo/countries"

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

export function normalizePhone(value: string) {
  const raw = value.trim().replace(/\s+/g, " ")
  const compact = raw.replace(/[^\d+]/g, "")
  const normalized = compact.startsWith("+")
    ? `+${compact.slice(1).replace(/\D/g, "")}`
    : compact.replace(/\D/g, "")
  return { raw, normalized }
}

export function normalizePerson(input: {
  firstName: string
  lastName: string
  email: string
  phone: string
  whatsapp: string
  company: string
  jobTitle: string
  country: string
  city: string
}) {
  return {
    firstName: input.firstName.trim().slice(0, TEXT_LIMITS.name),
    lastName: input.lastName.trim().slice(0, TEXT_LIMITS.name),
    email: normalizeEmail(input.email).slice(0, TEXT_LIMITS.email),
    phone: normalizePhone(input.phone),
    whatsapp: normalizePhone(input.whatsapp),
    company: input.company.trim().slice(0, TEXT_LIMITS.company),
    jobTitle: input.jobTitle.trim().slice(0, TEXT_LIMITS.job_title),
    country: input.country.trim().toUpperCase(),
    city: input.city.trim().slice(0, TEXT_LIMITS.city),
  }
}

export function leadFieldError(
  key: string,
  value: string,
  required: boolean,
) {
  if (required && !value.trim()) return "Ce champ est obligatoire."
  if (!value.trim()) return null
  if (key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return "Email invalide."
  if (key === "country" && !isCountryCode(value.trim().toUpperCase())) return "Pays invalide."
  if ((key === "phone" || key === "whatsapp") && value.trim().length > TEXT_LIMITS.phone) return "Numéro trop long."
  if ((key === "company" || key === "job_title" || key === "city" || key === "first_name" || key === "last_name") && value.trim().length > TEXT_LIMITS.company) {
    return "Texte trop long."
  }
  return null
}
