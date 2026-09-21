import type { Json } from "@/types/database"
import type { BuilderBenefit, BuilderTestimonial, LeadField, LeadFieldKey, QuestionSettings } from "@/types/builder"
import { leadFieldKeys } from "@/lib/validators/builder"

const defaultLabels: Record<LeadFieldKey, string> = {
  first_name: "Prénom",
  last_name: "Nom",
  email: "Email",
  phone: "Téléphone",
  whatsapp: "WhatsApp",
  company: "Entreprise",
  job_title: "Fonction",
  country: "Pays",
  city: "Ville",
}

export function defaultLeadField(key: LeadFieldKey): LeadField {
  const required = key === "email" || key === "first_name"
  return {
    enabled: key === "email" || key === "first_name" || key === "last_name",
    required,
    label: defaultLabels[key],
    placeholder: "",
  }
}

export function parseLeadFields(value: Json | null): Record<LeadFieldKey, LeadField> {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {}
  return Object.fromEntries(
    leadFieldKeys.map((key) => {
      const raw = source[key]
      const base = defaultLeadField(key)
      if (raw === "required" || raw === "optional" || raw === "hidden") {
        return [key, { ...base, enabled: raw !== "hidden", required: raw === "required" }]
      }
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        return [
          key,
          {
            enabled: typeof raw.enabled === "boolean" ? raw.enabled : base.enabled,
            required: typeof raw.required === "boolean" ? raw.required : base.required,
            label: typeof raw.label === "string" && raw.label.trim() ? raw.label : base.label,
            placeholder: typeof raw.placeholder === "string" ? raw.placeholder : "",
          },
        ]
      }
      return [key, base]
    }),
  ) as Record<LeadFieldKey, LeadField>
}

export function serializeLeadFields(fields: Record<LeadFieldKey, LeadField>): Json {
  return fields
}

export function parseBenefits(value: Json | null): BuilderBenefit[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [{ title: item, description: "", icon: "" }]
    if (!item || typeof item !== "object" || Array.isArray(item)) return []
    const title = typeof item.title === "string" ? item.title : ""
    if (!title.trim()) return []
    return [{
      title,
      description: typeof item.description === "string" ? item.description : "",
      icon: typeof item.icon === "string" ? item.icon : "",
    }]
  })
}

export function parseTestimonial(value: Json | null): BuilderTestimonial {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { quote: "", author: "", role: "" }
  }
  return {
    quote: typeof value.quote === "string" ? value.quote : "",
    author: typeof value.author === "string" ? value.author : "",
    role: typeof value.role === "string" ? value.role : "",
  }
}

export function parseQuestionSettings(value: Json | null, type: string): QuestionSettings {
  const base = type === "scale_10"
    ? { scaleFrom: 1, scaleTo: 10, scoreFrom: 0, scoreTo: 100 }
    : { scaleFrom: 1, scaleTo: 5, scoreFrom: 0, scoreTo: 100 }
  if (!value || typeof value !== "object" || Array.isArray(value)) return base
  return {
    scaleFrom: numberOr(value.scaleFrom, base.scaleFrom),
    scaleTo: numberOr(value.scaleTo, base.scaleTo),
    scoreFrom: numberOr(value.scoreFrom, base.scoreFrom),
    scoreTo: numberOr(value.scoreTo, base.scoreTo),
  }
}

function numberOr(value: Json | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}
