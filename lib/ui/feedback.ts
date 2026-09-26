export function saveStatusLabel(state: { status: string; savedAt: number | null }, now = Date.now()) {
  if (state.status === "saving") return "Enregistrement…"
  if (state.status === "error") return "Impossible d'enregistrer. Réessayez."
  if (state.status !== "saved" || state.savedAt == null) return ""
  const seconds = Math.round((now - state.savedAt) / 1000)
  if (seconds < 8) return "Enregistré"
  if (seconds < 60) return "Enregistré à l'instant"
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `Enregistré il y a ${minutes} min`
}
