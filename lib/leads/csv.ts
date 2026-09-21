const FORMULA = /^[\t\r\n ]*[=+\-@]/

export function csvCell(value: string | number | boolean | null | undefined) {
  const raw = value === null || value === undefined ? "" : String(value)
  const safe = FORMULA.test(raw) ? `'${raw}` : raw
  return `"${safe.replaceAll('"', '""')}"`
}

export function toCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]) {
  const lines = [headers, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(","))
  return `\uFEFF${lines.join("\r\n")}`
}
