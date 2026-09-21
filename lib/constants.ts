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
  { id: "setup", label: "Setup" },
  { id: "landing", label: "Landing Page" },
  { id: "questions", label: "Questions" },
  { id: "categories", label: "Categories" },
  { id: "scoring", label: "Scoring" },
  { id: "lead", label: "Lead Capture" },
  { id: "results", label: "Results" },
  { id: "preview", label: "Preview" },
] as const

export type BuilderStepId = (typeof BUILDER_STEPS)[number]["id"]

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
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/dashboard/scorecards", label: "Scorecards", icon: "scorecards" },
  { href: "/dashboard/leads", label: "Leads", icon: "leads" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "analytics" },
  { href: "/dashboard/templates", label: "Templates", icon: "templates" },
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
] as const
