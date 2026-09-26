import type { ImportMode, ImportQuestion } from "@/lib/importers/model"
import type { BuilderQuestion } from "@/types/builder"
import type { Json } from "@/types/database"

export function linkedDisplaySettings(imported: BuilderQuestion[], draft: ImportQuestion[], mode: ImportMode) {
  const ordered = [...draft].sort((left, right) => left.order - right.order)
  const pool = [...imported].sort((left, right) => left.position - right.position)
  const slice = mode === "replace" ? pool : pool.slice(Math.max(0, pool.length - ordered.length))
  if (slice.length !== ordered.length) return []
  const byRef = new Map<string, BuilderQuestion>()
  ordered.forEach((item, index) => {
    const match = slice[index]
    if (match && match.title === item.title) byRef.set(item.ref, match)
  })
  return ordered.flatMap((item) => {
    const list = item.displays?.length ? item.displays : item.display ? [item.display] : []
    if (list.length === 0) return []
    const target = byRef.get(item.ref)
    if (!target) return []
    const conditions = list.flatMap((display) => {
      const source = byRef.get(display.sourceRef)
      if (!source || source.position >= target.position) return []
      const expected = display.value.trim().toLowerCase()
      const option = source.options.find((candidate) => candidate.id === display.value || candidate.label.trim().toLowerCase() === expected || candidate.value.trim().toLowerCase() === expected)
      return [{ questionId: source.id, operator: display.operator, value: option?.id ?? display.value }]
    })
    if (conditions.length !== list.length) return []
    return [{
      id: target.id,
      settings: {
        ...target.settings,
        displayRule: { mode: list[0]?.mode, conditions },
      } as Json,
    }]
  })
}
