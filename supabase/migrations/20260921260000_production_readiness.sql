-- Production readiness. Compatible with the previous schema.
-- Apply after 20260921250000_platform_admin.sql.

alter table public.custom_domains
  add column if not exists default_scorecard_id uuid references public.scorecards (id) on delete set null,
  add column if not exists ssl_status text;

alter table public.custom_domains
  drop constraint if exists custom_domains_ssl_status_check;

alter table public.custom_domains
  add constraint custom_domains_ssl_status_check
  check (ssl_status is null or ssl_status in ('provisioning', 'active', 'error'));

alter table public.scorecards drop constraint if exists scorecards_slug_key;

create unique index if not exists scorecards_org_slug_uidx
  on public.scorecards (organization_id, slug);

create table if not exists public.email_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  template text not null,
  recipient_hash text not null,
  recipient text not null,
  locale text not null default 'fr',
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'dead')),
  attempts integer not null default 0,
  next_run_at timestamptz not null default now(),
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_jobs_pending_idx
  on public.email_jobs (status, next_run_at);

create table if not exists public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

create table if not exists public.platform_settings (
  id integer primary key default 1 check (id = 1),
  maintenance_message text,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.email_jobs enable row level security;
alter table public.rate_limits enable row level security;
alter table public.platform_settings enable row level security;

revoke all on public.email_jobs, public.rate_limits, public.platform_settings from anon, authenticated;

create or replace function public.resolve_verified_domain(p_host text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'organization_id', domains.organization_id,
    'default_slug', scorecards.slug
  )
  from public.custom_domains as domains
  left join public.scorecards as scorecards
    on scorecards.id = domains.default_scorecard_id
    and scorecards.organization_id = domains.organization_id
    and scorecards.status = 'published'
  where domains.domain = lower(p_host)
    and domains.status = 'verified'
  limit 1;
$$;

revoke all on function public.resolve_verified_domain(text) from public;
grant execute on function public.resolve_verified_domain(text) to anon, authenticated, service_role;

create or replace function public.consume_rate_limit(p_bucket text, p_window_seconds integer, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  start_at timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  current_hits integer;
begin
  if p_bucket is null or length(p_bucket) < 3 or length(p_bucket) > 160 or p_window_seconds < 1 or p_limit < 1 then
    return false;
  end if;
  insert into public.rate_limits (bucket, window_start, hits)
  values (p_bucket, start_at, 1)
  on conflict (bucket, window_start)
  do update set hits = public.rate_limits.hits + 1
  returning hits into current_hits;
  return current_hits <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
