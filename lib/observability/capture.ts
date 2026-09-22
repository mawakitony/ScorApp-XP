import "server-only"

import { log } from "@/lib/observability/logger"

export async function captureError(code: string, context: { route?: string; requestId?: string | null; organizationId?: string | null }) {
  log("error", code, {
    route: context.route ?? null,
    request_id: context.requestId ?? null,
    organization_id: context.organizationId ?? null,
  })
  if (process.env.SENTRY_DSN) log("warn", "error.tracker_not_installed", { code })
}
