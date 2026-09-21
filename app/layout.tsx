import type { Metadata } from "next"
import { Fraunces, Manrope } from "next/font/google"
import { AppProviders } from "@/components/providers"
import { getAppUrl } from "@/lib/env"
import "./globals.css"

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
})

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
})

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  title: {
    default: "WOLOYEM Score",
    template: "%s · WOLOYEM Score",
  },
  description:
    "Diagnostics, scorecards et qualification de prospects pour les formations et certifications WOLOYEM.",
  openGraph: {
    title: "WOLOYEM Score",
    description: "Évaluez, qualifiez et orientez vos prospects vers la formation adaptée.",
    type: "website",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${manrope.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
