# Domaines personnalisés

`https://score.client.com/pmp-readiness` est réécrit vers `/s/pmp-readiness`. L'URL visible reste celle du client. `/s/[slug]` continue de fonctionner sur les hôtes plateforme.

La racine du domaine ouvre `default_scorecard_id` si la scorecard est publiée. Sinon, réponse 404, sans redirection vers WOLOYEM.

Un domaine vérifié appartient à une seule organisation. Le slug de scorecard est unique par organisation. Sur l'hôte plateforme, un slug ambigu ne s'affiche pas.

Le routage n'accepte que les lignes `custom_domains.status = verified`, relues côté serveur. Les hôtes plateforme ne sont jamais des domaines clients.

Vercel attache le domaine et fournit le TLS. L'application ne gère pas Let's Encrypt. Sans `VERCEL_TOKEN` et `VERCEL_PROJECT_ID`, l'écran affiche que l'automatisation n'est pas configurée. Un échec d'API ne marque pas le domaine vérifié.

La vérification exige le TXT `woloyem-verification` et, si Vercel est configuré, le statut vérifié renvoyé par l'API. Le retrait passe le domaine à `disabled` avant l'appel de suppression.

Canonical : sur le domaine client, `https://score.client.com/pmp-readiness`. Si l'organisation a un domaine vérifié, la copie `/s/[slug]` est en `noindex`.
