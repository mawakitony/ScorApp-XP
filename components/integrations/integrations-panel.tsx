"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createIntegrationKey, deleteWebhook, retryDelivery, saveAutomation, saveBrevo, saveWebhook, sendTestWebhook, setAutomationEnabled, setWebhookStatus, revokeIntegrationKey } from "@/actions/integrations"
import { WEBHOOK_EVENTS } from "@/lib/integrations/version"

const events = WEBHOOK_EVENTS.filter((event) => event !== "webhook.test")

type WebhookRow = {
  id: string
  name: string
  status: string
  url: string
  events: string[]
  includeResponses: boolean
}

type DeliveryRow = {
  id: string
  integration: string
  event: string
  status: string
  attempt: number
  httpStatus: number | null
  excerpt: string | null
  createdAt: string
}

type RuleRow = { id: string; name: string; trigger: string; enabled: boolean; action: string }
type KeyRow = { id: string; name: string; prefix: string; revoked: boolean; lastUsed: string | null }

export function IntegrationsPanel({
  canEdit,
  webhooks,
  deliveries,
  rules,
  keys,
  brevoEnabled,
  brevoList,
  brevoConsent,
}: {
  canEdit: boolean
  webhooks: WebhookRow[]
  deliveries: DeliveryRow[]
  rules: RuleRow[]
  keys: KeyRow[]
  brevoEnabled: boolean
  brevoList: string
  brevoConsent: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState("")
  const [secret, setSecret] = useState("")
  const [conditions, setConditions] = useState([{ field: "score", op: "gte", value: "75" }])

  async function run(action: Promise<{ error?: string; secret?: string }>) {
    const result = await action
    setError(result.error ?? "")
    if (result.secret) setSecret(result.secret)
    if (!result.error) router.refresh()
  }

  return (
    <div className="space-y-8">
      {error ? <p className="rounded-2xl border border-destructive/40 bg-card px-4 py-3 text-sm text-destructive" role="alert">{error}</p> : null}

      <section className="rounded-3xl border bg-card p-6">
        <h2 className="font-display text-2xl">Webhooks</h2>
        {webhooks.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Aucune intégration configurée.</p>
        ) : (
          <ul className="mt-4 divide-y text-sm">
            {webhooks.map((hook) => (
              <li key={hook.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{hook.name}</p>
                    <p className="text-muted-foreground">{hook.url}</p>
                    <p className="text-muted-foreground">{hook.events.join(", ")} · {hook.status}</p>
                  </div>
                  {canEdit ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="underline" onClick={() => void run(sendTestWebhook(hook.id))}>Tester</button>
                      <button type="button" className="underline" onClick={() => void run(setWebhookStatus(hook.id, hook.status === "active" ? "disabled" : "active"))}>{hook.status === "active" ? "Désactiver" : "Activer"}</button>
                      <button type="button" className="text-destructive underline" onClick={() => void run(deleteWebhook(hook.id))}>Supprimer</button>
                    </div>
                  ) : null}
                </div>
                {canEdit ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer">Modifier</summary>
                    <form className="mt-3 grid gap-2" onSubmit={(event) => {
                      event.preventDefault()
                      const data = new FormData(event.currentTarget)
                      void run(saveWebhook({
                        id: hook.id,
                        name: String(data.get("name") ?? hook.name),
                        url: String(data.get("url") ?? hook.url),
                        secret: String(data.get("secret") ?? ""),
                        events: data.getAll("events").map(String),
                        includeResponses: data.get("include_responses") === "on",
                      }))
                    }}>
                      <input name="name" defaultValue={hook.name} required aria-label={`Nom de ${hook.name}`} className="h-10 rounded-xl border px-3" />
                      <input name="url" defaultValue={hook.url} required type="url" aria-label={`URL de ${hook.name}`} className="h-10 rounded-xl border px-3" />
                      <input name="secret" minLength={16} placeholder="Nouveau secret, sinon l'ancien est conservé" aria-label={`Secret de ${hook.name}`} className="h-10 rounded-xl border px-3" />
                      <div className="flex flex-wrap gap-3">
                        {events.map((event) => (
                          <label key={event} className="flex items-center gap-2">
                            <input type="checkbox" name="events" value={event} defaultChecked={hook.events.includes(event)} />
                            {event}
                          </label>
                        ))}
                      </div>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" name="include_responses" defaultChecked={hook.includeResponses} />
                        Inclure les identifiants de réponses
                      </label>
                      <button type="submit" className="h-10 w-fit rounded-xl bg-primary px-4 text-primary-foreground">Enregistrer</button>
                    </form>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canEdit ? (
          <form className="mt-6 grid gap-3" onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            void run(saveWebhook({
              name: String(data.get("name") ?? ""),
              url: String(data.get("url") ?? ""),
              secret: String(data.get("secret") ?? ""),
              events: data.getAll("events").map(String),
              includeResponses: data.get("include_responses") === "on",
            }))
          }}>
            <p className="text-sm font-medium">Ajouter une intégration</p>
            <input name="name" required placeholder="Nom" aria-label="Nom du webhook" className="h-10 rounded-xl border px-3" />
            <input name="url" required type="url" placeholder="https://example.com/hooks/woloyem" aria-label="URL du webhook" className="h-10 rounded-xl border px-3" />
            <input name="secret" required minLength={16} placeholder="Secret (16 caractères minimum)" aria-label="Secret du webhook" className="h-10 rounded-xl border px-3" />
            <div className="flex flex-wrap gap-3 text-sm">
              {events.map((event) => (
                <label key={event} className="flex items-center gap-2">
                  <input type="checkbox" name="events" value={event} />
                  {event}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="include_responses" />
              Inclure les identifiants de réponses (jamais le texte long)
            </label>
            <button type="submit" className="h-10 w-fit rounded-xl bg-primary px-4 text-sm text-primary-foreground">Ajouter</button>
          </form>
        ) : null}
      </section>

      <section className="rounded-3xl border bg-card p-6">
        <h2 className="font-display text-2xl">Journal</h2>
        {deliveries.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Aucune livraison.</p> : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>{["Date", "Intégration", "Événement", "Statut", "Tentative", "HTTP"].map((label) => <th key={label} className="px-2 py-2 font-medium">{label}</th>)}</tr>
              </thead>
              <tbody>
                {deliveries.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-2 py-2">{new Date(row.createdAt).toLocaleString("fr-FR")}</td>
                    <td className="px-2 py-2">{row.integration}</td>
                    <td className="px-2 py-2">{row.event}</td>
                    <td className="px-2 py-2">{row.status}</td>
                    <td className="px-2 py-2">{row.attempt}</td>
                    <td className="px-2 py-2">{row.httpStatus ?? "—"}</td>
                    <td className="px-2 py-2">
                      {canEdit && (row.status === "failed" || row.status === "dead") ? (
                        <button type="button" className="underline" onClick={() => void run(retryDelivery(row.id))}>Relancer</button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-3xl border bg-card p-6">
        <h2 className="font-display text-2xl">Brevo</h2>
        <p className="mt-2 text-sm text-muted-foreground">La clé reste sur le serveur. Un email est obligatoire. Le consentement au résultat n&apos;autorise pas la synchronisation.</p>
        {canEdit ? (
          <form className="mt-4 grid gap-3" onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            void run(saveBrevo({
              apiKey: String(data.get("apiKey") ?? ""),
              listId: String(data.get("listId") ?? ""),
              enabled: data.get("enabled") === "on",
              allowResultConsent: data.get("allow") === "on",
            }))
          }}>
            <input name="apiKey" type="password" autoComplete="off" placeholder="Clé API, laissée vide pour conserver l'existante" aria-label="Clé API Brevo" className="h-10 rounded-xl border px-3" />
            <input name="listId" defaultValue={brevoList} placeholder="ID de liste" aria-label="Liste Brevo" className="h-10 rounded-xl border px-3" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={brevoEnabled} /> Activé</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allow" defaultChecked={brevoConsent} /> Autoriser sans consentement tiers explicite</label>
            <button type="submit" className="h-10 w-fit rounded-xl bg-primary px-4 text-sm text-primary-foreground">Enregistrer Brevo</button>
          </form>
        ) : <p className="mt-3 text-sm">{brevoEnabled ? "Brevo est actif." : "Brevo est inactif."}</p>}
      </section>

      <section className="rounded-3xl border bg-card p-6">
        <h2 className="font-display text-2xl">WhatsApp</h2>
        <p className="mt-2 text-sm text-muted-foreground">Le provider est prévu. L&apos;envoi est désactivé tant qu&apos;aucune implémentation réelle n&apos;est branchée.</p>
      </section>

      <section className="rounded-3xl border bg-card p-6">
        <h2 className="font-display text-2xl">Clés API</h2>
        <p className="mt-2 text-sm text-muted-foreground">Scope disponible : conversions:write. La clé complète n&apos;est affichée qu&apos;une fois.</p>
        {secret ? <p className="mt-3 rounded-xl bg-muted px-3 py-2 font-mono text-sm">{secret}</p> : null}
        <ul className="mt-4 space-y-2 text-sm">
          {keys.map((key) => (
            <li key={key.id} className="flex items-center justify-between gap-3">
              <span>{key.name} · {key.prefix}… {key.revoked ? "· révoquée" : ""}</span>
              {canEdit && !key.revoked ? <button type="button" className="underline" onClick={() => void run(revokeIntegrationKey(key.id))}>Révoquer</button> : null}
            </li>
          ))}
        </ul>
        {canEdit ? (
          <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void run(createIntegrationKey(String(data.get("name") ?? ""))); event.currentTarget.reset() }}>
            <input name="name" required placeholder="Nom de la clé" aria-label="Nom de la clé API" className="h-10 flex-1 rounded-xl border px-3" />
            <button type="submit" className="h-10 rounded-xl bg-primary px-4 text-sm text-primary-foreground">Créer</button>
          </form>
        ) : null}
      </section>

      <section className="rounded-3xl border bg-card p-6">
        <h2 className="font-display text-2xl">Automatisations</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-center justify-between gap-3">
              <span>{rule.name} · {rule.trigger} · {rule.action}</span>
              {canEdit ? <button type="button" className="underline" onClick={() => void run(setAutomationEnabled(rule.id, !rule.enabled))}>{rule.enabled ? "Désactiver" : "Activer"}</button> : null}
            </li>
          ))}
        </ul>
        {canEdit ? (
          <form className="mt-4 grid gap-3" onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            const actionType = String(data.get("action") ?? "add_tag")
            const actionValue = String(data.get("actionValue") ?? "")
            void run(saveAutomation({
              name: String(data.get("name") ?? ""),
              trigger: String(data.get("trigger") ?? "assessment.completed"),
              conditions: conditions.map((condition) => ({
                field: condition.field,
                op: condition.op,
                value: condition.field === "score" ? Number(condition.value) : condition.field === "cta_clicked" ? condition.value === "true" : condition.value,
              })),
              actionType,
              actionConfig: actionType === "add_tag" ? { tag: actionValue } : actionType === "change_status" ? { status: actionValue } : actionType === "send_webhook" ? { integrationId: actionValue } : { listId: Number(actionValue) || 0 },
            }))
          }}>
            <input name="name" required placeholder="Nom de la règle" aria-label="Nom de la règle" className="h-10 rounded-xl border px-3" />
            <label className="text-sm">Quand
              <select name="trigger" aria-label="Déclencheur" className="mt-1 h-10 w-full rounded-xl border px-3">
                {events.map((event) => <option key={event}>{event}</option>)}
              </select>
            </label>
            {conditions.map((condition, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-3">
                <select aria-label="Condition" value={condition.field} onChange={(event) => setConditions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, field: event.target.value } : item))} className="h-10 rounded-xl border px-3">
                  {["score", "country", "status", "temperature", "scorecard", "result", "cta_clicked", "tag"].map((field) => <option key={field}>{field}</option>)}
                </select>
                <select aria-label="Opérateur" value={condition.op} onChange={(event) => setConditions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, op: event.target.value } : item))} className="h-10 rounded-xl border px-3">
                  <option value="gte">supérieur ou égal</option>
                  <option value="lte">inférieur ou égal</option>
                  <option value="eq">égal</option>
                </select>
                <input aria-label="Valeur" value={condition.value} onChange={(event) => setConditions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} className="h-10 rounded-xl border px-3" />
              </div>
            ))}
            <button type="button" className="w-fit text-sm underline" onClick={() => setConditions((current) => [...current, { field: "country", op: "eq", value: "" }])}>Ajouter une condition ET</button>
            <select name="action" aria-label="Action" className="h-10 rounded-xl border px-3">
              <option value="add_tag">Ajouter un tag</option>
              <option value="change_status">Changer le statut</option>
              <option value="send_webhook">Envoyer un webhook</option>
              <option value="send_brevo_event">Synchroniser vers Brevo</option>
              <option value="generate_report">Générer le rapport</option>
              <option value="send_report_email">Envoyer le lien du rapport</option>
              <option value="generate_ai_analysis">Analyse IA</option>
            </select>
            <input name="actionValue" required placeholder="Tag, statut, identifiant webhook ou liste" aria-label="Valeur de l'action" className="h-10 rounded-xl border px-3" />
            <button type="submit" className="h-10 w-fit rounded-xl bg-primary px-4 text-sm text-primary-foreground">Créer la règle</button>
          </form>
        ) : null}
      </section>
    </div>
  )
}
