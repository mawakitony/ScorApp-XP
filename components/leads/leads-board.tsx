"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { assignTagToLeads, changeLeadsStatus, changeLeadStatus } from "@/actions/leads"
import { filtersToSearch, LEAD_SORTS, PAGE_SIZES, type LeadFilters } from "@/lib/leads/filters"
import { LEAD_STATUSES, LEAD_TEMPERATURES } from "@/lib/leads/qualification"
import { formatDate } from "@/lib/format"

type Tag = { id: string; name: string; color: string }
type Row = {
  id: string
  name: string
  email: string | null
  phone: string | null
  country: string | null
  score: number | null
  temperature: string
  status: string
  scorecard: string | null
  utm_source: string | null
  created_at: string
  tags: Tag[]
}

const statusLabel: Record<string, string> = {
  new: "Nouveau",
  contacted: "Contacté",
  qualified: "Qualifié",
  nurturing: "Nurturing",
  converted: "Converti",
  lost: "Perdu",
}

const temperatureLabel: Record<string, string> = { cold: "Froid", warm: "Tiède", hot: "Chaud" }

export function LeadsBoard({
  rows,
  total,
  filters,
  facets,
  canEdit,
  error,
}: {
  rows: Row[]
  total: number
  filters: LeadFilters
  facets: { tags: Tag[]; ranges: { id: string; label: string }[]; countries: string[]; sources: string[]; campaigns: string[]; scorecards: { id: string; name: string }[] }
  canEdit: boolean
  error: string | null
}) {
  const router = useRouter()
  const [query, setQuery] = useState(filters.query)
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState("")
  const pages = Math.max(1, Math.ceil(total / filters.size))
  const exportParams = filtersToSearch({ ...filters, page: 1, ids: [] })
  const active = Boolean(filters.query || filters.status || filters.temperature || filters.scorecardId || filters.country || filters.tagId || filters.resultRangeId || filters.scoreMin !== null || filters.scoreMax !== null || filters.from || filters.to || filters.utmSource || filters.utmCampaign || filters.cta)

  useEffect(() => {
    const handle = setTimeout(() => {
      if (query === filters.query) return
      push({ ...filters, query, page: 1 })
    }, 300)
    return () => clearTimeout(handle)
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  function push(next: LeadFilters) {
    const params = filtersToSearch(next)
    router.push(params.size ? `/dashboard/leads?${params}` : "/dashboard/leads")
  }

  function update(partial: Partial<LeadFilters>) {
    push({ ...filters, ...partial, page: 1, ids: [] })
  }

  async function run(action: () => Promise<{ error?: string; ok?: true }>) {
    const result = await action()
    setMessage(result.error ?? "")
    if (!result.error) {
      setSelected([])
      router.refresh()
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, email, téléphone, entreprise" aria-label="Rechercher un lead" className="h-10 rounded-lg border bg-card px-3 text-sm md:col-span-2" />
        <Select label="Scorecard" value={filters.scorecardId ?? ""} onChange={(value) => update({ scorecardId: value || null })} options={facets.scorecards.map((item) => ({ value: item.id, label: item.name }))} />
        <Select label="Statut" value={filters.status ?? ""} onChange={(value) => update({ status: (LEAD_STATUSES.find((item) => item === value) ?? null) })} options={LEAD_STATUSES.map((item) => ({ value: item, label: statusLabel[item] ?? item }))} />
        <Select label="Température" value={filters.temperature ?? ""} onChange={(value) => update({ temperature: LEAD_TEMPERATURES.find((item) => item === value) ?? null })} options={LEAD_TEMPERATURES.map((item) => ({ value: item, label: temperatureLabel[item] ?? item }))} />
        <Select label="Pays" value={filters.country ?? ""} onChange={(value) => update({ country: value || null })} options={facets.countries.map((item) => ({ value: item, label: item }))} />
        <Select label="Tag" value={filters.tagId ?? ""} onChange={(value) => update({ tagId: value || null })} options={facets.tags.map((item) => ({ value: item.id, label: item.name }))} />
        <Select label="Résultat" value={filters.resultRangeId ?? ""} onChange={(value) => update({ resultRangeId: value || null })} options={facets.ranges.map((item) => ({ value: item.id, label: item.label }))} />
        <Select label="Source" value={filters.utmSource ?? ""} onChange={(value) => update({ utmSource: value || null })} options={facets.sources.map((item) => ({ value: item, label: item }))} />
        <Select label="Campagne" value={filters.utmCampaign ?? ""} onChange={(value) => update({ utmCampaign: value || null })} options={facets.campaigns.map((item) => ({ value: item, label: item }))} />
        <Select label="CTA" value={filters.cta ?? ""} onChange={(value) => update({ cta: value === "clicked" || value === "not_clicked" ? value : null })} options={[{ value: "clicked", label: "CTA cliqué" }, { value: "not_clicked", label: "Sans clic" }]} />
        <Select label="Tri" value={filters.sort} onChange={(value) => update({ sort: LEAD_SORTS.find((item) => item === value) ?? "newest" })} options={[{ value: "newest", label: "Plus récents" }, { value: "oldest", label: "Plus anciens" }, { value: "score_desc", label: "Score décroissant" }, { value: "score_asc", label: "Score croissant" }, { value: "name", label: "Nom" }, { value: "country", label: "Pays" }]} empty={false} />
        <label className="text-sm">Score min<input defaultValue={filters.scoreMin ?? ""} inputMode="decimal" aria-label="Score minimum" className="mt-1 h-10 w-full rounded-lg border bg-card px-3" onBlur={(event) => update({ scoreMin: event.target.value === "" ? null : Number(event.target.value) })} /></label>
        <label className="text-sm">Score max<input defaultValue={filters.scoreMax ?? ""} inputMode="decimal" aria-label="Score maximum" className="mt-1 h-10 w-full rounded-lg border bg-card px-3" onBlur={(event) => update({ scoreMax: event.target.value === "" ? null : Number(event.target.value) })} /></label>
        <label className="text-sm">Du<input type="date" defaultValue={filters.from ?? ""} aria-label="Date de début" className="mt-1 h-10 w-full rounded-lg border bg-card px-3" onChange={(event) => update({ from: event.target.value || null })} /></label>
        <label className="text-sm">Au<input type="date" defaultValue={filters.to ?? ""} aria-label="Date de fin" className="mt-1 h-10 w-full rounded-lg border bg-card px-3" onChange={(event) => update({ to: event.target.value || null })} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>{total} lead{total > 1 ? "s" : ""}</span>
        {active ? <Link className="underline" href="/dashboard/leads">Effacer les filtres</Link> : null}
        <a className="underline" href={`/dashboard/leads/export?${exportParams}`}>Exporter le filtre</a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="underline" href="/dashboard/leads/export">Exporter tout</a>
        {selected.length > 0 ? <a className="underline" href={`/dashboard/leads/export?ids=${selected.join(",")}`}>Exporter la sélection</a> : null}
      </div>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      {message ? <p className="text-sm text-destructive" role="alert">{message}</p> : null}
      {canEdit && selected.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3">
          <span className="text-sm">{selected.length} sélectionné{selected.length > 1 ? "s" : ""}</span>
          <select aria-label="Changer le statut" className="h-10 rounded-lg border px-2 text-sm" defaultValue="" onChange={(event) => { if (event.target.value) void run(() => changeLeadsStatus(selected, event.target.value)) }}>
            <option value="">Changer le statut</option>
            {LEAD_STATUSES.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}
          </select>
          <select aria-label="Ajouter un tag" className="h-10 rounded-lg border px-2 text-sm" defaultValue="" onChange={(event) => { if (event.target.value) void run(() => assignTagToLeads(selected, event.target.value)) }}>
            <option value="">Ajouter un tag</option>
            {facets.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
          </select>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-sm">
          <p>{active ? "Aucun lead ne correspond à ces filtres." : "Aucun lead pour le moment. Ils apparaissent ici dès qu'un participant termine une évaluation."}</p>
          {active ? <Link className="mt-3 inline-block underline" href="/dashboard/leads">Effacer les filtres</Link> : <Link className="mt-3 inline-block underline" href="/dashboard/scorecards">Ouvrir une scorecard</Link>}
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {rows.map((row) => (
              <article key={row.id} className="rounded-2xl border bg-card p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <Link className="font-medium underline" href={`/dashboard/leads/${row.id}`}>{row.name}</Link>
                  <Badge value={temperatureLabel[row.temperature] ?? row.temperature} />
                </div>
                <p className="mt-1 text-muted-foreground">{row.email || row.phone || "—"}</p>
                <p className="mt-2">{statusLabel[row.status] ?? row.status} · {row.score === null ? "—" : `${Math.round(row.score)} %`} · {row.country || "—"}</p>
                <p className="text-muted-foreground">{row.scorecard || "—"} · {row.utm_source || "direct"}</p>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-2xl border md:block">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-3"><span className="sr-only">Sélection</span></th>
                  {["Lead", "Contact", "Country", "Score", "Temperature", "Status", "Scorecard", "Source", "Created"].map((label) => (
                    <th key={label} className="px-3 py-3 font-medium">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-3">
                      <input type="checkbox" aria-label={`Sélectionner ${row.name}`} checked={selected.includes(row.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))} />
                    </td>
                    <td className="px-3 py-3">
                      <Link className="underline" href={`/dashboard/leads/${row.id}`}>{row.name}</Link>
                      <div className="mt-1 flex flex-wrap gap-1">{row.tags.map((tag) => <span key={tag.id} className="rounded-full px-2 py-0.5 text-xs text-white" style={{ background: tag.color }}>{tag.name}</span>)}</div>
                    </td>
                    <td className="px-3 py-3">{row.email || row.phone || "—"}</td>
                    <td className="px-3 py-3">{row.country || "—"}</td>
                    <td className="px-3 py-3">{row.score === null ? "—" : `${Math.round(row.score)} %`}</td>
                    <td className="px-3 py-3"><Badge value={temperatureLabel[row.temperature] ?? row.temperature} /></td>
                    <td className="px-3 py-3">
                      {canEdit ? (
                        <select aria-label={`Statut de ${row.name}`} className="h-9 rounded-lg border bg-card px-2" value={row.status} onChange={(event) => void run(() => changeLeadStatus(row.id, event.target.value))}>
                          {LEAD_STATUSES.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}
                        </select>
                      ) : statusLabel[row.status] ?? row.status}
                    </td>
                    <td className="px-3 py-3">{row.scorecard || "—"}</td>
                    <td className="px-3 py-3">{row.utm_source || "direct"}</td>
                    <td className="px-3 py-3">{formatDate(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <label>Par page
          <select aria-label="Taille de page" className="ml-2 h-9 rounded-lg border bg-card px-2" value={filters.size} onChange={(event) => update({ size: PAGE_SIZES.find((item) => item === Number(event.target.value)) ?? 25 })}>
            {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="button" className="underline disabled:opacity-40" disabled={filters.page <= 1} onClick={() => push({ ...filters, page: filters.page - 1 })}>Précédent</button>
          <span>{filters.page} / {pages}</span>
          <button type="button" className="underline disabled:opacity-40" disabled={filters.page >= pages} onClick={() => push({ ...filters, page: filters.page + 1 })}>Suivant</button>
        </div>
      </div>
    </div>
  )
}

function Select({ label, value, onChange, options, empty = true }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; empty?: boolean }) {
  return (
    <label className="text-sm">{label}
      <select aria-label={label} className="mt-1 h-10 w-full rounded-lg border bg-card px-2" value={value} onChange={(event) => onChange(event.target.value)}>
        {empty ? <option value="">Tous</option> : null}
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

function Badge({ value }: { value: string }) {
  return <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-primary">{value}</span>
}
