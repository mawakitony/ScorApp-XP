export type DomainVerification = {
  record: "TXT"
  host: string
  value: string
}

export interface DomainProvider {
  id: string
  instructions(domain: string, token: string): DomainVerification
}

export function activeDomainProvider(): DomainProvider {
  return {
    id: process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID ? "vercel-ready" : "dns-txt",
    instructions(domain, token) {
      return { record: "TXT", host: domain, value: `woloyem-verification=${token}` }
    },
  }
}
