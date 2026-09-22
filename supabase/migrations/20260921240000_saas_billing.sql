-- Plans, quotas, invitations, domains and audit.
-- WOLOYEM (slug woloyem) receives the internal plan. No Stripe checkout is required.
-- Existing organizations other than WOLOYEM stay on free, without a forced trial.
-- The first global signup no longer becomes owner of WOLOYEM.

alter table public.organizations
  add column if not exists website text not null default '',
  add column if not exists country text not null default '',
  add column if not exists timezone text not null default 'UTC',
  add column if not exists default_language text not null default 'fr',
  add column if not exists use_case text not null default '',
  add column if not exists footer_text text not null default '',
  add column if not exists favicon_url text,
  add column if not exists font_preference text not null default '',
  add column if not exists trial_used_at timestamptz,
  add column if not exists onboarding_completed_at timestamptz;

alter table public.profiles
  add column if not exists trial_used_at timestamptz;

alter table public.organization_members
  add column if not exists access_role text;

update public.organization_members
set access_role = case role
  when 'owner' then 'owner'
  when 'admin' then 'admin'
  else 'viewer'
end
where access_role is null;

alter table public.organization_members
  alter column access_role set default 'viewer',
  alter column access_role set not null;

alter table public.organization_members
  drop constraint if exists organization_members_access_role_check;

alter table public.organization_members
  add constraint organization_members_access_role_check
  check (access_role in ('owner', 'admin', 'editor', 'analyst', 'viewer', 'member'));

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  provider text not null check (provider in ('stripe', 'internal', 'manual')),
  provider_customer_id text,
  provider_subscription_id text,
  plan text not null check (plan in ('free', 'starter', 'pro', 'business', 'enterprise', 'internal')),
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly', 'yearly')),
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'paused')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_end timestamptz,
  past_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_provider_subscription_idx on public.subscriptions (provider_subscription_id);

create table public.usage_counters (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  metric text not null,
  period_start date not null,
  period_end date not null,
  value integer not null default 0 check (value >= 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, metric, period_start)
);

create table public.organization_entitlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  feature text not null,
  enabled boolean not null default true,
  limit_override integer,
  created_at timestamptz not null default now(),
  unique (organization_id, feature)
);

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'editor', 'analyst', 'viewer')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  invited_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index organization_invitations_email_idx on public.organization_invitations (email);

create table public.custom_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  domain text not null unique,
  status text not null default 'pending' check (status in ('pending', 'verified', 'failed', 'disabled')),
  verification_token text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.stripe_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);

create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

insert into public.subscriptions (organization_id, provider, plan, billing_interval, status)
select id, 'internal', 'internal', 'monthly', 'active'
from public.organizations
where slug = 'woloyem'
on conflict (organization_id) do nothing;

insert into public.subscriptions (organization_id, provider, plan, billing_interval, status)
select id, 'manual', 'free', 'monthly', 'active'
from public.organizations
where slug <> 'woloyem'
on conflict (organization_id) do nothing;

update public.organizations
set trial_used_at = coalesce(trial_used_at, now())
where slug = 'woloyem';

create or replace function public.can_edit_org_content(org_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and (m.role in ('owner', 'admin') or m.access_role = 'editor')
  );
$$;

create or replace function public.can_edit_scorecard(scorecard uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.scorecards s
    where s.id = scorecard
      and public.can_edit_org_content(s.organization_id)
  );
$$;

drop policy if exists scorecards_insert on public.scorecards;
drop policy if exists scorecards_update on public.scorecards;
drop policy if exists scorecards_delete on public.scorecards;

create policy scorecards_insert on public.scorecards
  for insert to authenticated
  with check (public.can_edit_org_content(organization_id));

create policy scorecards_update on public.scorecards
  for update to authenticated
  using (public.can_edit_org_content(organization_id))
  with check (public.can_edit_org_content(organization_id));

create policy scorecards_delete on public.scorecards
  for delete to authenticated
  using (public.can_edit_org_content(organization_id));

create or replace function public.bootstrap_membership()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_org uuid;
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

  raise exception 'organisation_required';
end;
$$;

create or replace function public.create_organization(p_name text, p_slug text, p_use_case text, p_trial_days integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  trial_days integer;
  already timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
  if exists (select 1 from public.organization_members where user_id = auth.uid()) then
    raise exception 'Organisation déjà existante';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or p_slug = 'woloyem' then
    raise exception 'Slug invalide';
  end if;
  if char_length(trim(p_name)) < 2 or char_length(trim(p_name)) > 120 then
    raise exception 'Nom invalide';
  end if;

  insert into public.organizations (name, slug, use_case)
  values (trim(p_name), p_slug, left(coalesce(p_use_case, ''), 160))
  returning id into org_id;

  insert into public.organization_members (organization_id, user_id, role, access_role)
  values (org_id, auth.uid(), 'owner', 'owner');

  select trial_used_at into already from public.profiles where id = auth.uid();
  trial_days := least(greatest(coalesce(p_trial_days, 14), 0), 30);

  if already is null and trial_days > 0 then
    update public.profiles set trial_used_at = now() where id = auth.uid();
    update public.organizations set trial_used_at = now() where id = org_id;
    insert into public.subscriptions (organization_id, provider, plan, billing_interval, status, trial_end)
    values (org_id, 'manual', 'starter', 'monthly', 'trialing', now() + make_interval(days => trial_days));
  else
    insert into public.subscriptions (organization_id, provider, plan, billing_interval, status)
    values (org_id, 'manual', 'free', 'monthly', 'active');
  end if;

  insert into public.audit_logs (organization_id, actor_id, action, metadata)
  values (org_id, auth.uid(), 'organization.created', jsonb_build_object('slug', p_slug));

  return org_id;
end;
$$;

create or replace function public.accept_organization_invitation(p_token_hash text, p_member_limit integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.organization_invitations%rowtype;
  caller_email text;
  member_count integer;
  enum_role public.org_role;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  select * into inv
  from public.organization_invitations
  where token_hash = p_token_hash
    and accepted_at is null
    and expires_at > now()
  for update;

  if inv.id is null then
    raise exception 'Invitation invalide';
  end if;

  select lower(email) into caller_email from public.profiles where id = auth.uid();
  if caller_email is null or caller_email <> lower(inv.email) then
    raise exception 'Cette invitation ne correspond pas à ce compte';
  end if;
  if exists (
    select 1 from public.organization_members
    where user_id = auth.uid() and organization_id <> inv.organization_id
  ) then
    raise exception 'Ce compte appartient déjà à une organisation';
  end if;

  select count(*) into member_count
  from public.organization_members
  where organization_id = inv.organization_id;

  if p_member_limit is not null and member_count >= p_member_limit then
    raise exception 'Limite de membres atteinte';
  end if;

  enum_role := case when inv.role = 'admin' then 'admin'::public.org_role else 'member'::public.org_role end;

  insert into public.organization_members (organization_id, user_id, role, access_role)
  values (inv.organization_id, auth.uid(), enum_role, inv.role)
  on conflict (organization_id, user_id) do update
    set role = excluded.role, access_role = excluded.access_role;

  update public.organization_invitations set accepted_at = now() where id = inv.id;

  insert into public.audit_logs (organization_id, actor_id, action, metadata)
  values (inv.organization_id, auth.uid(), 'member.accepted', jsonb_build_object('role', inv.role));

  return inv.organization_id;
end;
$$;

create or replace function public.transfer_organization_ownership(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  caller_role text;
begin
  if auth.uid() is null or p_target is null or p_target = auth.uid() then
    raise exception 'Transfert impossible';
  end if;

  select m.organization_id, m.access_role into org_id, caller_role
  from public.organization_members m
  where m.user_id = auth.uid()
  limit 1;

  if org_id is null or caller_role <> 'owner' then
    raise exception 'Permission refusée';
  end if;
  if not exists (
    select 1 from public.organization_members
    where organization_id = org_id and user_id = p_target
  ) then
    raise exception 'Membre introuvable';
  end if;

  update public.organization_members
  set role = 'owner', access_role = 'owner'
  where organization_id = org_id and user_id = p_target;

  update public.organization_members
  set role = 'admin', access_role = 'admin'
  where organization_id = org_id and user_id = auth.uid();

  insert into public.audit_logs (organization_id, actor_id, action, metadata)
  values (org_id, auth.uid(), 'ownership.transferred', jsonb_build_object('target', p_target));
end;
$$;

create or replace function public.consume_usage(
  p_org uuid,
  p_metric text,
  p_limit integer,
  p_period_start date,
  p_period_end date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value integer;
begin
  if p_org is null or p_metric is null or p_period_start is null or p_period_end is null then
    return -1;
  end if;

  insert into public.usage_counters (organization_id, metric, period_start, period_end, value)
  values (p_org, p_metric, p_period_start, p_period_end, 1)
  on conflict (organization_id, metric, period_start) do update
    set value = public.usage_counters.value + 1,
        updated_at = now()
    where p_limit is null or public.usage_counters.value < p_limit
  returning value into next_value;

  if next_value is null then
    return -1;
  end if;
  return next_value;
end;
$$;

revoke all on function public.can_edit_org_content(uuid) from public;
revoke all on function public.create_organization(text, text, text, integer) from public;
revoke all on function public.accept_organization_invitation(text, integer) from public;
revoke all on function public.transfer_organization_ownership(uuid) from public;
revoke all on function public.consume_usage(uuid, text, integer, date, date) from public, anon, authenticated;

grant execute on function public.can_edit_org_content(uuid) to authenticated;
grant execute on function public.create_organization(text, text, text, integer) to authenticated;
grant execute on function public.accept_organization_invitation(text, integer) to authenticated;
grant execute on function public.transfer_organization_ownership(uuid) to authenticated;
grant execute on function public.consume_usage(uuid, text, integer, date, date) to service_role;

alter table public.subscriptions enable row level security;
alter table public.usage_counters enable row level security;
alter table public.organization_entitlements enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.custom_domains enable row level security;
alter table public.stripe_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.platform_admins enable row level security;

create policy usage_counters_select on public.usage_counters
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy entitlements_select on public.organization_entitlements
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy invitations_select on public.organization_invitations
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

create policy domains_select on public.custom_domains
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

revoke all on public.subscriptions, public.usage_counters, public.organization_entitlements, public.organization_invitations, public.custom_domains, public.stripe_events, public.audit_logs, public.platform_admins from anon;
grant select on public.usage_counters, public.organization_entitlements to authenticated;
grant select on public.organization_invitations, public.custom_domains, public.audit_logs to authenticated;
