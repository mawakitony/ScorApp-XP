export const ASSET_BYTES = 2_000_000

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const

export function validateImageFile(file: { type: string; size: number; name: string }) {
  if (!IMAGE_TYPES.some((type) => type === file.type)) return "type" as const
  if (file.size <= 0 || file.size > ASSET_BYTES) return "size" as const
  const extension = file.name.split(".").pop()?.toLowerCase() ?? ""
  const matches = file.type === "image/png"
    ? extension === "png"
    : file.type === "image/webp"
      ? extension === "webp"
      : extension === "jpg" || extension === "jpeg"
  if (!matches) return "mismatch" as const
  return null
}

export function extensionForType(type: string) {
  if (type === "image/png") return "png"
  if (type === "image/webp") return "webp"
  if (type === "image/jpeg") return "jpg"
  return null
}

export function safeReportPath(organizationId: string, storagePath: string) {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return false
  if (storagePath.includes("..") || storagePath.includes("\\") || storagePath.startsWith("/")) return false
  return storagePath.startsWith(`${organizationId}/`)
}

export function contentSecurityPolicy() {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://js.stripe.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://api.stripe.com",
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ")
}
