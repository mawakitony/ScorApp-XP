import "server-only"

export function logAssessment(event: string, context: Record<string, string | number | boolean | null>) {
  console.error(JSON.stringify({ event, ...context }))
}
