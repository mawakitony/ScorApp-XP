export const SCORECARD_CATEGORIES = [
  "PMP",
  "CAPM",
  "PgMP",
  "PMI-ACP",
  "ITIL",
  "PRINCE2",
  "PMO",
  "Gestion de projet",
  "Project Management",
  "Business Case",
  "Autre",
  "Other",
] as const

export const STATUS_LABELS = {
  draft: "Brouillon",
  published: "Publiée",
  paused: "En pause",
  archived: "Archivée",
} as const

export const BUILDER_STEPS = [
  { id: "setup", label: "Identité" },
  { id: "landing", label: "Page d'accueil" },
  { id: "questions", label: "Questions" },
  { id: "categories", label: "Catégories" },
  { id: "scoring", label: "Score" },
  { id: "lead", label: "Contact" },
  { id: "results", label: "Résultats" },
  { id: "preview", label: "Aperçu" },
] as const

export type BuilderStepId = (typeof BUILDER_STEPS)[number]["id"]

export function isBuilderStep(value: string | undefined): value is BuilderStepId {
  return BUILDER_STEPS.some((step) => step.id === value)
}

export const QUESTION_TYPE_LABELS = {
  single_choice: "Choix unique",
  multiple_choice: "Choix multiple",
  yes_no: "Oui / Non",
  scale_5: "Échelle 1–5",
  scale_10: "Échelle 1–10",
  short_text: "Texte court",
  long_text: "Texte long",
  number: "Nombre",
  email: "Email",
  phone: "Téléphone",
  country: "Pays",
  dropdown: "Liste déroulante",
} as const

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Tableau de bord", icon: "dashboard" },
  { href: "/dashboard/scorecards", label: "Scorecards", icon: "scorecards" },
  { href: "/dashboard/leads", label: "Leads", icon: "leads" },
  { href: "/dashboard/analytics", label: "Statistiques", icon: "analytics" },
  { href: "/dashboard/templates", label: "Modèles", icon: "templates" },
  { href: "/dashboard/settings", label: "Réglages", icon: "settings" },
] as const
