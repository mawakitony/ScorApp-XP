# Cron

`/api/cron/integrations` traite les jobs d'intégration et les rapports, puis écrit les heartbeats. Le verrou reste `FOR UPDATE SKIP LOCKED` dans les fonctions de claim existantes. Chaque passage est borné.

`/api/cron/maintenance` marque les sessions abandonnées ou expirées, supprime les invitations échues, envoie les emails en attente, prévient les essais à 3 jours, et ne retire des PDF que si `REPORT_RETENTION_DAYS` est défini.

Les deux routes exigent `Authorization: Bearer CRON_SECRET`. Un secret absent répond 401.

Si un worker est `degraded` dans `/platform/health`, vérifier le dernier déploiement, le secret, et les logs `email.retry` ou `failed`.
