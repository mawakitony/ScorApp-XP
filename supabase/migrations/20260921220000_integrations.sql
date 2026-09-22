-- Intégrations, file d'attente, conversions et notifications.
-- Les credentials chiffrés ne sont lisibles que par le service role.

create type public.integration_provider as enum ('webhook', 'brevo', 'hubspot', 'whatsapp', 'zapier', 'make', 'n8n', 'custom');
create type public.integration_status as enum ('active', 'disabled');
create type public.delivery_status as enum ('pending', 'processing', 'delivered', 'failed', 'dead');
create type public.job_status as enum ('pending', 'processing', 'completed', 'failed');
create type public.conversion_type as enum (
  'registration', 'purchase', 'booking', 'application', 'manual',
  'course_registration', 'course_purchase', 'bootcamp_registration', 'exam_booking'
);

alter table public.respondents
  add column if not exists consent_third_party boolean not null default false;

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider public.integration_provider not null,
  name text not null check (char_length(name) between 2 and 80),
  status public.integration_status not null default 'active',
  config jsonb not null default '{}'::jsonb,
  encrypted_credentials text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.integration_events (
  id text primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  integration_id uuid not null references public.integrations (id) on delete cascade,
  event_type text not null,
  event_id text not null,
  payload jsonb not null,
  attempt integer not null default 0,
  status public.delivery_status not null default 'pending',
  http_status integer,
  response_excerpt text,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (integration_id, event_id)
);

create table public.integration_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  delivery_id uuid references public.webhook_deliveries (id) on delete cascade,
  kind text not null check (kind in ('webhook', 'automation', 'brevo')),
  payload jsonb not null,
  status public.job_status not null default 'pending',
  attempts integer not null default 0,
  next_run_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  enabled boolean not null default true,
  trigger text not null,
  conditions jsonb not null default '[]'::jsonb,
  action_type text not null check (action_type in ('add_tag', 'change_status', 'send_webhook', 'send_brevo_event')),
  action_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  rule_id uuid not null references public.automation_rules (id) on delete cascade,
  event_id text not null,
  status text not null check (status in ('completed', 'skipped', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error text,
  unique (rule_id, event_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index notifications_dedupe_uidx on public.notifications (organization_id, dedupe_key) where dedupe_key is not null;

create table public.conversions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  scorecard_id uuid references public.scorecards (id) on delete set null,
  session_id uuid references public.assessment_sessions (id) on delete set null,
  conversion_type public.conversion_type not null,
  conversion_value numeric(12, 2),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  external_reference text,
  metadata jsonb not null default '{}'::jsonb,
  converted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index conversions_reference_uidx on public.conversions (organization_id, external_reference) where external_reference is not null;

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.api_key_requests (
  id bigint generated always as identity primary key,
  api_key_id uuid not null references public.api_keys (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index integrations_org_idx on public.integrations (organization_id, created_at desc);
create index deliveries_org_idx on public.webhook_deliveries (organization_id, created_at desc);
create index jobs_pending_idx on public.integration_jobs (status, next_run_at);
create index automation_rules_org_idx on public.automation_rules (organization_id, enabled);
create index conversions_org_idx on public.conversions (organization_id, converted_at desc);
create index notifications_org_idx on public.notifications (organization_id, created_at desc);
create index api_key_requests_idx on public.api_key_requests (api_key_id, created_at desc);

alter table public.integrations enable row level security;
alter table public.integration_events enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.integration_jobs enable row level security;
alter table public.automation_rules enable row level security;
alter table public.automation_runs enable row level security;
alter table public.notifications enable row level security;
alter table public.conversions enable row level security;
alter table public.api_keys enable row level security;
alter table public.api_key_requests enable row level security;

create policy integrations_select on public.integrations for select to authenticated using (public.is_org_member(organization_id));
create policy integrations_write on public.integrations for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

create policy integration_events_select on public.integration_events for select to authenticated using (public.is_org_member(organization_id));
create policy deliveries_select on public.webhook_deliveries for select to authenticated using (public.is_org_member(organization_id));
create policy jobs_select on public.integration_jobs for select to authenticated using (public.is_org_member(organization_id));
create policy rules_select on public.automation_rules for select to authenticated using (public.is_org_member(organization_id));
create policy rules_write on public.automation_rules for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));
create policy runs_select on public.automation_runs for select to authenticated using (public.is_org_member(organization_id));
create policy notifications_select on public.notifications for select to authenticated using (public.is_org_member(organization_id));
create policy notifications_update on public.notifications for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy conversions_select on public.conversions for select to authenticated using (public.is_org_member(organization_id));
create policy conversions_write on public.conversions for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));
create policy api_keys_all on public.api_keys for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

revoke all on public.integrations, public.integration_events, public.webhook_deliveries, public.integration_jobs,
  public.automation_rules, public.automation_runs, public.notifications, public.conversions, public.api_keys, public.api_key_requests
  from anon;
grant select, insert, update, delete on public.integrations, public.integration_events, public.webhook_deliveries, public.integration_jobs,
  public.automation_rules, public.automation_runs, public.notifications, public.conversions, public.api_keys
  to authenticated;
revoke select (encrypted_credentials) on public.integrations from authenticated, anon;
grant select, insert, update, delete on public.integrations to service_role;
grant select (encrypted_credentials) on public.integrations to service_role;

create or replace function public.claim_integration_jobs(p_limit integer)
returns setof public.integration_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.integration_jobs
  set status = 'pending', locked_at = null
  where status = 'processing' and locked_at < now() - interval '10 minutes';

  return query
  with picked as (
    select id
    from public.integration_jobs
    where status = 'pending' and next_run_at <= now()
    order by next_run_at
    limit least(greatest(coalesce(p_limit, 50), 1), 50)
    for update skip locked
  )
  update public.integration_jobs job
  set status = 'processing', locked_at = now(), attempts = job.attempts + 1
  from picked
  where job.id = picked.id
  returning job.*;
end;
$$;

revoke all on function public.claim_integration_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_integration_jobs(integer) to service_role;
