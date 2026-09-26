import type { NextConfig } from "next";
import { contentSecurityPolicy } from "./lib/security/limits";

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Frame-Options", value: "DENY" },
]

const nextConfig: NextConfig = {
  serverExternalPackages: ["exceljs"],
  async headers() {
    const headers = securityHeaders.map((header) =>
      header.key === "Content-Security-Policy" && process.env.NODE_ENV !== "production"
        ? { ...header, value: header.value.replace("script-src 'self' 'unsafe-inline'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'") }
        : header,
    )
    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" })
    }
    return [{ source: "/:path*", headers }]
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
