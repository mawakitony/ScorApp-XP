import { notFound, redirect } from "next/navigation"
import { recordCtaClick } from "@/lib/assessment/store"

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await context.params
  const url = await recordCtaClick(slug, sessionId)
  if (!url || !/^https?:\/\//i.test(url)) notFound()
  redirect(url)
}
