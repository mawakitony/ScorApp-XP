import { WEBHOOK_TIMEOUT_MS } from "./version"
import { retryPlan } from "./retry"
import { webhookSignatureHeader } from "./signature"

export async function deliverWebhook(input: {
  url: string
  secret: string
  event: string
  deliveryId: string
  rawBody: string
  attempt: number
  fetchImpl?: typeof fetch
  nowSeconds?: number
}) {
  const timestamp = String(input.nowSeconds ?? Math.floor(Date.now() / 1000))
  const headers = {
    "content-type": "application/json",
    "X-Woloyem-Event": input.event,
    "X-Woloyem-Delivery": input.deliveryId,
    "X-Woloyem-Timestamp": timestamp,
    "X-Woloyem-Signature": webhookSignatureHeader(input.secret, timestamp, input.rawBody),
  }
  try {
    const response = await (input.fetchImpl ?? fetch)(input.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      headers,
      body: input.rawBody,
    })
    const excerpt = (await response.text()).slice(0, 300)
    if (response.status >= 200 && response.status < 300) {
      return { httpStatus: response.status, excerpt, networkError: false, status: "delivered" as const, delayMs: null }
    }
    const plan = retryPlan(input.attempt, { httpStatus: response.status, networkError: false })
    return { httpStatus: response.status, excerpt, networkError: false, ...plan }
  } catch {
    const plan = retryPlan(input.attempt, { httpStatus: null, networkError: true })
    return { httpStatus: null, excerpt: "network_error", networkError: true, ...plan }
  }
}
