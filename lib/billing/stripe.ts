import "server-only"

import Stripe from "stripe"

export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return new Stripe(key)
}

export function stripeWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET || null
}
