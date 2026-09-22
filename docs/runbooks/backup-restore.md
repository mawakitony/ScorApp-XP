# Sauvegarde et restauration

La sauvegarde PostgreSQL n'est pas implémentée dans l'application. Elle repose sur Supabase.

- Fréquence : quotidienne au minimum, PITR si le plan Supabase le permet.
- Responsable : l'opérateur plateforme, pas le tenant.
- Restauration : depuis le tableau Supabase, vers un projet de secours. Vérifier une organisation, une scorecard publiée et un lead récent.
- Storage : les PDF suivent la politique du bucket. `REPORT_RETENTION_DAYS` vide ne supprime rien.
- Les leads, conversions et `audit_logs` ne sont pas purgés par l'application.
