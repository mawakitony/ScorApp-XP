# Déploiement

1. Sauvegarde Supabase.
2. Appliquer la migration SQL. Elle est compatible avec le code précédent : nouvelles colonnes nullables, nouvelles tables, index de slug par organisation.
3. Renseigner les variables de production.
4. `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
5. Déployer. Les crons suivent `vercel.json`.
6. Smoke : `/`, `/login`, `/pricing`, scorecard publique, `/platform` sans session, `/api/health`.

Rollback du code : redéployer le build précédent. Ne pas supprimer la migration. Un correctif de schéma se fait par une nouvelle migration. Stripe et Storage ne sont pas rejoués par le déploiement.

Les previews Vercel doivent utiliser un projet Supabase distinct, pas la base de production.
