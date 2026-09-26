"use server"

import { revalidatePath } from "next/cache"
import { requireScorecardEditor } from "@/lib/auth/editor"
import { applyDraftDocument } from "@/lib/assessment/apply-release"
import { documentFromBundle, parseRelease, releaseForOrganization } from "@/lib/assessment/release"
import { getBuilderBundle } from "@/lib/data/builder"
import type { Json } from "@/types/database"

function refresh(scorecardId: string) {
  revalidatePath(`/dashboard/scorecards/${scorecardId}/builder`)
  revalidatePath(`/dashboard/scorecards/${scorecardId}`)
}

export async function captureUndo(scorecardId: string) {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return
  const loaded = await getBuilderBundle(context.organizationId, context.scorecardId)
  if ("error" in loaded || !loaded.bundle) return
  await context.supabase.from("scorecards").update({ undo_document: documentFromBundle(loaded.bundle) as unknown as Json }).eq("id", context.scorecardId).eq("organization_id", context.organizationId)
}

export async function undoDraft(scorecardId: string) {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return { error: context.error }
  const { data } = await context.supabase.from("scorecards").select("undo_document, organization_id").eq("id", context.scorecardId).eq("organization_id", context.organizationId).maybeSingle()
  if (!data || !releaseForOrganization(data.organization_id, context.organizationId)) return { error: "Scorecard introuvable." }
  const document = parseRelease(data.undo_document)
  if (!document) return { error: "Aucune modification à annuler." }
  const applied = await applyDraftDocument(context.supabase, context.scorecardId, document)
  if (applied.error) return applied
  await context.supabase.from("scorecards").update({ undo_document: null }).eq("id", context.scorecardId).eq("organization_id", context.organizationId)
  refresh(context.scorecardId)
  return { ok: true as const }
}

export async function restorePublishedDraft(scorecardId: string) {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return { error: context.error }
  const release = await context.supabase.from("scorecard_releases").select("document, organization_id").eq("scorecard_id", context.scorecardId).eq("organization_id", context.organizationId).maybeSingle()
  if (release.error || !release.data || !releaseForOrganization(release.data.organization_id, context.organizationId)) {
    return { error: "Aucune version publiée à restaurer." }
  }
  const document = parseRelease(release.data.document)
  if (!document) return { error: "La version publiée est illisible." }
  await captureUndo(scorecardId)
  const applied = await applyDraftDocument(context.supabase, context.scorecardId, document)
  if (applied.error) return applied
  refresh(context.scorecardId)
  return { ok: true as const }
}

export async function writePublishedRelease(scorecardId: string) {
  const context = await requireScorecardEditor(scorecardId)
  if ("error" in context) return { error: context.error }
  const loaded = await getBuilderBundle(context.organizationId, context.scorecardId)
  if ("error" in loaded || !loaded.bundle) return { error: "error" in loaded ? loaded.error : "Scorecard introuvable." }
  const publishedAt = new Date().toISOString()
  const saved = await context.supabase.from("scorecard_releases").upsert({
    scorecard_id: context.scorecardId,
    organization_id: context.organizationId,
    document: documentFromBundle(loaded.bundle) as unknown as Json,
    published_at: publishedAt,
  })
  if (saved.error) return { error: "La version publiée n'a pas pu être enregistrée. Appliquez la migration du snapshot." }
  return { ok: true as const }
}
