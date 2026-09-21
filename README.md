# WOLOYEM Score

Plateforme de diagnostics, scorecards et qualification de prospects pour les formations WOLOYEM.

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, Supabase (PostgreSQL, Auth, Storage, RLS), React Hook Form, Zod, Recharts.

## Démarrage

1. Copier les variables :

```bash
cp .env.example .env.local
```

2. Créer un projet [Supabase](https://supabase.com) et renseigner :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement, jamais dans le navigateur)
- `NEXT_PUBLIC_APP_URL` (`http://localhost:3000` en local)

3. Dans le SQL Editor Supabase, exécuter :

`supabase/migrations/20260921180000_init.sql`

La migration crée l'organisation WOLOYEM, les modèles, les policies RLS et le bucket `scorecard-assets`.

4. Dans Authentication → URL Configuration :

- Site URL : `http://localhost:3000`
- Redirect URLs : `http://localhost:3000/auth/callback`

Activer Email + mot de passe et le magic link. Google OAuth pourra être ajouté plus tard sans changer le modèle d'accès.

5. Lancer l'application :

```bash
npm install
npm run dev
```

Le premier compte créé devient propriétaire de WOLOYEM. Les comptes suivants doivent être invités depuis Settings.

## Routes

Public :

- `/s/[slug]`
- `/s/[slug]/assessment`
- `/s/[slug]/results/[sessionId]`

Admin, réservé aux membres connectés :

- `/dashboard`
- `/dashboard/scorecards`
- `/dashboard/scorecards/[id]`
- `/dashboard/scorecards/[id]/builder`
- `/dashboard/leads`
- `/dashboard/analytics`
- `/dashboard/templates`
- `/dashboard/settings`

Une scorecard `draft` n'est pas accessible publiquement. L'aperçu admin utilise `?preview=1`.

## Vercel

Déployer le dépôt tel quel. Renseigner les mêmes variables d'environnement, puis ajouter l'URL de production dans les Redirect URLs Supabase.

```bash
npm run typecheck
npm run lint
npm run build
```

## Sécurité

- RLS activé sur toutes les tables métier.
- Les visiteurs anonymes lisent seulement une scorecard publiée et son contenu public.
- Les leads, réponses, statistiques et tables d'administration ne sont lisibles que par les membres de l'organisation.
- `SUPABASE_SERVICE_ROLE_KEY` n'est importée que dans `lib/supabase/admin.ts`, marqué `server-only`.

Les écritures publiques (sessions, réponses) seront ajoutées plus tard par des fonctions SQL, pas par un accès direct aux tables.
