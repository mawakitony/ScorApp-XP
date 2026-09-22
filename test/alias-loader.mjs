import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = path.join(root, specifier.slice(2))
    const found = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find((candidate) => existsSync(candidate))
    if (found) return nextResolve(pathToFileURL(found).href, context)
  }
  if (specifier.startsWith(".")) {
    const parent = context.parentURL ? path.dirname(fileURLToPath(context.parentURL)) : root
    const base = path.resolve(parent, specifier)
    const found = [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find((candidate) => existsSync(candidate))
    if (found) return nextResolve(pathToFileURL(found).href, context)
  }
  return nextResolve(specifier, context)
}
