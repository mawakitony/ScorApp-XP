export const PLAN_IDS = ["free", "starter", "pro", "business", "enterprise", "internal"] as const
export type PlanId = (typeof PLAN_IDS)[number]

export const DEFAULT_TRIAL_DAYS = 14
export const GRACE_PERIOD_DAYS = 7
export const TRIAL_PLAN: PlanId = "starter"

export const FEATURES = [
  "advanced_analytics",
  "csv_export",
  "pdf_reports",
  "webhooks",
  "basic_automation",
  "advanced_automation",
  "brevo",
  "api",
  "ai",
  "custom_branding",
  "custom_domain",
  "remove_powered_by",
] as const
export type Feature = (typeof FEATURES)[number]

export const METRICS = [
  "scorecards",
  "assessment_starts",
  "leads",
  "team_members",
  "reports",
  "ai_generations",
  "webhook_deliveries",
  "api_requests",
] as const
export type UsageMetric = (typeof METRICS)[number]

export type PlanLimits = Record<UsageMetric, number | null>

export type PlanDefinition = {
  id: PlanId
  name: string
  monthlyPrice: number | null
  yearlyPrice: number | null
  selfServe: boolean
  public: boolean
  limits: PlanLimits
  features: readonly Feature[]
}

const none = [] as const

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    yearlyPrice: 0,
    selfServe: false,
    public: true,
    limits: {
      scorecards: 1,
      assessment_starts: 100,
      leads: 100,
      team_members: 1,
      reports: 20,
      ai_generations: 0,
      webhook_deliveries: 0,
      api_requests: 0,
    },
    features: none,
  },
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPrice: null,
    yearlyPrice: null,
    selfServe: true,
    public: true,
    limits: {
      scorecards: 5,
      assessment_starts: 1000,
      leads: 1000,
      team_members: 3,
      reports: 1000,
      ai_generations: 0,
      webhook_deliveries: 2000,
      api_requests: 0,
    },
    features: ["advanced_analytics", "csv_export", "pdf_reports", "webhooks", "basic_automation"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPrice: null,
    yearlyPrice: null,
    selfServe: true,
    public: true,
    limits: {
      scorecards: 20,
      assessment_starts: 10000,
      leads: 10000,
      team_members: 10,
      reports: 10000,
      ai_generations: 500,
      webhook_deliveries: 20000,
      api_requests: 20000,
    },
    features: [
      "advanced_analytics",
      "csv_export",
      "pdf_reports",
      "webhooks",
      "basic_automation",
      "advanced_automation",
      "brevo",
      "api",
      "ai",
      "custom_branding",
    ],
  },
  business: {
    id: "business",
    name: "Business",
    monthlyPrice: null,
    yearlyPrice: null,
    selfServe: true,
    public: true,
    limits: {
      scorecards: 100,
      assessment_starts: 50000,
      leads: 50000,
      team_members: 25,
      reports: 50000,
      ai_generations: 5000,
      webhook_deliveries: 100000,
      api_requests: 100000,
    },
    features: [
      "advanced_analytics",
      "csv_export",
      "pdf_reports",
      "webhooks",
      "basic_automation",
      "advanced_automation",
      "brevo",
      "api",
      "ai",
      "custom_branding",
      "custom_domain",
      "remove_powered_by",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: null,
    yearlyPrice: null,
    selfServe: false,
    public: true,
    limits: {
      scorecards: null,
      assessment_starts: null,
      leads: null,
      team_members: null,
      reports: null,
      ai_generations: null,
      webhook_deliveries: null,
      api_requests: null,
    },
    features: PLANS_ENTERPRISE_FEATURES(),
  },
  internal: {
    id: "internal",
    name: "Internal",
    monthlyPrice: null,
    yearlyPrice: null,
    selfServe: false,
    public: false,
    limits: {
      scorecards: null,
      assessment_starts: null,
      leads: null,
      team_members: null,
      reports: null,
      ai_generations: null,
      webhook_deliveries: null,
      api_requests: null,
    },
    features: PLANS_ENTERPRISE_FEATURES(),
  },
}

function PLANS_ENTERPRISE_FEATURES(): readonly Feature[] {
  return FEATURES
}

export function isPlanId(value: string): value is PlanId {
  return PLAN_IDS.some((plan) => plan === value)
}

export function publicPlans() {
  return PLAN_IDS.filter((id) => PLANS[id].public).map((id) => PLANS[id])
}

export type BillingInterval = "monthly" | "yearly"

export function stripePriceId(plan: PlanId, interval: BillingInterval) {
  if (!PLANS[plan].selfServe) return null
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${interval === "yearly" ? "YEARLY" : "MONTHLY"}`
  const value = process.env[key]?.trim()
  return value || null
}

export function planFromPriceId(priceId: string | null | undefined): { plan: PlanId; interval: BillingInterval } | null {
  if (!priceId) return null
  for (const plan of PLAN_IDS) {
    if (!PLANS[plan].selfServe) continue
    if (process.env[`STRIPE_PRICE_${plan.toUpperCase()}_MONTHLY`] === priceId) return { plan, interval: "monthly" }
    if (process.env[`STRIPE_PRICE_${plan.toUpperCase()}_YEARLY`] === priceId) return { plan, interval: "yearly" }
  }
  return null
}
