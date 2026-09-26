import { NextResponse } from "next/server"
import { can } from "@/lib/auth/permissions"
import { ensureMembership } from "@/lib/data/membership"
import { buildQuestionnaireTemplate, TEMPLATE_NAME } from "@/lib/importers/excel"

export async function GET() {
  const membership = await ensureMembership()
  if (!membership || !can({ role: membership.role }, "scorecard.edit")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const file = await buildQuestionnaireTemplate()
  return new NextResponse(file.bytes, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${TEMPLATE_NAME}"`,
      "cache-control": "private, no-store",
    },
  })
}
