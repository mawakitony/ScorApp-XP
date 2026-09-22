import { REPORT_AI_PROMPT_VERSION } from "@/lib/reports/version"
import { AI_GUARDRAILS, aiPayload, sanitizeAiAnalysis, type AIReportAnalysis, type AIReportInput } from "@/lib/ai/prompts"

export interface AIProvider {
  id: string
  configured: boolean
  generateReportAnalysis(input: AIReportInput): Promise<AIReportAnalysis | null>
}

export function activeAiProvider(): AIProvider {
  const key = process.env.AI_API_KEY
  const id = process.env.AI_PROVIDER
  const url = process.env.AI_BASE_URL
  const configured = Boolean(key && id && url)
  return {
    id: id || "unconfigured",
    configured,
    async generateReportAnalysis(input) {
      if (!configured || !key || !url) return null
      try {
        const response = await fetch(url, {
          method: "POST",
          redirect: "manual",
          signal: AbortSignal.timeout(20_000),
          headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: process.env.AI_MODEL || "default",
            temperature: 0.2,
            messages: [
              { role: "system", content: `${AI_GUARDRAILS} Prompt ${REPORT_AI_PROMPT_VERSION}. Réponds uniquement en JSON.` },
              { role: "user", content: JSON.stringify(aiPayload(input)) },
            ],
          }),
        })
        if (!response.ok) return null
        const body = await response.json() as { choices?: { message?: { content?: string } }[] }
        const content = body.choices?.[0]?.message?.content
        if (!content) return null
        return sanitizeAiAnalysis(JSON.parse(content))
      } catch {
        return null
      }
    },
  }
}
