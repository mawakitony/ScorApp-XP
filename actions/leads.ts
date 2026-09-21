"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { canEdit } from "@/lib/auth/session"
import { getUser } from "@/lib/auth/session"
import { ensureMembership } from "@/lib/data/membership"
import { isLeadStatus, LEAD_STATUSES, MAX_TAGS_PER_LEAD, NOTE_LIMIT, TAG_NAME_LIMIT } from "@/lib/leads/qualification"
import { sameOrganization } from "@/lib/leads/qualification"
import { createClient } from "@/lib/supabase/server"

const noteSchema = z.string().trim().min(1, "La note est vide.").max(NOTE_LIMIT, "La note dépasse 5 000 caractères.")
const tagSchema = z.object({
  name: z.string().trim().min(1, "Le nom est vide.").max(TAG_NAME_LIMIT, "50 caractères maximum."),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Couleur invalide."),
})
const uuid = z.string().uuid()

async function editor() {
  const membership = await ensureMembership()
  const user = await getUser()
  if (!membership || !user || !canEdit(membership.role)) {
    return { error: "Vous n'avez pas la permission de modifier ces leads." as const }
  }
  const supabase = await createClient()
  return { supabase, organizationId: membership.organization.id, userId: user.id }
}

function refresh(leadId?: string) {
  revalidatePath("/dashboard/leads")
  revalidatePath("/dashboard")
  if (leadId) revalidatePath(`/dashboard/leads/${leadId}`)
}

export async function changeLeadStatus(leadId: string, status: string) {
  if (!uuid.safeParse(leadId).success || !isLeadStatus(status)) return { error: "Statut invalide." }
  const context = await editor()
  if ("error" in context) return context
  const { data, error } = await context.supabase
    .from("leads")
    .update({ status })
    .eq("id", leadId)
    .eq("organization_id", context.organizationId)
    .select("id")
    .maybeSingle()
  if (error || !data) return { error: "Le statut n'a pas pu être modifié." }
  await context.supabase.from("lead_activities").insert({
    organization_id: context.organizationId,
    lead_id: leadId,
    author_id: context.userId,
    kind: "status_changed",
    summary: `Statut passé à ${status}`,
  })
  refresh(leadId)
  return { ok: true as const }
}

export async function changeLeadsStatus(ids: string[], status: string) {
  const clean = ids.filter((id) => uuid.safeParse(id).success).slice(0, 100)
  if (clean.length === 0 || !isLeadStatus(status)) return { error: "Sélection invalide." }
  const context = await editor()
  if ("error" in context) return context
  const { data, error } = await context.supabase
    .from("leads")
    .update({ status })
    .in("id", clean)
    .eq("organization_id", context.organizationId)
    .select("id")
  if (error || !data) return { error: "Le statut n'a pas pu être modifié." }
  if (data.length > 0) {
    await context.supabase.from("lead_activities").insert(data.map((lead) => ({
      organization_id: context.organizationId,
      lead_id: lead.id,
      author_id: context.userId,
      kind: "status_changed" as const,
      summary: `Statut passé à ${status}`,
    })))
  }
  refresh()
  return { ok: true as const }
}

export async function addLeadNote(leadId: string, content: string) {
  const parsed = noteSchema.safeParse(content)
  if (!uuid.safeParse(leadId).success || !parsed.success) return { error: parsed.success ? "Lead invalide." : parsed.error.issues[0]?.message ?? "Note invalide." }
  const context = await editor()
  if ("error" in context) return context
  const { data: lead } = await context.supabase.from("leads").select("id, organization_id").eq("id", leadId).eq("organization_id", context.organizationId).maybeSingle()
  if (!lead || !sameOrganization(lead.organization_id, context.organizationId)) return { error: "Lead introuvable." }
  const { error } = await context.supabase.from("lead_notes").insert({
    organization_id: context.organizationId,
    lead_id: leadId,
    author_id: context.userId,
    content: parsed.data,
  })
  if (error) return { error: "La note n'a pas pu être enregistrée." }
  await context.supabase.from("lead_activities").insert({
    organization_id: context.organizationId,
    lead_id: leadId,
    author_id: context.userId,
    kind: "note_created",
    summary: "Note interne ajoutée",
  })
  refresh(leadId)
  return { ok: true as const }
}

export async function createLeadTag(name: string, color: string) {
  const parsed = tagSchema.safeParse({ name, color })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Tag invalide." }
  const context = await editor()
  if ("error" in context) return context
  const { error } = await context.supabase.from("lead_tags").insert({
    organization_id: context.organizationId,
    name: parsed.data.name,
    color: parsed.data.color,
  })
  if (error) return { error: error.code === "23505" ? "Ce tag existe déjà." : "Le tag n'a pas pu être créé." }
  refresh()
  return { ok: true as const }
}

export async function renameLeadTag(tagId: string, name: string, color: string) {
  const parsed = tagSchema.safeParse({ name, color })
  if (!uuid.safeParse(tagId).success || !parsed.success) return { error: "Tag invalide." }
  const context = await editor()
  if ("error" in context) return context
  const { error } = await context.supabase.from("lead_tags").update({
    name: parsed.data.name,
    color: parsed.data.color,
  }).eq("id", tagId).eq("organization_id", context.organizationId)
  if (error) return { error: "Le tag n'a pas pu être renommé." }
  refresh()
  return { ok: true as const }
}

export async function deleteLeadTag(tagId: string) {
  if (!uuid.safeParse(tagId).success) return { error: "Tag invalide." }
  const context = await editor()
  if ("error" in context) return context
  const { error } = await context.supabase.from("lead_tags").delete().eq("id", tagId).eq("organization_id", context.organizationId)
  if (error) return { error: "Le tag n'a pas pu être supprimé." }
  refresh()
  return { ok: true as const }
}

async function assertTag(tagId: string, organizationId: string) {
  const supabase = await createClient()
  const { data } = await supabase.from("lead_tags").select("id, organization_id, name").eq("id", tagId).maybeSingle()
  if (!data || !sameOrganization(data.organization_id, organizationId)) return null
  return data
}

export async function assignLeadTag(leadId: string, tagId: string) {
  if (!uuid.safeParse(leadId).success || !uuid.safeParse(tagId).success) return { error: "Tag invalide." }
  const context = await editor()
  if ("error" in context) return context
  const tag = await assertTag(tagId, context.organizationId)
  const { data: lead } = await context.supabase.from("leads").select("id, organization_id").eq("id", leadId).eq("organization_id", context.organizationId).maybeSingle()
  if (!tag || !lead || !sameOrganization(lead.organization_id, tag.organization_id)) return { error: "Ce tag n'appartient pas à cette organisation." }
  const { count } = await context.supabase.from("lead_tag_assignments").select("tag_id", { count: "exact", head: true }).eq("lead_id", leadId)
  if ((count ?? 0) >= MAX_TAGS_PER_LEAD) return { error: "20 tags maximum par lead." }
  const { error } = await context.supabase.from("lead_tag_assignments").insert({ lead_id: leadId, tag_id: tagId })
  if (error && error.code !== "23505") return { error: "Le tag n'a pas pu être ajouté." }
  if (!error) {
    await context.supabase.from("lead_activities").insert({
      organization_id: context.organizationId,
      lead_id: leadId,
      author_id: context.userId,
      kind: "tag_added",
      summary: `Tag ${tag.name} ajouté`.slice(0, 500),
    })
  }
  refresh(leadId)
  return { ok: true as const }
}

export async function assignTagToLeads(ids: string[], tagId: string) {
  const clean = [...new Set(ids.filter((id) => uuid.safeParse(id).success))].slice(0, 100)
  if (!uuid.safeParse(tagId).success || clean.length === 0) return { error: "Sélection invalide." }
  const context = await editor()
  if ("error" in context) return context
  const tag = await assertTag(tagId, context.organizationId)
  if (!tag) return { error: "Ce tag n'appartient pas à cette organisation." }
  const { data: leads } = await context.supabase.from("leads").select("id, organization_id").in("id", clean).eq("organization_id", context.organizationId)
  const allowed = (leads ?? []).filter((lead) => sameOrganization(lead.organization_id, tag.organization_id))
  if (allowed.length === 0) return { error: "Lead introuvable." }
  const { data: existing } = await context.supabase.from("lead_tag_assignments").select("lead_id").in("lead_id", allowed.map((lead) => lead.id))
  const counts = new Map<string, number>()
  for (const row of existing ?? []) counts.set(row.lead_id, (counts.get(row.lead_id) ?? 0) + 1)
  for (const lead of allowed) {
    if ((counts.get(lead.id) ?? 0) >= MAX_TAGS_PER_LEAD) continue
    const { error } = await context.supabase.from("lead_tag_assignments").insert({ lead_id: lead.id, tag_id: tagId })
    if (!error) {
      await context.supabase.from("lead_activities").insert({
        organization_id: context.organizationId,
        lead_id: lead.id,
        author_id: context.userId,
        kind: "tag_added",
        summary: `Tag ${tag.name} ajouté`.slice(0, 500),
      })
    }
  }
  refresh()
  return { ok: true as const }
}

export async function removeLeadTag(leadId: string, tagId: string) {
  if (!uuid.safeParse(leadId).success || !uuid.safeParse(tagId).success) return { error: "Tag invalide." }
  const context = await editor()
  if ("error" in context) return context
  const tag = await assertTag(tagId, context.organizationId)
  if (!tag) return { error: "Tag introuvable." }
  const { error } = await context.supabase.from("lead_tag_assignments").delete().eq("lead_id", leadId).eq("tag_id", tagId)
  if (error) return { error: "Le tag n'a pas pu être retiré." }
  await context.supabase.from("lead_activities").insert({
    organization_id: context.organizationId,
    lead_id: leadId,
    author_id: context.userId,
    kind: "tag_removed",
    summary: `Tag ${tag.name} retiré`.slice(0, 500),
  })
  refresh(leadId)
  return { ok: true as const }
}

export { LEAD_STATUSES }
