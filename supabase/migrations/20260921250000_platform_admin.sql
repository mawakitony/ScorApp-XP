-- Console interne. Aucun utilisateur n'est promu platform admin ici.
-- Le premier compte se crée manuellement :
-- insert into public.platform_admins (user_id, role) values ('<profile uuid>', 'super_admin');

alter table public.platform_admins
  add column if not exists role text not null default 'support';

alter table public.platform_admins
  drop constraint if exists platform_admins_role_check;

alter table public.platform_admins
  add constraint platform_admins_role_check
  check (role in ('super_admin', 'support', 'operations', 'finance'));

create table public.support_sessions (
  id uuid primary key default gen_random_uuid(),
  platform_admin_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  reason text not null check (char_length(reason) between 20 and 500),
  status text not null default 'active' check (status in ('active', 'ended', 'expired')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz
);

create index support_sessions_admin_started_idx on public.support_sessions (platform_admin_id, started_at desc);
create index support_sessions_org_started_idx on public.support_sessions (organization_id, started_at desc);

create table public.system_heartbeats (
  name text primary key,
  last_seen_at timestamptz not null default now(),
  status text not null default 'healthy',
  metadata jsonb not null default '{}'::jsonb
);

create table public.organization_suspensions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  reason text not null check (char_length(reason) between 8 and 500),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references public.profiles (id)
);

create unique index organization_suspensions_active_uidx
  on public.organization_suspensions (organization_id)
  where lifted_at is null;

create table public.platform_alerts (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  message text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index platform_alerts_open_uidx on public.platform_alerts (code) where resolved_at is null;

create index audit_logs_action_created_idx on public.audit_logs (action, created_at desc);
create index subscriptions_status_created_idx on public.subscriptions (status, created_at desc);
create index integration_jobs_status_created_idx on public.integration_jobs (status, created_at desc);
create index report_jobs_status_created_idx on public.report_jobs (status, created_at desc);

alter table public.support_sessions enable row level security;
alter table public.system_heartbeats enable row level security;
alter table public.organization_suspensions enable row level security;
alter table public.platform_alerts enable row level security;

revoke all on public.support_sessions, public.system_heartbeats, public.organization_suspensions, public.platform_alerts from anon, authenticated;

create or replace function public.platform_overview()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'organizations', (select count(*) from public.organizations),
    'plans', coalesce((select jsonb_object_agg(plan, total) from (
      select plan, count(*) as total from public.subscriptions group by plan
    ) plans), '{}'::jsonb),
    'statuses', coalesce((select jsonb_object_agg(status, total) from (
      select status, count(*) as total from public.subscriptions group by status
    ) statuses), '{}'::jsonb),
    'trials_active', (select count(*) from public.subscriptions where status = 'trialing' and trial_end > now()),
    'trials_3d', (select count(*) from public.subscriptions where status = 'trialing' and trial_end > now() and trial_end <= now() + interval '3 days'),
    'trials_7d', (select count(*) from public.subscriptions where status = 'trialing' and trial_end > now() and trial_end <= now() + interval '7 days'),
    'trials_expired', (select count(*) from public.subscriptions where status = 'trialing' and trial_end <= now()),
    'assessments_24h', (select count(*) from public.assessment_sessions where created_at >= now() - interval '24 hours'),
    'leads_24h', (select count(*) from public.leads where created_at >= now() - interval '24 hours'),
    'conversions_24h', (select count(*) from public.conversions where created_at >= now() - interval '24 hours'),
    'jobs_failed', (
      (select count(*) from public.integration_jobs where status = 'failed')
      + (select count(*) from public.report_jobs where status = 'failed')
    ),
    'jobs_dead', (select count(*) from public.report_jobs where status = 'dead'),
    'reports_failed', (select count(*) from public.assessment_reports where status = 'failed'),
    'domains_pending', (select count(*) from public.custom_domains where status = 'pending'),
    'suspended', (select count(*) from public.organization_suspensions where lifted_at is null),
    'usage_months', coalesce((select jsonb_agg(row_to_json(months)) from (
      select period_start, metric, sum(value)::integer as value
      from public.usage_counters
      where period_start >= (date_trunc('month', now()) - interval '5 months')::date
      group by period_start, metric
      order by period_start
    ) months), '[]'::jsonb)
  );
$$;

revoke all on function public.platform_overview() from public, anon, authenticated;
grant execute on function public.platform_overview() to service_role;
