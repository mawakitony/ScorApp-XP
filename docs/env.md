# Variables

Toujours nécessaires en production : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`.

Le contrôle s'exécute au démarrage du serveur, pas pendant `next build`.

Providers optionnels : Stripe, Vercel, Brevo, IA, Sentry. Sans clé, la fonction reste non configurée. Aucune de ces clés ne doit porter le préfixe `NEXT_PUBLIC_`.

`PLATFORM_HOSTS` liste les hôtes qui ne sont jamais des domaines clients. `localhost` et `*.vercel.app` sont toujours des hôtes plateforme.

`REPORT_RETENTION_DAYS` vide : aucun PDF n'est supprimé. `ASSESSMENT_ABANDON_AFTER_DAYS` défaut 7 : les sessions sans activité passent à `abandoned`, les réponses restent.

E2E : `E2E_SUPABASE_URL` doit différer de la base de production. Une clé `sk_live_` bloque les E2E.

`SENTRY_DSN` est réservé. Le SDK Sentry n'est pas installé : les erreurs restent dans les logs structurés.

`MFA_POLICY` est réservé. L'application ne force pas encore un second facteur : ne le définissez pas en attendant l'enrôlement TOTP Supabase.
