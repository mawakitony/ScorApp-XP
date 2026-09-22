"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { can } from "@/lib/auth/permissions"
import { loadEntitlements } from "@/lib/billing/account"
import { ensureMembership } from "@/lib/data/membership"
import { emptyToNull, slugify } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"
import { scorecardSchema, type ScorecardFormValues } from "@/lib/validators/scorecard"

export type ActionResult = { error?: string; id?: string }

async function editorContext() {
  const membership = await ensureMembership()
  if (!membership || !can({ role: membership.role }, "scorecard.edit")) {
    return { error: "Vous n'avez pas la permission de modifier les scorecards." as const }
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Session expirée." as const }
  return { membership, supabase, user }
}

function fields(values: ScorecardFormValues) {
  return {
    name: values.name,
    slug: values.slug,
    description: emptyToNull(values.description),
    language: values.language,
    category: values.category,
    status: values.status,
    primary_color: values.primaryColor,
    secondary_color: values.secondaryColor,
    logo_url: emptyToNull(values.logoUrl),
    cover_image_url: emptyToNull(values.coverImageUrl),
    estimated_minutes: values.estimatedMinutes,
    privacy_text: emptyToNull(values.privacyText),
    seo_title: emptyToNull(values.seoTitle),
    seo_description: emptyToNull(values.seoDescription),
    og_title: emptyToNull(values.ogTitle),
    og_description: emptyToNull(values.ogDescription),
    og_image_url: emptyToNull(values.ogImageUrl),
    published_at: values.status === "published" ? new Date().toISOString() : null,
  }
}

async function scorecardQuota(supabase: Awaited<ReturnType<typeof createClient>>, organizationId: string) {
  const entitlements = await loadEntitlements(organizationId)
  const { count } = await supabase.from("scorecards").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
  const used = count ?? 0
  const limit = entitlements.limits.scorecards
  if (limit !== null && used >= limit) {
    return used > limit
      ? "Your current usage exceeds your new plan limit."
      : "La limite de scorecards de votre plan est atteinte."
  }
  return null
}

function mapError(message: string) {
  if (message.includes("scorecards_slug") || message.includes("duplicate") || message.includes("23505")) {
    return "Ce slug est déjà utilisé."
  }
  return "L'enregistrement a échoué. Réessayez dans un instant."
}

export async function createScorecard(values: ScorecardFormValues): Promise<ActionResult> {
  const parsed = scorecardSchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides." }

  const context = await editorContext()
  if ("error" in context && context.error) return { error: context.error }

  const { supabase, user, membership } = context
  const quota = await scorecardQuota(supabase, membership.organization.id)
  if (quota) return { error: quota }
  const { data, error } = await supabase
    .from("scorecards")
    .insert({
      ...fields(parsed.data),
      organization_id: membership.organization.id,
      created_by: user.id,
    })
    .select("id")
    .single()

  if (error || !data) return { error: mapError(error?.message ?? "") }

  await supabase.from("scorecard_pages").insert({
    scorecard_id: data.id,
    title: parsed.data.name,
    subtitle: emptyToNull(parsed.data.description),
    description: emptyToNull(parsed.data.description),
    cta_text: "Commencer",
  })
  await supabase.from("scorecard_lead_forms").insert({ scorecard_id: data.id })

  revalidatePath("/dashboard/scorecards")
  return { id: data.id }
}

export async function updateScorecard(id: string, values: ScorecardFormValues): Promise<ActionResult> {
  const parsed = scorecardSchema.safeParse(values)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides." }

  const context = await editorContext()
  if ("error" in context && context.error) return { error: context.error }

  const { supabase, membership } = context
  const { error } = await supabase
    .from("scorecards")
    .update(fields(parsed.data))
    .eq("id", id)
    .eq("organization_id", membership.organization.id)

  if (error) return { error: mapError(error.message) }

  revalidatePath("/dashboard/scorecards")
  revalidatePath(`/dashboard/scorecards/${id}`)
  revalidatePath(`/dashboard/scorecards/${id}/builder`)
  return { id }
}

export async function setScorecardStatus(id: string, status: ScorecardFormValues["status"]) {
  const context = await editorContext()
  if ("error" in context && context.error) return { error: context.error }
  const { supabase, membership } = context

  const { error } = await supabase
    .from("scorecards")
    .update({
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("organization_id", membership.organization.id)

  if (error) return { error: "Le statut n'a pas pu être modifié." }
  revalidatePath("/dashboard/scorecards")
  return { id }
}

export async function deleteScorecard(id: string) {
  const context = await editorContext()
  if ("error" in context && context.error) return { error: context.error }
  const { supabase, membership } = context

  const { error } = await supabase
    .from("scorecards")
    .delete()
    .eq("id", id)
    .eq("organization_id", membership.organization.id)

  if (error) return { error: "La suppression a échoué." }
  revalidatePath("/dashboard/scorecards")
  redirect("/dashboard/scorecards")
}

export async function duplicateScorecard(id: string) {
  const context = await editorContext()
  if ("error" in context && context.error) return { error: context.error }
  const quota = await scorecardQuota(context.supabase, context.membership.organization.id)
  if (quota) return { error: quota }

  const { data, error } = await context.supabase.rpc("duplicate_scorecard", { source_id: id })
  if (error || !data) return { error: "La duplication a échoué." }
  revalidatePath("/dashboard/scorecards")
  return { id: data }
}

export async function createScorecardFromTemplate(templateId: string) {
  const context = await editorContext()
  if ("error" in context && context.error) return { error: context.error }
  const { supabase, membership, user } = context
  const quota = await scorecardQuota(supabase, membership.organization.id)
  if (quota) return { error: quota }

  const { data: template } = await supabase
    .from("templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle()

  if (!template) return { error: "Modèle introuvable." }

  let slug = slugify(template.key)
  for (let index = 1; index < 20; index += 1) {
    const candidate = index === 1 ? slug : `${slugify(template.key)}-${index}`
    const { data: existing } = await supabase
      .from("scorecards")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle()
    if (!existing) {
      slug = candidate
      break
    }
  }

  const { data, error } = await supabase
    .from("scorecards")
    .insert({
      organization_id: membership.organization.id,
      name: template.name,
      slug,
      description: template.description,
      category: template.category,
      language: "fr",
      status: "draft",
      created_by: user.id,
      privacy_text:
        "Cette évaluation fournit une indication préliminaire. La validation définitive dépend des critères de l'organisme certificateur.",
    })
    .select("id")
    .single()

  if (error || !data) return { error: mapError(error?.message ?? "") }

  await supabase.from("scorecard_pages").insert({
    scorecard_id: data.id,
    title: template.name,
    subtitle: template.objective,
    description: template.description,
    cta_text: "Commencer l'évaluation",
  })
  await supabase.from("scorecard_lead_forms").insert({ scorecard_id: data.id })

  revalidatePath("/dashboard/scorecards")
  return { id: data.id }
}
