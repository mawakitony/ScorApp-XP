export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value)} %`
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value)
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value))
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

export function formatChartDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(
    new Date(`${value}T00:00:00.000Z`),
  )
}

export function emptyToNull(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function initials(name: string | null | undefined, email: string | null | undefined) {
  const source = name?.trim() || email || "W"
  const parts = source.split(/\s+/).slice(0, 2)
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "W"
}
