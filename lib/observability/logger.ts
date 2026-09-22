type Level = "debug" | "info" | "warn" | "error"

const SECRET = /token|password|secret|api[_-]?key|authorization/i

export function redact(fields: Record<string, string | number | null | undefined>) {
  const safe: Record<string, string | number | null> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET.test(key) || value === undefined) continue
    safe[key] = typeof value === "string" ? value.slice(0, 180) : value
  }
  return safe
}

export function log(level: Level, event: string, fields: Record<string, string | number | null | undefined> = {}) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...redact(fields) })
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else if (level === "debug") return
  else console.info(line)
}
