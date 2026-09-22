-- Rapports, partages et file PDF/IA.
-- Le score officiel reste dans assessment_results. Le snapshot fige l'explication.
-- Bucket assessment-reports : privé. Accès par route serveur ou URL signée de 15 minutes.
-- Aucune policy publique. Le service role dépose le fichier.
-- La suppression d'un lead ou d'un résultat emporte ses rapports (ON DELETE CASCADE).
-- Les anciens PDF ne sont pas purgés dans cette phase.

alter table public.organizations
  add column if not exists report_settings jsonb not null default '{"brandName":"WOLOYEM","website":"","email":"","footer":"","aiMode":"disabled"}'::jsonb;

alter table public.scorecards
  add column if not exists report_config jsonb not null default '{"enabled":true,"pdf":true,"categories":true,"strengths":true,"improvements":true,"cta":true,"disclaimer":true,"aiMode":"disabled"}'::jsonb;

alter table public.scoring_categories
  add column if not exists high_message text not null default '',
  add column if not exists medium_message text not null default '',
  add column if not exists low_message text not null default '';

create table public.report_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  scorecard_id uuid not null references public.scorecards (id) on delete cascade,
  scoring_category_id uuid references public.scoring_categories (id) on delete cascade,
  operator text not null check (operator in ('lt', 'lte', 'gte')),
  threshold numeric(5, 2) not null,
  message text not null check (char_length(message) between 2 and 500),
  created_at timestamptz not null default now()
);

create table public.assessment_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  assessment_result_id uuid not null references public.assessment_results (id) on delete cascade,
  session_id uuid not null references public.assessment_sessions (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  scorecard_id uuid references public.scorecards (id) on delete set null,
  report_type text not null check (report_type in ('participant', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'generating', 'ready', 'failed')),
  version integer not null check (version >= 1),
  snapshot jsonb not null default '{}'::jsonb,
  ai_status text not null default 'not_requested' check (ai_status in ('not_requested', 'pending', 'completed', 'failed')),
  ai_provider text,
  ai_model text,
  ai_prompt_version text,
  ai_output jsonb,
  storage_path text,
  download_count integer not null default 0,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_result_id, report_type, version)
);

create table public.report_shares (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  report_id uuid not null references public.assessment_reports (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.report_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  report_id uuid references public.assessment_reports (id) on delete cascade,
  event_type text not null check (event_type in ('report.generated', 'report.downloaded', 'report.shared', 'report.email_sent', 'report.ready')),
  created_at timestamptz not null default now()
);

create table public.report_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  report_id uuid not null references public.assessment_reports (id) on delete cascade,
  kind text not null check (kind in ('pdf', 'ai', 'email')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'dead')),
  attempts integer not null default 0,
  next_run_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index assessment_reports_result_idx on public.assessment_reports (assessment_result_id);
create index assessment_reports_lead_idx on public.assessment_reports (lead_id);
create index assessment_reports_status_idx on public.assessment_reports (status);
create index assessment_reports_created_idx on public.assessment_reports (created_at desc);
create index report_shares_report_idx on public.report_shares (report_id);
create unique index report_jobs_active_uidx on public.report_jobs (report_id, kind) where status in ('pending', 'processing');
create index report_jobs_pending_idx on public.report_jobs (status, next_run_at);
create index report_events_org_idx on public.report_events (organization_id, event_type, created_at desc);

alter table public.report_rules enable row level security;
alter table public.assessment_reports enable row level security;
alter table public.report_shares enable row level security;
alter table public.report_events enable row level security;
alter table public.report_jobs enable row level security;

create policy report_rules_select on public.report_rules for select to authenticated using (public.is_org_member(organization_id));
create policy report_rules_write on public.report_rules for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));
create policy assessment_reports_select on public.assessment_reports for select to authenticated using (public.is_org_member(organization_id));
create policy report_shares_select on public.report_shares for select to authenticated using (public.is_org_member(organization_id));
create policy report_events_select on public.report_events for select to authenticated using (public.is_org_member(organization_id));
create policy report_jobs_select on public.report_jobs for select to authenticated using (public.is_org_member(organization_id));

revoke all on public.report_rules, public.assessment_reports, public.report_shares, public.report_events, public.report_jobs from anon;
grant select, insert, update, delete on public.report_rules to authenticated;
grant select on public.assessment_reports, public.report_shares, public.report_events, public.report_jobs to authenticated;

alter table public.automation_rules drop constraint if exists automation_rules_action_type_check;
alter table public.automation_rules add constraint automation_rules_action_type_check
  check (action_type in (
    'add_tag', 'change_status', 'send_webhook', 'send_brevo_event',
    'generate_report', 'send_report_email', 'generate_ai_analysis'
  ));

create or replace function public.claim_report_jobs(p_limit integer)
returns setof public.report_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.report_jobs
  set status = 'pending', locked_at = null
  where status = 'processing' and locked_at < now() - interval '10 minutes';

  return query
  with picked as (
    select id
    from public.report_jobs
    where status = 'pending' and next_run_at <= now()
    order by next_run_at
    limit least(greatest(coalesce(p_limit, 20), 1), 20)
    for update skip locked
  )
  update public.report_jobs job
  set status = 'processing', locked_at = now(), attempts = job.attempts + 1
  from picked
  where job.id = picked.id
  returning job.*;
end;
$$;

revoke all on function public.claim_report_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_report_jobs(integer) to service_role;

do $$
begin
  insert into storage.buckets (id, name, public)
  values ('assessment-reports', 'assessment-reports', false)
  on conflict (id) do nothing;
exception
  when undefined_table then null;
end $$;
