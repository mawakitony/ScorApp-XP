export type TimelineItem = {
  at: string
  label: string
}

const visitorLabels: Record<string, string> = {
  assessment_started: "Évaluation commencée",
  lead_submitted: "Coordonnées envoyées",
  lead_captured: "Coordonnées envoyées",
  assessment_completed: "Évaluation terminée",
  result_viewed: "Résultat consulté",
}

export function visitorTimeline(
  events: { event_type: string; created_at: string }[],
  extras: { at: string; label: string }[],
) {
  const items: TimelineItem[] = []
  for (const event of events) {
    const label = visitorLabels[event.event_type]
    if (!label) continue
    items.push({ at: event.created_at, label })
  }
  items.push(...extras)
  return items.sort((a, b) => a.at.localeCompare(b.at))
}
