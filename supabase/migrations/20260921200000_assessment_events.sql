-- Nouvelles valeurs d'événements. Fichier séparé : PostgreSQL n'autorise
-- leur usage qu'après validation de cette migration.

alter type public.event_type add value if not exists 'landing_viewed';
alter type public.event_type add value if not exists 'lead_form_viewed';
alter type public.event_type add value if not exists 'lead_submitted';
alter type public.event_type add value if not exists 'question_answered';
