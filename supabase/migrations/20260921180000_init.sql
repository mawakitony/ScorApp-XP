-- WOLOYEM Score — schéma initial, RLS et fonctions métier.
-- À exécuter une fois sur le projet Supabase Cloud (SQL Editor ou supabase db push).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.org_role as enum ('owner', 'admin', 'member');

create type public.scorecard_status as enum ('draft', 'published', 'paused', 'archived');

create type public.scorecard_language as enum ('fr', 'en');

create type public.question_type as enum (
  'single_choice',
  'multiple_choice',
  'yes_no',
  'scale_5',
  'scale_10',
  'short_text',
  'long_text',
  'number',
  'email',
  'phone',
  'country',
  'dropdown'
);

create type public.lead_capture_timing as enum (
  'before',
  'during',
  'before_results',
  'after_results'
);

create type public.field_visibility as enum ('required', 'optional', 'hidden');

create type public.assessment_status as enum (
  'started',
  'in_progress',
  'completed',
  'abandoned'
);

create type public.event_type as enum (
  'page_view',
  'assessment_started',
  'lead_captured',
  'assessment_completed',
  'score_calculated',
  'result_viewed',
  'cta_clicked'
);

-- ---------------------------------------------------------------------------
-- Fonctions utilitaires
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_org_member(org_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
  );
end;
$$;

create or replace function public.has_org_role(org_id uuid, allowed public.org_role[])
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.role = any (allowed)
  );
end;
$$;

create or replace function public.shares_organization(other_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid()
      and theirs.user_id = other_user
  );
end;
$$;

create or replace function public.can_edit_scorecard(scorecard uuid)
returns boolean
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.scorecards s
    where s.id = scorecard
      and public.has_org_role(s.organization_id, array['owner', 'admin']::public.org_role[])
  );
end;
$$;

revoke all on function public.set_updated_at() from public;
revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.has_org_role(uuid, public.org_role[]) from public;
revoke all on function public.shares_organization(uuid) from public;
revoke all on function public.can_edit_scorecard(uuid) from public;

grant execute on function public.is_org_member(uuid) to anon, authenticated;
grant execute on function public.has_org_role(uuid, public.org_role[]) to authenticated;
grant execute on function public.shares_organization(uuid) to authenticated;
grant execute on function public.can_edit_scorecard(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Identité et multi-tenant
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  logo_url text,
  primary_color text not null default '#16324F' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#C4A15A' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id);
create index organization_members_org_id_idx on public.organization_members (organization_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'membre'), '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public;

-- ---------------------------------------------------------------------------
-- Scorecards
-- ---------------------------------------------------------------------------

create table public.scorecards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  language public.scorecard_language not null default 'fr',
  category text not null default 'Gestion de projet',
  status public.scorecard_status not null default 'draft',
  cover_image_url text,
  logo_url text,
  primary_color text not null default '#16324F' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#C4A15A' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  estimated_minutes integer not null default 3 check (estimated_minutes between 1 and 60),
  privacy_text text,
  seo_title text,
  seo_description text,
  og_title text,
  og_description text,
  og_image_url text,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index scorecards_org_status_idx on public.scorecards (organization_id, status);
create index scorecards_created_at_idx on public.scorecards (created_at desc);

create table public.scorecard_pages (
  id uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null unique references public.scorecards (id) on delete cascade,
  title text not null,
  subtitle text,
  description text,
  hero_image_url text,
  benefits jsonb not null default '[]'::jsonb,
  testimonial jsonb,
  cta_text text not null default 'Commencer',
  show_estimated_time boolean not null default true,
  show_question_count boolean not null default true,
  show_privacy boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.scorecard_lead_forms (
  id uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null unique references public.scorecards (id) on delete cascade,
  timing public.lead_capture_timing not null default 'before_results',
  consent_required boolean not null default true,
  consent_label text not null default 'J''accepte que WOLOYEM utilise mes informations pour me recontacter au sujet de cette évaluation.',
  privacy_policy_url text,
  fields jsonb not null default jsonb_build_object(
    'first_name', 'required',
    'last_name', 'optional',
    'email', 'required',
    'phone', 'optional',
    'whatsapp', 'hidden',
    'company', 'optional',
    'job_title', 'hidden',
    'country', 'optional',
    'city', 'hidden'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.question_categories (
  id uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null references public.scorecards (id) on delete cascade,
  name text not null,
  description text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index question_categories_scorecard_idx on public.question_categories (scorecard_id, position);

create table public.scoring_categories (
  id uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null references public.scorecards (id) on delete cascade,
  name text not null,
  description text,
  weight numeric(8, 2) not null default 1 check (weight > 0),
  max_score numeric(10, 2) not null default 100 check (max_score > 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index scoring_categories_scorecard_idx on public.scoring_categories (scorecard_id, position);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null references public.scorecards (id) on delete cascade,
  question_category_id uuid references public.question_categories (id) on delete set null,
  scoring_category_id uuid references public.scoring_categories (id) on delete set null,
  type public.question_type not null,
  title text not null,
  description text,
  is_required boolean not null default true,
  position integer not null default 0,
  max_score numeric(10, 2),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index questions_scorecard_position_idx on public.questions (scorecard_id, position);
create index questions_scoring_category_idx on public.questions (scoring_category_id);

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  label text not null,
  value text,
  score numeric(10, 2) not null default 0,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index question_options_question_idx on public.question_options (question_id, position);

create table public.scoring_rules (
  id uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null references public.scorecards (id) on delete cascade,
  scoring_category_id uuid references public.scoring_categories (id) on delete cascade,
  rule_type text not null check (rule_type in ('points', 'weight', 'cap', 'threshold')),
  config jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index scoring_rules_scorecard_idx on public.scoring_rules (scorecard_id, position);

create table public.result_ranges (
  id uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null references public.scorecards (id) on delete cascade,
  min_percent numeric(5, 2) not null check (min_percent >= 0 and min_percent <= 100),
  max_percent numeric(5, 2) not null check (max_percent >= 0 and max_percent <= 100),
  label text not null,
  title text not null,
  description text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_percent >= min_percent)
);

create index result_ranges_scorecard_idx on public.result_ranges (scorecard_id, position);

create table public.result_recommendations (
  id uuid primary key default gen_random_uuid(),
  result_range_id uuid not null references public.result_ranges (id) on delete cascade,
  title text not null,
  body text,
  cta_label text,
  cta_url text,
  image_url text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index result_recommendations_range_idx on public.result_recommendations (result_range_id, position);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  key text not null unique,
  name text not null,
  description text not null,
  category text not null,
  objective text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Participants, sessions, résultats, leads
-- ---------------------------------------------------------------------------

create table public.respondents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text,
  first_name text,
  last_name text,
  phone text,
  whatsapp text,
  company text,
  job_title text,
  country text,
  city text,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index respondents_org_email_idx on public.respondents (organization_id, email);

create table public.assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null references public.scorecards (id) on delete cascade,
  respondent_id uuid references public.respondents (id) on delete set null,
  anonymous_key text not null unique,
  status public.assessment_status not null default 'started',
  current_step integer not null default 0,
  device_type text check (device_type in ('desktop', 'tablet', 'mobile', 'unknown')),
  referrer text,
  landing_path text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assessment_sessions_scorecard_idx on public.assessment_sessions (scorecard_id, created_at desc);
create index assessment_sessions_respondent_idx on public.assessment_sessions (respondent_id);

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assessment_sessions (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  option_id uuid references public.question_options (id) on delete set null,
  value_text text,
  value_number numeric,
  score_awarded numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index responses_text_answer_uidx
  on public.responses (session_id, question_id)
  where option_id is null;

create unique index responses_option_answer_uidx
  on public.responses (session_id, question_id, option_id)
  where option_id is not null;

create index responses_session_idx on public.responses (session_id);

create table public.assessment_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.assessment_sessions (id) on delete cascade,
  overall_score numeric(10, 2) not null,
  overall_percent numeric(5, 2) not null check (overall_percent >= 0 and overall_percent <= 100),
  result_range_id uuid references public.result_ranges (id) on delete set null,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assessment_results_calculated_idx on public.assessment_results (calculated_at desc);

create table public.category_scores (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.assessment_results (id) on delete cascade,
  scoring_category_id uuid not null references public.scoring_categories (id) on delete cascade,
  score numeric(10, 2) not null,
  percent numeric(5, 2) not null,
  max_score numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (result_id, scoring_category_id)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  scorecard_id uuid references public.scorecards (id) on delete set null,
  session_id uuid references public.assessment_sessions (id) on delete set null,
  respondent_id uuid references public.respondents (id) on delete set null,
  result_id uuid references public.assessment_results (id) on delete set null,
  source text,
  tags text[] not null default '{}',
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_org_created_idx on public.leads (organization_id, created_at desc);
create index leads_scorecard_idx on public.leads (scorecard_id);
create index leads_respondent_idx on public.leads (respondent_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  scorecard_id uuid references public.scorecards (id) on delete set null,
  session_id uuid references public.assessment_sessions (id) on delete set null,
  event_type public.event_type not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index events_org_created_idx on public.events (organization_id, created_at desc);
create index events_scorecard_type_idx on public.events (scorecard_id, event_type);
create index events_session_idx on public.events (session_id);

create table public.utm_tracking (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.assessment_sessions (id) on delete cascade,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  created_at timestamptz not null default now()
);

create table public.cta_clicks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assessment_sessions (id) on delete cascade,
  recommendation_id uuid references public.result_recommendations (id) on delete set null,
  url text not null,
  created_at timestamptz not null default now()
);

create index cta_clicks_session_idx on public.cta_clicks (session_id);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger organization_members_updated_at before update on public.organization_members
  for each row execute function public.set_updated_at();
create trigger scorecards_updated_at before update on public.scorecards
  for each row execute function public.set_updated_at();
create trigger scorecard_pages_updated_at before update on public.scorecard_pages
  for each row execute function public.set_updated_at();
create trigger scorecard_lead_forms_updated_at before update on public.scorecard_lead_forms
  for each row execute function public.set_updated_at();
create trigger question_categories_updated_at before update on public.question_categories
  for each row execute function public.set_updated_at();
create trigger scoring_categories_updated_at before update on public.scoring_categories
  for each row execute function public.set_updated_at();
create trigger questions_updated_at before update on public.questions
  for each row execute function public.set_updated_at();
create trigger question_options_updated_at before update on public.question_options
  for each row execute function public.set_updated_at();
create trigger scoring_rules_updated_at before update on public.scoring_rules
  for each row execute function public.set_updated_at();
create trigger result_ranges_updated_at before update on public.result_ranges
  for each row execute function public.set_updated_at();
create trigger result_recommendations_updated_at before update on public.result_recommendations
  for each row execute function public.set_updated_at();
create trigger templates_updated_at before update on public.templates
  for each row execute function public.set_updated_at();
create trigger respondents_updated_at before update on public.respondents
  for each row execute function public.set_updated_at();
create trigger assessment_sessions_updated_at before update on public.assessment_sessions
  for each row execute function public.set_updated_at();
create trigger responses_updated_at before update on public.responses
  for each row execute function public.set_updated_at();
create trigger assessment_results_updated_at before update on public.assessment_results
  for each row execute function public.set_updated_at();
create trigger category_scores_updated_at before update on public.category_scores
  for each row execute function public.set_updated_at();
create trigger leads_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Vue métriques scorecard (RLS des tables sous-jacentes)
-- ---------------------------------------------------------------------------

create view public.scorecard_stats
with (security_invoker = true) as
select
  sc.id as scorecard_id,
  count(e.id) filter (where e.event_type = 'page_view')::integer as visitors,
  count(e.id) filter (where e.event_type = 'assessment_started')::integer as participants,
  count(e.id) filter (where e.event_type = 'assessment_completed')::integer as results
from public.scorecards sc
left join public.events e on e.scorecard_id = sc.id
where public.is_org_member(sc.organization_id)
group by sc.id;

-- ---------------------------------------------------------------------------
-- Fonctions applicatives
-- ---------------------------------------------------------------------------

create or replace function public.bootstrap_membership()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_org uuid;
  org_id uuid;
  member_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  select m.organization_id into existing_org
  from public.organization_members m
  where m.user_id = auth.uid()
  limit 1;

  if existing_org is not null then
    return existing_org;
  end if;

  perform pg_advisory_xact_lock(hashtext('woloyem-bootstrap'));

  select id into org_id from public.organizations where slug = 'woloyem';
  if org_id is null then
    raise exception 'Organisation WOLOYEM introuvable';
  end if;

  select count(*) into member_count
  from public.organization_members
  where organization_id = org_id;

  if member_count = 0 then
    insert into public.organization_members (organization_id, user_id, role)
    values (org_id, auth.uid(), 'owner');
    return org_id;
  end if;

  raise exception 'Invitation requise';
end;
$$;

create or replace function public.add_organization_member(member_email text, member_role public.org_role)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  caller_role public.org_role;
  target_id uuid;
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  if member_role = 'owner' then
    raise exception 'Le rôle propriétaire ne peut pas être attribué ici';
  end if;

  select m.organization_id, m.role into org_id, caller_role
  from public.organization_members m
  where m.user_id = auth.uid()
  limit 1;

  if org_id is null or caller_role not in ('owner', 'admin') then
    raise exception 'Permission refusée';
  end if;

  if member_role = 'admin' and caller_role <> 'owner' then
    raise exception 'Seul un propriétaire peut nommer un administrateur';
  end if;

  select p.id into target_id
  from public.profiles p
  where lower(p.email) = lower(trim(member_email));

  if target_id is null then
    raise exception 'Aucun compte n''existe avec cet email. La personne doit d''abord créer un compte.';
  end if;

  if exists (
    select 1 from public.organization_members
    where organization_id = org_id and user_id = target_id and role = 'owner'
  ) then
    raise exception 'Le propriétaire ne peut pas être modifié ici';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (org_id, target_id, member_role)
  on conflict (organization_id, user_id) do update set role = excluded.role
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.remove_organization_member(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  caller_role public.org_role;
  target_role public.org_role;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  select m.organization_id, m.role into org_id, caller_role
  from public.organization_members m
  where m.user_id = auth.uid()
  limit 1;

  if org_id is null or caller_role not in ('owner', 'admin') then
    raise exception 'Permission refusée';
  end if;

  select role into target_role
  from public.organization_members
  where organization_id = org_id and user_id = target_user;

  if target_role is null then
    raise exception 'Membre introuvable';
  end if;

  if target_role = 'owner' or target_user = auth.uid() then
    raise exception 'Ce membre ne peut pas être retiré ici';
  end if;

  if target_role = 'admin' and caller_role <> 'owner' then
    raise exception 'Seul un propriétaire peut retirer un administrateur';
  end if;

  delete from public.organization_members
  where organization_id = org_id and user_id = target_user;
end;
$$;

create or replace function public.anonymize_lead(target_lead uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_row public.leads%rowtype;
  caller_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  select * into lead_row from public.leads where id = target_lead;
  if not found then
    raise exception 'Lead introuvable';
  end if;

  caller_ok := public.has_org_role(lead_row.organization_id, array['owner', 'admin']::public.org_role[]);
  if not caller_ok then
    raise exception 'Permission refusée';
  end if;

  if lead_row.respondent_id is not null then
    update public.respondents
    set
      email = null,
      first_name = null,
      last_name = null,
      phone = null,
      whatsapp = null,
      company = null,
      job_title = null,
      city = null
    where id = lead_row.respondent_id;
  end if;

  update public.leads
  set anonymized_at = now(), tags = '{}'
  where id = target_lead;
end;
$$;

create or replace function public.duplicate_scorecard(source_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  src public.scorecards%rowtype;
  new_id uuid := gen_random_uuid();
  new_slug text;
  base_slug text;
  suffix integer := 1;
  rec record;
  new_row_id uuid;
  qcat_map jsonb := '{}'::jsonb;
  scat_map jsonb := '{}'::jsonb;
  question_map jsonb := '{}'::jsonb;
  range_map jsonb := '{}'::jsonb;
begin
  select * into src from public.scorecards where id = source_id;
  if not found then
    raise exception 'Scorecard introuvable';
  end if;

  if not public.has_org_role(src.organization_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'Permission refusée';
  end if;

  base_slug := left(src.slug, 64);
  new_slug := base_slug || '-copie';
  while exists (select 1 from public.scorecards s where s.slug = new_slug) loop
    suffix := suffix + 1;
    new_slug := base_slug || '-copie-' || suffix::text;
  end loop;

  insert into public.scorecards (
    id, organization_id, name, slug, description, language, category, status,
    cover_image_url, logo_url, primary_color, secondary_color, estimated_minutes,
    privacy_text, seo_title, seo_description, og_title, og_description, og_image_url,
    created_by
  ) values (
    new_id, src.organization_id, left(src.name || ' (copie)', 160), new_slug, src.description,
    src.language, src.category, 'draft', src.cover_image_url, src.logo_url,
    src.primary_color, src.secondary_color, src.estimated_minutes, src.privacy_text,
    src.seo_title, src.seo_description, src.og_title, src.og_description, src.og_image_url,
    auth.uid()
  );

  insert into public.scorecard_pages (
    scorecard_id, title, subtitle, description, hero_image_url, benefits, testimonial,
    cta_text, show_estimated_time, show_question_count, show_privacy
  )
  select
    new_id, title, subtitle, description, hero_image_url, benefits, testimonial,
    cta_text, show_estimated_time, show_question_count, show_privacy
  from public.scorecard_pages
  where scorecard_id = source_id;

  insert into public.scorecard_lead_forms (
    scorecard_id, timing, consent_required, consent_label, privacy_policy_url, fields
  )
  select new_id, timing, consent_required, consent_label, privacy_policy_url, fields
  from public.scorecard_lead_forms
  where scorecard_id = source_id;

  for rec in
    select * from public.scoring_categories where scorecard_id = source_id order by position
  loop
    insert into public.scoring_categories (scorecard_id, name, description, weight, max_score, position)
    values (new_id, rec.name, rec.description, rec.weight, rec.max_score, rec.position)
    returning id into new_row_id;
    scat_map := scat_map || jsonb_build_object(rec.id::text, new_row_id);
  end loop;

  for rec in
    select * from public.question_categories where scorecard_id = source_id order by position
  loop
    insert into public.question_categories (scorecard_id, name, description, position)
    values (new_id, rec.name, rec.description, rec.position)
    returning id into new_row_id;
    qcat_map := qcat_map || jsonb_build_object(rec.id::text, new_row_id);
  end loop;

  for rec in
    select * from public.questions where scorecard_id = source_id order by position
  loop
    insert into public.questions (
      scorecard_id, question_category_id, scoring_category_id, type, title, description,
      is_required, position, max_score, settings
    ) values (
      new_id,
      case when rec.question_category_id is null then null else (qcat_map ->> rec.question_category_id::text)::uuid end,
      case when rec.scoring_category_id is null then null else (scat_map ->> rec.scoring_category_id::text)::uuid end,
      rec.type, rec.title, rec.description, rec.is_required, rec.position, rec.max_score, rec.settings
    )
    returning id into new_row_id;
    question_map := question_map || jsonb_build_object(rec.id::text, new_row_id);
  end loop;

  for rec in
    select o.*
    from public.question_options o
    join public.questions q on q.id = o.question_id
    where q.scorecard_id = source_id
    order by o.position
  loop
    insert into public.question_options (question_id, label, value, score, position)
    values ((question_map ->> rec.question_id::text)::uuid, rec.label, rec.value, rec.score, rec.position);
  end loop;

  for rec in
    select * from public.scoring_rules where scorecard_id = source_id order by position
  loop
    insert into public.scoring_rules (scorecard_id, scoring_category_id, rule_type, config, position)
    values (
      new_id,
      case when rec.scoring_category_id is null then null else (scat_map ->> rec.scoring_category_id::text)::uuid end,
      rec.rule_type, rec.config, rec.position
    );
  end loop;

  for rec in
    select * from public.result_ranges where scorecard_id = source_id order by position
  loop
    insert into public.result_ranges (
      scorecard_id, min_percent, max_percent, label, title, description, position
    ) values (
      new_id, rec.min_percent, rec.max_percent, rec.label, rec.title, rec.description, rec.position
    )
    returning id into new_row_id;
    range_map := range_map || jsonb_build_object(rec.id::text, new_row_id);
  end loop;

  for rec in
    select r.*
    from public.result_recommendations r
    join public.result_ranges rr on rr.id = r.result_range_id
    where rr.scorecard_id = source_id
    order by r.position
  loop
    insert into public.result_recommendations (
      result_range_id, title, body, cta_label, cta_url, image_url, position
    ) values (
      (range_map ->> rec.result_range_id::text)::uuid,
      rec.title, rec.body, rec.cta_label, rec.cta_url, rec.image_url, rec.position
    );
  end loop;

  return new_id;
end;
$$;

create or replace function public.dashboard_overview(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with counts as (
    select
      (select count(*) from public.leads where created_at >= p_from and created_at < p_to) as leads,
      (select count(*) from public.events where event_type = 'page_view' and created_at >= p_from and created_at < p_to) as page_views,
      (select count(*) from public.events where event_type = 'assessment_started' and created_at >= p_from and created_at < p_to) as started,
      (select count(*) from public.events where event_type = 'lead_captured' and created_at >= p_from and created_at < p_to) as captured,
      (select count(*) from public.events where event_type = 'assessment_completed' and created_at >= p_from and created_at < p_to) as completed,
      (select count(*) from public.events where event_type = 'result_viewed' and created_at >= p_from and created_at < p_to) as viewed,
      (select count(*) from public.events where event_type = 'cta_clicked' and created_at >= p_from and created_at < p_to) as cta_clicks,
      (select round(avg(overall_percent)::numeric, 1) from public.assessment_results where calculated_at >= p_from and calculated_at < p_to) as average_score
  )
  select jsonb_build_object(
    'leads', counts.leads,
    'page_views', counts.page_views,
    'started', counts.started,
    'captured', counts.captured,
    'completed', counts.completed,
    'viewed', counts.viewed,
    'cta_clicks', counts.cta_clicks,
    'conversion_rate', case when counts.started = 0 then 0 else round((counts.completed::numeric / counts.started) * 100, 1) end,
    'average_score', counts.average_score,
    'leads_by_day', coalesce((
      select jsonb_agg(jsonb_build_object('date', day, 'count', cnt) order by day)
      from (
        select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*)::int as cnt
        from public.leads
        where created_at >= p_from and created_at < p_to
        group by 1
      ) days
    ), '[]'::jsonb),
    'completion_by_day', coalesce((
      select jsonb_agg(jsonb_build_object('date', day, 'started', started, 'completed', completed) order by day)
      from (
        select
          to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
          count(*) filter (where event_type = 'assessment_started')::int as started,
          count(*) filter (where event_type = 'assessment_completed')::int as completed
        from public.events
        where created_at >= p_from and created_at < p_to
          and event_type in ('assessment_started', 'assessment_completed')
        group by 1
      ) days
    ), '[]'::jsonb),
    'score_by_day', coalesce((
      select jsonb_agg(jsonb_build_object('date', day, 'average', average) order by day)
      from (
        select
          to_char(date_trunc('day', calculated_at), 'YYYY-MM-DD') as day,
          round(avg(overall_percent)::numeric, 1) as average
        from public.assessment_results
        where calculated_at >= p_from and calculated_at < p_to
        group by 1
      ) days
    ), '[]'::jsonb),
    'result_distribution', coalesce((
      select jsonb_agg(jsonb_build_object('label', label, 'count', cnt) order by cnt desc)
      from (
        select coalesce(rr.label, 'Non classé') as label, count(*)::int as cnt
        from public.assessment_results ar
        left join public.result_ranges rr on rr.id = ar.result_range_id
        where ar.calculated_at >= p_from and ar.calculated_at < p_to
        group by 1
      ) buckets
    ), '[]'::jsonb),
    'top_scorecards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'leads', leads, 'completed', completed
      ) order by leads desc, name)
      from (
        select
          sc.id,
          sc.name,
          (select count(*)::int from public.leads l where l.scorecard_id = sc.id and l.created_at >= p_from and l.created_at < p_to) as leads,
          (select count(*)::int from public.events e where e.scorecard_id = sc.id and e.event_type = 'assessment_completed' and e.created_at >= p_from and e.created_at < p_to) as completed
        from public.scorecards sc
        where public.is_org_member(sc.organization_id)
        order by 3 desc, sc.name
        limit 5
      ) top_rows
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('source', source, 'count', cnt) order by cnt desc)
      from (
        select coalesce(nullif(trim(source), ''), 'direct') as source, count(*)::int as cnt
        from public.leads
        where created_at >= p_from and created_at < p_to
        group by 1
      ) src
    ), '[]'::jsonb)
  )
  from counts;
$$;

revoke all on function public.bootstrap_membership() from public;
revoke all on function public.add_organization_member(text, public.org_role) from public;
revoke all on function public.remove_organization_member(uuid) from public;
revoke all on function public.anonymize_lead(uuid) from public;
revoke all on function public.duplicate_scorecard(uuid) from public;
revoke all on function public.dashboard_overview(timestamptz, timestamptz) from public;

grant execute on function public.bootstrap_membership() to authenticated;
grant execute on function public.add_organization_member(text, public.org_role) to authenticated;
grant execute on function public.remove_organization_member(uuid) to authenticated;
grant execute on function public.anonymize_lead(uuid) to authenticated;
grant execute on function public.duplicate_scorecard(uuid) to authenticated;
grant execute on function public.dashboard_overview(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- Les visiteurs anonymes lisent uniquement le contenu publié.
-- Les écritures publiques (sessions, réponses) arriveront par RPC en phase 3.
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.scorecards enable row level security;
alter table public.scorecard_pages enable row level security;
alter table public.scorecard_lead_forms enable row level security;
alter table public.question_categories enable row level security;
alter table public.scoring_categories enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.scoring_rules enable row level security;
alter table public.result_ranges enable row level security;
alter table public.result_recommendations enable row level security;
alter table public.templates enable row level security;
alter table public.respondents enable row level security;
alter table public.assessment_sessions enable row level security;
alter table public.responses enable row level security;
alter table public.assessment_results enable row level security;
alter table public.category_scores enable row level security;
alter table public.leads enable row level security;
alter table public.events enable row level security;
alter table public.utm_tracking enable row level security;
alter table public.cta_clicks enable row level security;

create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

create policy organizations_update on public.organizations
  for update to authenticated
  using (public.has_org_role(id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(id, array['owner', 'admin']::public.org_role[]));

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_organization(id));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy organization_members_select on public.organization_members
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy scorecards_select on public.scorecards
  for select
  using (status = 'published' or public.is_org_member(organization_id));

create policy scorecards_insert on public.scorecards
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

create policy scorecards_update on public.scorecards
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

create policy scorecards_delete on public.scorecards
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

create policy scorecard_pages_select on public.scorecard_pages
  for select
  using (
    exists (
      select 1 from public.scorecards s
      where s.id = scorecard_id
        and (s.status = 'published' or public.is_org_member(s.organization_id))
    )
  );

create policy scorecard_pages_write on public.scorecard_pages
  for all to authenticated
  using (public.can_edit_scorecard(scorecard_id))
  with check (public.can_edit_scorecard(scorecard_id));

create policy scorecard_lead_forms_select on public.scorecard_lead_forms
  for select
  using (
    exists (
      select 1 from public.scorecards s
      where s.id = scorecard_id
        and (s.status = 'published' or public.is_org_member(s.organization_id))
    )
  );

create policy scorecard_lead_forms_write on public.scorecard_lead_forms
  for all to authenticated
  using (public.can_edit_scorecard(scorecard_id))
  with check (public.can_edit_scorecard(scorecard_id));

create policy question_categories_select on public.question_categories
  for select
  using (
    exists (
      select 1 from public.scorecards s
      where s.id = scorecard_id
        and (s.status = 'published' or public.is_org_member(s.organization_id))
    )
  );

create policy question_categories_write on public.question_categories
  for all to authenticated
  using (public.can_edit_scorecard(scorecard_id))
  with check (public.can_edit_scorecard(scorecard_id));

create policy scoring_categories_select on public.scoring_categories
  for select
  using (
    exists (
      select 1 from public.scorecards s
      where s.id = scorecard_id
        and (s.status = 'published' or public.is_org_member(s.organization_id))
    )
  );

create policy scoring_categories_write on public.scoring_categories
  for all to authenticated
  using (public.can_edit_scorecard(scorecard_id))
  with check (public.can_edit_scorecard(scorecard_id));

create policy questions_select on public.questions
  for select
  using (
    exists (
      select 1 from public.scorecards s
      where s.id = scorecard_id
        and (s.status = 'published' or public.is_org_member(s.organization_id))
    )
  );

create policy questions_write on public.questions
  for all to authenticated
  using (public.can_edit_scorecard(scorecard_id))
  with check (public.can_edit_scorecard(scorecard_id));

create policy question_options_select on public.question_options
  for select
  using (
    exists (
      select 1
      from public.questions q
      join public.scorecards s on s.id = q.scorecard_id
      where q.id = question_id
        and (s.status = 'published' or public.is_org_member(s.organization_id))
    )
  );

create policy question_options_write on public.question_options
  for all to authenticated
  using (
    exists (
      select 1 from public.questions q
      where q.id = question_id and public.can_edit_scorecard(q.scorecard_id)
    )
  )
  with check (
    exists (
      select 1 from public.questions q
      where q.id = question_id and public.can_edit_scorecard(q.scorecard_id)
    )
  );

create policy scoring_rules_select on public.scoring_rules
  for select to authenticated
  using (
    exists (
      select 1 from public.scorecards s
      where s.id = scorecard_id and public.is_org_member(s.organization_id)
    )
  );

create policy scoring_rules_write on public.scoring_rules
  for all to authenticated
  using (public.can_edit_scorecard(scorecard_id))
  with check (public.can_edit_scorecard(scorecard_id));

create policy result_ranges_select on public.result_ranges
  for select
  using (
    exists (
      select 1 from public.scorecards s
      where s.id = scorecard_id
        and (s.status = 'published' or public.is_org_member(s.organization_id))
    )
  );

create policy result_ranges_write on public.result_ranges
  for all to authenticated
  using (public.can_edit_scorecard(scorecard_id))
  with check (public.can_edit_scorecard(scorecard_id));

create policy result_recommendations_select on public.result_recommendations
  for select
  using (
    exists (
      select 1
      from public.result_ranges rr
      join public.scorecards s on s.id = rr.scorecard_id
      where rr.id = result_range_id
        and (s.status = 'published' or public.is_org_member(s.organization_id))
    )
  );

create policy result_recommendations_write on public.result_recommendations
  for all to authenticated
  using (
    exists (
      select 1
      from public.result_ranges rr
      where rr.id = result_range_id and public.can_edit_scorecard(rr.scorecard_id)
    )
  )
  with check (
    exists (
      select 1
      from public.result_ranges rr
      where rr.id = result_range_id and public.can_edit_scorecard(rr.scorecard_id)
    )
  );

create policy templates_select on public.templates
  for select to authenticated
  using (
    is_system
    or (organization_id is not null and public.is_org_member(organization_id))
  );

create policy respondents_select on public.respondents
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy respondents_write on public.respondents
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

create policy assessment_sessions_select on public.assessment_sessions
  for select to authenticated
  using (
    exists (
      select 1 from public.scorecards s
      where s.id = scorecard_id and public.is_org_member(s.organization_id)
    )
  );

create policy responses_select on public.responses
  for select to authenticated
  using (
    exists (
      select 1
      from public.assessment_sessions sess
      join public.scorecards s on s.id = sess.scorecard_id
      where sess.id = session_id and public.is_org_member(s.organization_id)
    )
  );

create policy assessment_results_select on public.assessment_results
  for select to authenticated
  using (
    exists (
      select 1
      from public.assessment_sessions sess
      join public.scorecards s on s.id = sess.scorecard_id
      where sess.id = session_id and public.is_org_member(s.organization_id)
    )
  );

create policy category_scores_select on public.category_scores
  for select to authenticated
  using (
    exists (
      select 1
      from public.assessment_results ar
      join public.assessment_sessions sess on sess.id = ar.session_id
      join public.scorecards s on s.id = sess.scorecard_id
      where ar.id = result_id and public.is_org_member(s.organization_id)
    )
  );

create policy leads_select on public.leads
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy leads_delete on public.leads
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

create policy leads_update on public.leads
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

create policy events_select on public.events
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy utm_tracking_select on public.utm_tracking
  for select to authenticated
  using (
    exists (
      select 1
      from public.assessment_sessions sess
      join public.scorecards s on s.id = sess.scorecard_id
      where sess.id = session_id and public.is_org_member(s.organization_id)
    )
  );

create policy cta_clicks_select on public.cta_clicks
  for select to authenticated
  using (
    exists (
      select 1
      from public.assessment_sessions sess
      join public.scorecards s on s.id = sess.scorecard_id
      where sess.id = session_id and public.is_org_member(s.organization_id)
    )
  );

revoke all on public.scorecard_stats from public, anon, authenticated;
grant select on public.scorecard_stats to authenticated;

grant select on public.scorecards, public.scorecard_pages, public.questions, public.question_options,
  public.question_categories, public.scoring_categories, public.result_ranges, public.result_recommendations
  to anon;

grant select, insert, update, delete on all tables in schema public to authenticated;

revoke insert, update, delete, truncate on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scorecard-assets',
  'scorecard-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy scorecard_assets_read on storage.objects
  for select to public
  using (bucket_id = 'scorecard-assets');

create policy scorecard_assets_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'scorecard-assets'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

create policy scorecard_assets_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'scorecard-assets'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

create policy scorecard_assets_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'scorecard-assets'
    and public.has_org_role(
      ((storage.foldername(name))[1])::uuid,
      array['owner', 'admin']::public.org_role[]
    )
  );

-- ---------------------------------------------------------------------------
-- Données initiales
-- ---------------------------------------------------------------------------

insert into public.organizations (id, name, slug, primary_color, secondary_color)
values (
  '00000000-0000-4000-8000-000000000001',
  'WOLOYEM',
  'woloyem',
  '#16324F',
  '#C4A15A'
)
on conflict (slug) do nothing;

insert into public.templates (key, name, description, category, objective, is_system)
values
  (
    'pmp-eligibility',
    'Éligibilité PMP®',
    'Première lecture du profil pour préparer une demande PMP® : études, expérience et objectifs.',
    'PMP',
    'Indiquer si le profil semble correspondre aux critères à vérifier avant une candidature PMI®.',
    true
  ),
  (
    'pmp-readiness',
    'Préparation PMP®',
    'Évalue People, Process, Business Environment, Agile, Hybrid et Predictive.',
    'PMP',
    'Situer le niveau de préparation à l''examen PMP®.',
    true
  ),
  (
    'capm-readiness',
    'Préparation CAPM®',
    'Mesure les bases de la gestion de projet avant une préparation CAPM®.',
    'CAPM',
    'Orienter vers la formation CAPM® adaptée.',
    true
  ),
  (
    'itil-foundation',
    'ITIL® Foundation',
    'Estime la familiarité avec les pratiques ITIL® et la gestion des services.',
    'ITIL',
    'Qualifier l''intérêt pour ITIL® Foundation.',
    true
  ),
  (
    'prince2',
    'PRINCE2®',
    'Évalue la compréhension des principes, thèmes et processus PRINCE2®.',
    'PRINCE2',
    'Recommander un parcours PRINCE2®.',
    true
  ),
  (
    'pm-skills',
    'Compétences en gestion de projet',
    'Diagnostic transverse des pratiques de pilotage, des parties prenantes et de la livraison.',
    'Gestion de projet',
    'Qualifier le niveau et la formation WOLOYEM la plus pertinente.',
    true
  ),
  (
    'business-case',
    'Business Case',
    'Évalue la capacité à construire et défendre un business case.',
    'Business Case',
    'Orienter vers un atelier ou une formation Business Case.',
    true
  )
on conflict (key) do nothing;
