# Emails transactionnels

Provider : Brevo SMTP API, séparé des scénarios marketing. Pas de lien de désinscription marketing.

Templates FR et EN : invitation, fin d'essai, paiement échoué, rapport prêt, avis d'accès support.

File `email_jobs`. Relances à 1 min, 5 min, 30 min, 2 h et 12 h, puis `dead`. Clé d'idempotence, par exemple `organization_invitation:{id}`.

Le lien d'invitation n'est plus affiché à l'administrateur. Le jeton n'est pas écrit dans les logs. Le journal conserve le hash du destinataire, le template, le statut et l'identifiant provider.

SPF, DKIM et DMARC se configurent sur le domaine d'envoi. L'application ne simule pas leur validation.

Langue : `organizations.default_language` si elle vaut `en`, sinon français.
