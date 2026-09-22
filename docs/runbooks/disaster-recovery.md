# Reprise

- Base indisponible : `/api/health` répond 503. Les assessments s'arrêtent. Restaurer Supabase, ne pas écrire dans une base partielle.
- Webhook Stripe en panne : les plans ne changent pas tant que l'événement n'est pas accepté. Relancer depuis le tableau Stripe après correction. La console ne voit pas les livraisons jamais insérées.
- Storage indisponible : les rapports restent `failed` et le worker reprend. Ne pas marquer un PDF prêt sans fichier.
- Cron arrêté : les heartbeats passent `degraded` après 15 minutes. Relancer les crons. Les jobs `pending` restent en file.
- Brevo indisponible : les emails restent en file puis `dead`. L'invitation existe déjà. Renvoyer en remettant le job `pending` après correction, sans recréer le jeton dans les logs.
- Incident Vercel : les domaines clients suivent la disponibilité du projet. Le TLS n'est pas géré ici.
