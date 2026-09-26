"use client"

import { useState } from "react"
import { toast } from "sonner"
import { confirmQuestionnaireImport, previewQuestionnaireFile, previewScoreApp } from "@/actions/import-questions"
import { diffImport, type ImportCatalog } from "@/lib/importers/diff"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ImportIssue, ImportMode, ImportPreview, QuestionnaireDraft } from "@/lib/importers/model"
import { QUESTION_TYPE_LABELS } from "@/lib/constants"
import { questionTypes, type QuestionType } from "@/lib/validators/builder"
import type { EligibilityRule } from "@/lib/scoring/eligibility"
import type { BuilderQuestion, BuilderQuestionCategory, BuilderRange, BuilderScoringCategory } from "@/types/builder"

export function ImportQuestionsButton({
  scorecardId,
  catalog,
  onImported,
}: {
  scorecardId: string
  catalog: ImportCatalog
  onImported: (value: {
    questions: BuilderQuestion[]
    questionCategories: BuilderQuestionCategory[]
    scoringCategories: BuilderScoringCategory[]
    ranges: BuilderRange[]
    rules?: EligibilityRule[]
  }) => void
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [issues, setIssues] = useState<ImportIssue[]>([])
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [draft, setDraft] = useState<QuestionnaireDraft | null>(null)
  const [filename, setFilename] = useState("")
  const [mode, setMode] = useState<ImportMode | "">("")
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [remoteId, setRemoteId] = useState("")
  const [overrides, setOverrides] = useState<Record<number, QuestionType>>({})
  const [removeMissing, setRemoveMissing] = useState(false)

  function reset() {
    setIssues([])
    setPreview(null)
    setDraft(null)
    setFilename("")
    setMode("")
    setOverrides({})
    setRemoveMissing(false)
    setApiKey("")
    setRemoteId("")
  }

  async function onFile(file: File | undefined, source: "woloyem_excel" | "scoreapp_excel") {
    if (!file) return
    setPending(true)
    const body = new FormData()
    body.set("file", file)
    body.set("source", source)
    const result = await previewQuestionnaireFile(scorecardId, body)
    setPending(false)
    if ("error" in result && result.error) {
      toast.error(result.error)
      return
    }
    setFilename("filename" in result && result.filename ? result.filename : file.name)
    setIssues("issues" in result && result.issues ? result.issues : [])
    setPreview("preview" in result && result.preview ? result.preview : null)
    setDraft("draft" in result && result.draft ? result.draft : null)
  }

  async function onScoreApp() {
    setPending(true)
    const result = await previewScoreApp(scorecardId, apiKey, remoteId)
    setPending(false)
    setApiKey("")
    if ("error" in result && result.error) {
      toast.error(result.error)
      return
    }
    setFilename("scoreapp")
    setIssues("issues" in result && result.issues ? result.issues : [])
    setPreview("preview" in result && result.preview ? result.preview : null)
    setDraft("draft" in result && result.draft ? result.draft : null)
  }

  async function commit(nextMode: ImportMode) {
    if (!draft) return
    setPending(true)
    const result = await confirmQuestionnaireImport(scorecardId, nextMode, draft, filename, overrides, removeMissing)
    setPending(false)
    if ("error" in result && result.error) {
      toast.error(result.error)
      return
    }
    if ("issues" in result && result.issues) {
      setIssues(result.issues)
      return
    }
    if ("questions" in result && result.questions) {
      onImported({
        questions: result.questions,
        questionCategories: result.questionCategories,
        scoringCategories: result.scoringCategories,
        ranges: result.ranges,
        rules: result.rules,
      })
      toast.success(`Import terminé. ${result.imported} questions enregistrées dans le brouillon.`)
      setOpen(false)
      reset()
    }
  }

  const blocked = Boolean(draft?.unknownTypes.length && draft.unknownTypes.some((item) => !overrides[item.row]))

  return (
    <>
      <Button type="button" variant="outline" className="h-10" onClick={() => setOpen(true)}>
        Importer des questions
      </Button>
      <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) reset() }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Importer un questionnaire</DialogTitle>
            <DialogDescription>Déposez le fichier, lisez les différences, puis confirmez. Le questionnaire public ne change qu&apos;après publication.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" asChild>
              <a href="/api/scorecards/import-template">Télécharger le modèle Excel</a>
            </Button>
          </div>
          <label className="block rounded-2xl border border-dashed p-6 text-sm">
            Déposez un fichier .xlsx ici
            <input
              className="mt-3 block w-full text-sm"
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(event) => void onFile(event.target.files?.[0], "woloyem_excel")}
            />
          </label>
          <details className="rounded-2xl border p-4 text-sm">
            <summary className="cursor-pointer">Source avancée</summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input type="password" autoComplete="off" aria-label="Clé d'accès ScoreApp" placeholder="Clé d'accès" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
              <Input aria-label="Identifiant de scorecard distante" placeholder="Identifiant distant" value={remoteId} onChange={(event) => setRemoteId(event.target.value)} />
              <Button type="button" variant="outline" disabled={pending} onClick={() => void onScoreApp()}>
                Lire cette source
              </Button>
            </div>
          </details>
          {pending && !preview ? <p className="text-sm text-muted-foreground" aria-live="polite">Analyse en cours…</p> : null}
          {issues.length > 0 ? (
            <ul className="space-y-1 text-sm text-[#8d3b32]">
              {issues.slice(0, 12).map((item, index) => (
                <li key={`${item.row}-${item.column}-${index}`}>
                  Ligne {item.row} · {item.column} · {item.message}
                </li>
              ))}
            </ul>
          ) : null}
          {preview && draft ? (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-muted-foreground">Questions</dt><dd>{preview.questions} trouvées</dd></div>
                <div><dt className="text-muted-foreground">Catégories</dt><dd>{preview.categories} trouvées</dd></div>
                <div><dt className="text-muted-foreground">Scoring</dt><dd>{preview.scoringPercent == null ? "—" : `${preview.scoringPercent} / 100 %`} {preview.scoringBalanced ? "✓" : ""}</dd></div>
                <div><dt className="text-muted-foreground">Plages de résultats</dt><dd>{preview.ranges} trouvées</dd></div>
                <div><dt className="text-muted-foreground">Questions conditionnelles</dt><dd>{preview.conditionalQuestions}</dd></div>
                <div><dt className="text-muted-foreground">Règles obligatoires</dt><dd>{preview.eligibilityRules}</dd></div>
              </dl>
              {preview.warnings.length > 0 ? (
                <div>
                  <p className="text-sm font-medium">Avertissements</p>
                  <ul className="mt-1 space-y-1 text-sm">{preview.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              ) : null}
              {preview.suggestions.length > 0 ? (
                <div>
                  <p className="text-sm font-medium">Suggestions</p>
                  <p className="text-xs text-muted-foreground">Rien n&apos;est appliqué sans votre confirmation.</p>
                  <ul className="mt-1 space-y-1 text-sm">{preview.suggestions.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              ) : null}
              {draft.unknownTypes.length > 0 ? (
                <div className="space-y-2">
                  {draft.unknownTypes.map((item) => (
                    <div key={item.row} className="grid gap-2 sm:grid-cols-[1fr_220px]">
                      <p className="text-sm">Type de question non reconnu « {item.rawType} » — {item.title}</p>
                      <Select value={overrides[item.row] ?? ""} onValueChange={(value) => setOverrides((current) => ({ ...current, [item.row]: value as QuestionType }))}>
                        <SelectTrigger aria-label={`Type pour ${item.title}`}><SelectValue placeholder="Choisir un type" /></SelectTrigger>
                        <SelectContent>
                          {questionTypes.map((type) => (
                            <SelectItem key={type} value={type}>{QUESTION_TYPE_LABELS[type]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs tracking-wide text-muted-foreground uppercase">
                      <th className="py-2 pr-3">Ordre</th>
                      <th className="py-2 pr-3">Question</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Catégorie</th>
                      <th className="py-2 pr-3">Options</th>
                      <th className="py-2">Notée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 8).map((row) => (
                      <tr key={`${row.order}-${row.question}`} className="border-b">
                        <td className="py-2 pr-3">{row.order}</td>
                        <td className="py-2 pr-3">{row.question}</td>
                        <td className="py-2 pr-3">{row.type}</td>
                        <td className="py-2 pr-3">{row.category || "—"}</td>
                        <td className="py-2 pr-3">{row.options}</td>
                        <td className="py-2">{row.scored ? "Oui" : "Non"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Changes draft={draft} catalog={catalog} />
              <fieldset className="space-y-2 text-sm">
                <legend>Que faire du questionnaire déjà en place ?</legend>
                <label className="flex gap-2"><input type="radio" name="import-mode" checked={mode === "add"} onChange={() => setMode("add")} /> Ajouter au questionnaire</label>
                <label className="flex gap-2"><input type="radio" name="import-mode" checked={mode === "update"} onChange={() => setMode("update")} /> Mettre à jour le questionnaire existant</label>
                <label className="flex gap-2"><input type="radio" name="import-mode" checked={mode === "replace"} onChange={() => setMode("replace")} /> Remplacer toutes les questions existantes</label>
              </fieldset>
              {mode === "update" && diffImport(catalog, draft).some((line) => line.status === "removed") ? (
                <label className="flex gap-2 text-sm">
                  <input type="checkbox" checked={removeMissing} onChange={(event) => setRemoveMissing(event.target.checked)} />
                  Retirer aussi ce qui est absent du fichier. Ces questions sont archivées : les anciennes réponses restent lisibles. Sans cette case, elles restent dans le questionnaire.
                </label>
              ) : null}
              {mode === "replace" ? <p className="text-sm text-[#8d3b32]">Remplacer archive les questions actuelles. Elles disparaissent du questionnaire, mais les réponses déjà collectées restent lisibles.</p> : null}
              <Button
                type="button"
                disabled={pending || !mode || blocked || issues.length > 0}
                aria-busy={pending}
                onClick={() => {
                  if (mode === "replace") setReplaceOpen(true)
                  if (mode === "add") void commit("add")
                  if (mode === "update") void commit("update")
                }}
              >
                {pending ? "Import en cours…" : "Confirmer l'import"}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <AlertDialog open={replaceOpen} onOpenChange={setReplaceOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remplacer toutes les questions ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les questions actuelles seront archivées, puis remplacées par le fichier. Les réponses déjà collectées restent lisibles. Le questionnaire public ne change qu&apos;après une nouvelle publication.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => void commit("replace")}>Remplacer et importer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function Changes({ draft, catalog }: { draft: QuestionnaireDraft; catalog: ImportCatalog }) {
  const lines = diffImport(catalog, draft)
  const changed = lines.filter((line) => line.status !== "unchanged")
  const added = lines.filter((line) => line.status === "added").length
  const modified = lines.filter((line) => line.status === "modified").length
  const removed = lines.filter((line) => line.status === "removed").length
  const unchanged = lines.filter((line) => line.status === "unchanged").length
  if (changed.length === 0 && unchanged === 0) return null
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">Différences</p>
      <p>{added} ajoutée{added > 1 ? "s" : ""} · {modified} modifiée{modified > 1 ? "s" : ""} · {removed} absente{removed > 1 ? "s" : ""} · {unchanged} inchangée{unchanged > 1 ? "s" : ""}</p>
      <ul className="space-y-1">
        {changed.slice(0, 12).map((line) => (
          <li key={line.text}>
            {line.status === "added" ? "Ajouté" : line.status === "removed" ? "Absent" : "Modifié"} · {line.text}
          </li>
        ))}
      </ul>
      {changed.length > 12 ? <p className="text-muted-foreground">Et {changed.length - 12} autres.</p> : null}
    </div>
  )
}
