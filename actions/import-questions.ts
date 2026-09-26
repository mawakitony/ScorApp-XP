"use server"

import { revalidatePath } from "next/cache"
import { requireScorecardEditor } from "@/lib/auth/editor"
import { getBuilderBundle } from "@/lib/data/builder"
import { linkedDisplaySettings } from "@/lib/importers/conditions"
import { workbookFromBundle, buildScorecardWorkbook } from "@/lib/importers/export"
import { parseQuestionnaireFile } from "@/lib/importers/excel"
import { applyQuestionnaireUpdate } from "@/lib/importers/update-scorecard"
import { questionnairePayload } from "@/lib/importers/payload"
import { mapScoreAppQuestions, SCOREAPP_QUESTIONS_URL, applyScoreAppTypeOverrides } from "@/lib/importers/scoreapp"
import { importSources, previewOf, type ImportMode, type ImportSource, type QuestionnaireDraft } from "@/lib/importers/model"
import { parseImportDraft } from "@/lib/importers/validate"
import { QUESTIONNAIRE_IMPORT_BYTES } from "@/lib/security/limits"
import { captureUndo } from "@/actions/release"
import type { QuestionType } from "@/lib/validators/builder"

const spreadsheetTypes = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/csv",
  "application/octet-stream",
  "",
])

function refresh(scorecardId: string) {
  revalidatePath(`/dashboard/scorecards/${scorecardId}/builder`)
  revalidatePath(`/dashboard/scorecards/${scorecardId}`)
}

export async function previewQuestionnaireFile(scorecardId: string, formData: FormData) {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return { error: context.error }
  const file = formData.get("file")
  if (!(file instanceof File)) return { error: "Choisissez un fichier .xlsx ou .csv." }
  if (file.size <= 0 || file.size > QUESTIONNAIRE_IMPORT_BYTES) return { error: "Le fichier dépasse 5 Mo ou est vide." }
  if (!spreadsheetTypes.has(file.type)) return { error: "Type de fichier refusé." }
  const source = formData.get("source") === "scoreapp_excel" ? "scoreapp_excel" : "woloyem_excel"
  const parsed = await parseQuestionnaireFile({
    filename: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
    source,
  })
  if (!parsed.draft) {
    return { issues: parsed.issues }
  }
  return { preview: previewOf(parsed.draft), draft: parsed.draft, filename: file.name.slice(0, 180) }
}

export async function previewScoreApp(scorecardId: string, apiKey: string, scoreAppScorecardId: string) {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return { error: context.error }
  const key = apiKey.trim()
  const remoteId = scoreAppScorecardId.trim()
  if (!key || !remoteId || !/^[\w-]+$/.test(remoteId)) return { error: "Indiquez la clé API et l'identifiant de scorecard ScoreApp." }
  const response = await fetch(`${SCOREAPP_QUESTIONS_URL}/${encodeURIComponent(remoteId)}/questions`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    cache: "no-store",
  })
  if (!response.ok) return { error: `ScoreApp a répondu ${response.status}.` }
  const body = (await response.json()) as { data?: unknown }
  if (!Array.isArray(body.data)) return { error: "Réponse ScoreApp inattendue." }
  const mapped = mapScoreAppQuestions(body.data)
  return { preview: previewOf(mapped.draft), draft: mapped.draft, issues: mapped.issues, filename: "scoreapp" }
}

export async function exportScorecardWorkbook(scorecardId: string) {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return { error: context.error }
  const loaded = await getBuilderBundle(context.organizationId, context.scorecardId)
  if ("error" in loaded || !loaded.bundle) return { error: "La scorecard n'a pas pu être exportée." }
  const file = await buildScorecardWorkbook(workbookFromBundle(loaded.bundle))
  if ("error" in file) return { error: file.error }
  return { filename: file.filename, base64: file.bytes.toString("base64") }
}

export async function confirmQuestionnaireImport(
  scorecardId: string,
  mode: ImportMode,
  draft: QuestionnaireDraft,
  filename: string,
  overrides?: Record<number, QuestionType>,
  removeMissing = false,
) {
  if (mode !== "add" && mode !== "replace" && mode !== "update") return { error: "Choisissez comment traiter les questions existantes." }
  if (!importSources.includes(draft.source)) return { error: "Source inconnue." }
  const resolved = overrides && draft.unknownTypes.length > 0 ? applyScoreAppTypeOverrides(draft, overrides) : { draft, issues: [] as { row: number; column: string; message: string }[] }
  if (!resolved.draft || resolved.issues.length > 0 || resolved.draft.unknownTypes.length > 0) {
    return { issues: resolved.issues.length > 0 ? resolved.issues : [{ row: 0, column: "answer_type", message: "Unsupported question type." }] }
  }
  const checked = parseImportDraft(resolved.draft)
  if (!checked.success) {
    return { issues: checked.error.issues.map((item) => ({ row: 0, column: "draft", message: item.message })) }
  }
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return { error: context.error }
  await captureUndo(scorecardId)
  if (mode === "update") {
    const applied = await applyQuestionnaireUpdate(context.supabase, context.scorecardId, checked.data, removeMissing)
    if (applied.error) return { error: applied.error }
    const refreshed = await getBuilderBundle(context.organizationId, context.scorecardId)
    if ("error" in refreshed || !refreshed.bundle) return { error: "Mise à jour enregistrée, mais le builder n'a pas pu être rechargé." }
    refresh(context.scorecardId)
    return {
      imported: checked.data.questions.length,
      questions: refreshed.bundle.questions,
      questionCategories: refreshed.bundle.questionCategories,
      scoringCategories: refreshed.bundle.scoringCategories,
      ranges: refreshed.bundle.ranges,
      rules: refreshed.bundle.rules,
    }
  }
  const payload = questionnairePayload(checked.data)
  const { error } = await context.supabase.rpc("import_questionnaire", {
    p_scorecard_id: context.scorecardId,
    p_mode: mode,
    p_source: checked.data.source as ImportSource,
    p_filename: filename.slice(0, 180),
    p_payload: payload,
  })
  if (error) return { error: "L'import a été annulé. Aucune question n'a été enregistrée." }
  const loaded = await getBuilderBundle(context.organizationId, context.scorecardId)
  if ("error" in loaded || !loaded.bundle) return { error: "Import enregistré, mais le builder n'a pas pu être rechargé." }
  const links = linkedDisplaySettings(loaded.bundle.questions, checked.data.questions, mode)
  for (const link of links) {
    const { error: linkError } = await context.supabase.from("questions").update({ settings: link.settings }).eq("id", link.id).eq("scorecard_id", context.scorecardId)
    if (linkError) return { error: "Les questions sont importées, mais une condition d'affichage n'a pas pu être enregistrée." }
  }
  const refreshed = links.length > 0 ? await getBuilderBundle(context.organizationId, context.scorecardId) : loaded
  if ("error" in refreshed || !refreshed.bundle) return { error: "Import enregistré, mais le builder n'a pas pu être rechargé." }
  refresh(context.scorecardId)
  return {
    imported: checked.data.questions.length,
    questions: refreshed.bundle.questions,
    questionCategories: refreshed.bundle.questionCategories,
    scoringCategories: refreshed.bundle.scoringCategories,
    ranges: refreshed.bundle.ranges,
    rules: refreshed.bundle.rules,
  }
}
