# Stripe

Mode test uniquement en développement et en E2E. Refuser `sk_live_` dans les tests automatiques.

Écoute locale :

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Événements utiles :

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger invoice.payment_failed
```

Le webhook reste la source de vérité du plan, du statut et de la période. Un paiement échoué crée une notification interne et un email `payment_failed` idempotent. Les webhooks rejetés avant insertion dans `stripe_events` ne sont pas connus de la console.
