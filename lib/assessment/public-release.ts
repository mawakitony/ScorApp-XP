import type { SupabaseClient } from "@supabase/supabase-js"
import { parseRelease, type ReleaseDocument } from "@/lib/assessment/release"
import type { Database } from "@/types/database"

export async function readPublishedDocument(supabase: SupabaseClient<Database>, scorecardId: string): Promise<ReleaseDocument | null> {
  const { data, error } = await supabase.from("scorecard_releases").select("document, organization_id").eq("scorecard_id", scorecardId).maybeSingle()
  if (error || !data) return null
  return parseRelease(data.document)
}
