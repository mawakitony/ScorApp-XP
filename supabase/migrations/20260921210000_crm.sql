-- CRM interne. Les visiteurs n'ont aucun droit sur ces tables.
-- La température SQL reprend les seuils de lib/leads/qualification.ts : 75 et 40.

do $$ begin
  create type public.lead_status as enum ('new', 'contacted', 'qualified', 'nurturing', 'converted', 'lost');
exception
  when duplicate_object then null;
end $$;

alter table public.leads
  add column if not exists status public.lead_status not null default 'new';

create table if not exists public.lead_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  color text not null default '#16324F' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lead_tags_org_name_uidx
  on public.lead_tags (organization_id, lower(name));

create table if not exists public.lead_tag_assignments (
  lead_id uuid not null references public.leads (id) on delete cascade,
  tag_id uuid not null references public.lead_tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lead_id, tag_id)
);

create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  content text not null check (char_length(content) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('status_changed', 'tag_added', 'tag_removed', 'note_created')),
  summary text not null check (char_length(summary) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_scorecard_created_idx on public.leads (scorecard_id, created_at desc);
create index if not exists events_scorecard_type_created_idx on public.events (scorecard_id, event_type, created_at desc);
create index if not exists events_session_type_idx on public.events (session_id, event_type);
create index if not exists utm_source_idx on public.utm_tracking (utm_source);
create index if not exists utm_campaign_idx on public.utm_tracking (utm_campaign);
create index if not exists cta_clicks_created_idx on public.cta_clicks (created_at desc);
create index if not exists lead_tag_assignments_tag_idx on public.lead_tag_assignments (tag_id);
create index if not exists lead_notes_lead_idx on public.lead_notes (lead_id, created_at desc);
create index if not exists lead_activities_lead_idx on public.lead_activities (lead_id, created_at desc);

insert into public.lead_tags (organization_id, name, color)
select distinct l.organization_id, left(trim(tag), 50), '#16324F'
from public.leads l
cross join lateral unnest(l.tags) as tag
where length(trim(tag)) between 1 and 50
on conflict (organization_id, lower(name)) do nothing;

insert into public.lead_tag_assignments (lead_id, tag_id)
select l.id, t.id
from public.leads l
cross join lateral unnest(l.tags) as tag
join public.lead_tags t
  on t.organization_id = l.organization_id
 and lower(t.name) = lower(left(trim(tag), 50))
on conflict do nothing;

drop trigger if exists lead_tags_updated_at on public.lead_tags;
create trigger lead_tags_updated_at before update on public.lead_tags
  for each row execute function public.set_updated_at();

drop trigger if exists lead_notes_updated_at on public.lead_notes;
create trigger lead_notes_updated_at before update on public.lead_notes
  for each row execute function public.set_updated_at();

create or replace function public.guard_lead_tag_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_org uuid;
  tag_org uuid;
  current_count integer;
begin
  select organization_id into lead_org from public.leads where id = new.lead_id;
  select organization_id into tag_org from public.lead_tags where id = new.tag_id;
  if lead_org is null or tag_org is null or lead_org <> tag_org then
    raise exception 'tag_org_mismatch';
  end if;
  select count(*) into current_count from public.lead_tag_assignments where lead_id = new.lead_id;
  if current_count >= 20 then
    raise exception 'tag_limit';
  end if;
  return new;
end;
$$;

drop trigger if exists lead_tag_assignments_guard on public.lead_tag_assignments;
create trigger lead_tag_assignments_guard
  before insert on public.lead_tag_assignments
  for each row execute function public.guard_lead_tag_assignment();

alter table public.lead_tags enable row level security;
alter table public.lead_tag_assignments enable row level security;
alter table public.lead_notes enable row level security;
alter table public.lead_activities enable row level security;

drop policy if exists lead_tags_select on public.lead_tags;
create policy lead_tags_select on public.lead_tags
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists lead_tags_write on public.lead_tags;
create policy lead_tags_write on public.lead_tags
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

drop policy if exists lead_tag_assignments_select on public.lead_tag_assignments;
create policy lead_tag_assignments_select on public.lead_tag_assignments
  for select to authenticated
  using (
    exists (
      select 1 from public.leads l
      where l.id = lead_id and public.is_org_member(l.organization_id)
    )
  );

drop policy if exists lead_tag_assignments_write on public.lead_tag_assignments;
create policy lead_tag_assignments_write on public.lead_tag_assignments
  for all to authenticated
  using (
    exists (
      select 1 from public.leads l
      where l.id = lead_id and public.has_org_role(l.organization_id, array['owner', 'admin']::public.org_role[])
    )
  )
  with check (
    exists (
      select 1 from public.leads l
      join public.lead_tags t on t.id = tag_id
      where l.id = lead_id
        and l.organization_id = t.organization_id
        and public.has_org_role(l.organization_id, array['owner', 'admin']::public.org_role[])
    )
  );

drop policy if exists lead_notes_select on public.lead_notes;
create policy lead_notes_select on public.lead_notes
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists lead_notes_write on public.lead_notes;
create policy lead_notes_write on public.lead_notes
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

drop policy if exists lead_activities_select on public.lead_activities;
create policy lead_activities_select on public.lead_activities
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists lead_activities_insert on public.lead_activities;
create policy lead_activities_insert on public.lead_activities
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

revoke all on public.lead_tags, public.lead_tag_assignments, public.lead_notes, public.lead_activities from anon;
grant select, insert, update, delete on public.lead_tags, public.lead_tag_assignments, public.lead_notes, public.lead_activities to authenticated;

revoke all on function public.guard_lead_tag_assignment() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Liste paginée. security invoker : la RLS de l'organisation s'applique.
-- ---------------------------------------------------------------------------

create or replace function public.list_org_leads(
  p_query text default null,
  p_scorecard uuid default null,
  p_status text default null,
  p_temperature text default null,
  p_country text default null,
  p_tag uuid default null,
  p_range uuid default null,
  p_score_min numeric default null,
  p_score_max numeric default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_utm_source text default null,
  p_utm_campaign text default null,
  p_cta text default null,
  p_sort text default 'newest',
  p_limit integer default 25,
  p_offset integer default 0,
  p_ids uuid[] default null
) returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 5000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_query text := nullif(trim(coalesce(p_query, '')), '');
  v_like text := null;
  v_sort text := case
    when p_sort in ('newest', 'oldest', 'score_desc', 'score_asc', 'name', 'country') then p_sort
    else 'newest'
  end;
begin
  if p_status is not null and p_status not in ('new', 'contacted', 'qualified', 'nurturing', 'converted', 'lost') then
    return jsonb_build_object('total', 0, 'rows', '[]'::jsonb);
  end if;
  if p_temperature is not null and p_temperature not in ('cold', 'warm', 'hot') then
    return jsonb_build_object('total', 0, 'rows', '[]'::jsonb);
  end if;
  if v_query is not null then
    v_like := '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return (
    with scoped as (
      select
        l.id,
        l.status::text as status,
        l.created_at,
        trim(concat_ws(' ', r.first_name, r.last_name)) as name,
        r.first_name,
        r.last_name,
        r.email,
        r.phone,
        r.whatsapp,
        r.country,
        r.city,
        r.company,
        r.job_title,
        ar.overall_percent as score,
        rr.label as result,
        sc.name as scorecard,
        l.scorecard_id,
        coalesce(nullif(trim(ut.utm_source), ''), nullif(trim(l.source), ''), 'direct') as utm_source,
        ut.utm_medium,
        ut.utm_campaign,
        exists (select 1 from public.cta_clicks c where c.session_id = l.session_id) as cta_clicked,
        case
          when ar.overall_percent >= 75
            or exists (select 1 from public.cta_clicks c where c.session_id = l.session_id)
            then 'hot'
          when ar.overall_percent >= 40 then 'warm'
          else 'cold'
        end as temperature
      from public.leads l
      left join public.respondents r on r.id = l.respondent_id
      left join public.scorecards sc on sc.id = l.scorecard_id
      left join public.assessment_results ar on ar.id = l.result_id
      left join public.result_ranges rr on rr.id = ar.result_range_id
      left join public.utm_tracking ut on ut.session_id = l.session_id
      where public.is_org_member(l.organization_id)
        and (p_scorecard is null or l.scorecard_id = p_scorecard)
        and (p_status is null or l.status::text = p_status)
        and (p_country is null or upper(coalesce(r.country, '')) = upper(p_country))
        and (p_range is null or ar.result_range_id = p_range)
        and (p_score_min is null or ar.overall_percent >= p_score_min)
        and (p_score_max is null or ar.overall_percent <= p_score_max)
        and (p_from is null or l.created_at >= p_from)
        and (p_to is null or l.created_at < p_to)
        and (p_utm_source is null or lower(coalesce(ut.utm_source, l.source, '')) = lower(p_utm_source))
        and (p_utm_campaign is null or lower(coalesce(ut.utm_campaign, '')) = lower(p_utm_campaign))
        and (p_ids is null or l.id = any (p_ids))
        and (
          p_tag is null or exists (
            select 1 from public.lead_tag_assignments a
            where a.lead_id = l.id and a.tag_id = p_tag
          )
        )
        and (
          v_like is null
          or r.first_name ilike v_like escape '\'
          or r.last_name ilike v_like escape '\'
          or r.email ilike v_like escape '\'
          or r.phone ilike v_like escape '\'
          or r.company ilike v_like escape '\'
        )
    ),
    matched as (
      select * from scoped
      where (p_temperature is null or temperature = p_temperature)
        and (
          p_cta is null
          or (p_cta = 'clicked' and cta_clicked)
          or (p_cta = 'not_clicked' and not cta_clicked)
        )
    )
    select jsonb_build_object(
      'total', (select count(*)::int from matched),
      'rows', coalesce((
        select jsonb_agg(to_jsonb(page) order by page.ordinal)
        from (
          select
            row_number() over (
              order by
                case when v_sort = 'oldest' then created_at end asc,
                case when v_sort = 'newest' then created_at end desc,
                case when v_sort = 'score_desc' then score end desc nulls last,
                case when v_sort = 'score_asc' then score end asc nulls last,
                case when v_sort = 'name' then lower(coalesce(name, '')) end asc,
                case when v_sort = 'country' then country end asc nulls last,
                created_at desc
            ) as ordinal,
            id,
            coalesce(nullif(name, ''), '—') as name,
            first_name,
            last_name,
            email,
            phone,
            whatsapp,
            country,
            city,
            company,
            job_title,
            score,
            result,
            temperature,
            status,
            scorecard,
            scorecard_id,
            utm_source,
            utm_medium,
            utm_campaign,
            created_at,
            cta_clicked,
            coalesce((
              select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.name)
              from public.lead_tag_assignments a
              join public.lead_tags t on t.id = a.tag_id
              where a.lead_id = matched.id
            ), '[]'::jsonb) as tags
          from matched
          order by
            case when v_sort = 'oldest' then created_at end asc,
            case when v_sort = 'newest' then created_at end desc,
            case when v_sort = 'score_desc' then score end desc nulls last,
            case when v_sort = 'score_asc' then score end asc nulls last,
            case when v_sort = 'name' then lower(coalesce(name, '')) end asc,
            case when v_sort = 'country' then country end asc nulls last,
            created_at desc
          limit v_limit offset v_offset
        ) page
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.period_counts(
  p_from timestamptz,
  p_to timestamptz,
  p_scorecard uuid default null
) returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'leads', (
      select count(*)::int from public.leads l
      where l.created_at >= p_from and l.created_at < p_to
        and (p_scorecard is null or l.scorecard_id = p_scorecard)
    ),
    'new_leads', (
      select count(*)::int from public.leads l
      where l.created_at >= p_from and l.created_at < p_to
        and l.status = 'new'
        and (p_scorecard is null or l.scorecard_id = p_scorecard)
    ),
    'page_views', (
      select count(*)::int from public.events e
      where e.event_type in ('page_view', 'landing_viewed')
        and e.created_at >= p_from and e.created_at < p_to
        and (p_scorecard is null or e.scorecard_id = p_scorecard)
    ),
    'started', (
      select count(*)::int from public.events e
      where e.event_type = 'assessment_started'
        and e.created_at >= p_from and e.created_at < p_to
        and (p_scorecard is null or e.scorecard_id = p_scorecard)
    ),
    'captured', (
      select count(*)::int from public.events e
      where e.event_type in ('lead_captured', 'lead_submitted')
        and e.created_at >= p_from and e.created_at < p_to
        and (p_scorecard is null or e.scorecard_id = p_scorecard)
    ),
    'completed', (
      select count(*)::int from public.events e
      where e.event_type = 'assessment_completed'
        and e.created_at >= p_from and e.created_at < p_to
        and (p_scorecard is null or e.scorecard_id = p_scorecard)
    ),
    'viewed', (
      select count(*)::int from public.events e
      where e.event_type = 'result_viewed'
        and e.created_at >= p_from and e.created_at < p_to
        and (p_scorecard is null or e.scorecard_id = p_scorecard)
    ),
    'cta_clicks', (
      select count(*)::int from public.cta_clicks c
      join public.assessment_sessions sess on sess.id = c.session_id
      where c.created_at >= p_from and c.created_at < p_to
        and (p_scorecard is null or sess.scorecard_id = p_scorecard)
    ),
    'average_score', (
      select round(avg(ar.overall_percent)::numeric, 1)
      from public.assessment_results ar
      join public.assessment_sessions sess on sess.id = ar.session_id
      where ar.calculated_at >= p_from and ar.calculated_at < p_to
        and (p_scorecard is null or sess.scorecard_id = p_scorecard)
    ),
    'hot_leads', (
      select count(*)::int
      from public.leads l
      left join public.assessment_results ar on ar.id = l.result_id
      where l.created_at >= p_from and l.created_at < p_to
        and (p_scorecard is null or l.scorecard_id = p_scorecard)
        and (
          ar.overall_percent >= 75
          or exists (select 1 from public.cta_clicks c where c.session_id = l.session_id)
        )
    )
  );
$$;

create or replace function public.channel_stats(
  p_from timestamptz,
  p_to timestamptz,
  p_scorecard uuid,
  p_dimension text
) returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', name, 'sessions', sessions, 'leads', leads, 'completions', completions, 'cta_clicks', cta_clicks
  ) order by sessions desc, name), '[]'::jsonb)
  from (
    select
      case p_dimension
        when 'campaign' then coalesce(nullif(trim(ut.utm_campaign), ''), '—')
        when 'medium' then coalesce(nullif(trim(ut.utm_medium), ''), '—')
        else coalesce(nullif(trim(ut.utm_source), ''), 'direct')
      end as name,
      count(distinct sess.id)::int as sessions,
      count(distinct l.id)::int as leads,
      count(distinct sess.id) filter (where sess.status = 'completed')::int as completions,
      count(distinct c.id)::int as cta_clicks
    from public.utm_tracking ut
    join public.assessment_sessions sess on sess.id = ut.session_id
    join public.scorecards sc on sc.id = sess.scorecard_id
    left join public.leads l on l.session_id = sess.id
    left join public.cta_clicks c on c.session_id = sess.id and c.created_at >= p_from and c.created_at < p_to
    where ut.created_at >= p_from and ut.created_at < p_to
      and public.is_org_member(sc.organization_id)
      and (p_scorecard is null or sess.scorecard_id = p_scorecard)
    group by 1
    order by sessions desc, name
    limit 8
  ) channels;
$$;

create or replace function public.analytics_overview(
  p_from timestamptz,
  p_to timestamptz,
  p_prev_from timestamptz,
  p_prev_to timestamptz,
  p_scorecard uuid default null
) returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'current', public.period_counts(p_from, p_to, p_scorecard),
    'previous', public.period_counts(p_prev_from, p_prev_to, p_scorecard),
    'score_buckets', coalesce((
      select jsonb_agg(jsonb_build_object('label', bucket, 'count', cnt))
      from (
        select case
          when ar.overall_percent <= 20 then '0–20'
          when ar.overall_percent <= 40 then '21–40'
          when ar.overall_percent <= 60 then '41–60'
          when ar.overall_percent <= 80 then '61–80'
          else '81–100'
        end as bucket,
        count(*)::int as cnt
        from public.assessment_results ar
        join public.assessment_sessions sess on sess.id = ar.session_id
        where ar.calculated_at >= p_from and ar.calculated_at < p_to
          and (p_scorecard is null or sess.scorecard_id = p_scorecard)
        group by 1
      ) buckets
    ), '[]'::jsonb),
    'result_distribution', coalesce((
      select jsonb_agg(jsonb_build_object('label', label, 'count', cnt) order by cnt desc, label)
      from (
        select coalesce(rr.label, 'Non classé') as label, count(*)::int as cnt
        from public.assessment_results ar
        join public.assessment_sessions sess on sess.id = ar.session_id
        left join public.result_ranges rr on rr.id = ar.result_range_id
        where ar.calculated_at >= p_from and ar.calculated_at < p_to
          and (p_scorecard is null or sess.scorecard_id = p_scorecard)
        group by 1
      ) ranges
    ), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'country', country, 'leads', leads, 'completions', completions,
        'average_score', average_score, 'cta_clicks', cta_clicks
      ) order by leads desc)
      from (
        select
          coalesce(nullif(upper(r.country), ''), '—') as country,
          count(distinct l.id)::int as leads,
          count(distinct sess.id) filter (where sess.status = 'completed')::int as completions,
          round(avg(ar.overall_percent)::numeric, 1) as average_score,
          coalesce(sum(cta.clicks), 0)::int as cta_clicks
        from public.leads l
        left join public.respondents r on r.id = l.respondent_id
        left join public.assessment_sessions sess on sess.id = l.session_id
        left join public.assessment_results ar on ar.id = l.result_id
        left join lateral (
          select count(*)::int as clicks
          from public.cta_clicks c
          where c.session_id = l.session_id
            and c.created_at >= p_from and c.created_at < p_to
        ) cta on true
        where l.created_at >= p_from and l.created_at < p_to
          and (p_scorecard is null or l.scorecard_id = p_scorecard)
        group by 1
        order by leads desc
        limit 8
      ) countries
    ), '[]'::jsonb),
    'sources', public.channel_stats(p_from, p_to, p_scorecard, 'source'),
    'campaigns', public.channel_stats(p_from, p_to, p_scorecard, 'campaign'),
    'mediums', public.channel_stats(p_from, p_to, p_scorecard, 'medium'),
    'scorecards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'views', views, 'starts', starts, 'leads', leads,
        'completed', completed, 'average_score', average_score, 'cta_clicks', cta_clicks
      ) order by leads desc, name)
      from (
        select
          sc.id,
          sc.name,
          (select count(*)::int from public.events e where e.scorecard_id = sc.id and e.event_type in ('page_view', 'landing_viewed') and e.created_at >= p_from and e.created_at < p_to) as views,
          (select count(*)::int from public.events e where e.scorecard_id = sc.id and e.event_type = 'assessment_started' and e.created_at >= p_from and e.created_at < p_to) as starts,
          (select count(*)::int from public.leads l where l.scorecard_id = sc.id and l.created_at >= p_from and l.created_at < p_to) as leads,
          (select count(*)::int from public.events e where e.scorecard_id = sc.id and e.event_type = 'assessment_completed' and e.created_at >= p_from and e.created_at < p_to) as completed,
          (select round(avg(ar.overall_percent)::numeric, 1)
            from public.assessment_results ar
            join public.assessment_sessions sess on sess.id = ar.session_id
            where sess.scorecard_id = sc.id and ar.calculated_at >= p_from and ar.calculated_at < p_to) as average_score,
          (select count(*)::int
            from public.cta_clicks c
            join public.assessment_sessions sess on sess.id = c.session_id
            where sess.scorecard_id = sc.id and c.created_at >= p_from and c.created_at < p_to) as cta_clicks
        from public.scorecards sc
        where public.is_org_member(sc.organization_id)
          and (p_scorecard is null or sc.id = p_scorecard)
      ) cards
    ), '[]'::jsonb),
    'cta_ranges', coalesce((
      select jsonb_agg(jsonb_build_object('label', label, 'count', cnt) order by cnt desc)
      from (
        select coalesce(rr.label, 'Non classé') as label, count(*)::int as cnt
        from public.cta_clicks c
        join public.assessment_sessions sess on sess.id = c.session_id
        left join public.assessment_results ar on ar.session_id = sess.id
        left join public.result_ranges rr on rr.id = ar.result_range_id
        where c.created_at >= p_from and c.created_at < p_to
          and (p_scorecard is null or sess.scorecard_id = p_scorecard)
        group by 1
      ) ranges
    ), '[]'::jsonb),
    'cta_destinations', coalesce((
      select jsonb_agg(jsonb_build_object('url', url, 'count', cnt) order by cnt desc)
      from (
        select c.url, count(*)::int as cnt
        from public.cta_clicks c
        join public.assessment_sessions sess on sess.id = c.session_id
        where c.created_at >= p_from and c.created_at < p_to
          and (p_scorecard is null or sess.scorecard_id = p_scorecard)
        group by c.url
        order by cnt desc
        limit 8
      ) urls
    ), '[]'::jsonb),
    'hot_leads', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'score', score, 'scorecard', scorecard,
        'country', country, 'cta_clicked', cta_clicked, 'created_at', created_at
      ) order by created_at desc)
      from (
        select
          l.id,
          coalesce(nullif(trim(concat_ws(' ', r.first_name, r.last_name)), ''), '—') as name,
          ar.overall_percent as score,
          sc.name as scorecard,
          r.country,
          exists (select 1 from public.cta_clicks c where c.session_id = l.session_id) as cta_clicked,
          l.created_at
        from public.leads l
        left join public.respondents r on r.id = l.respondent_id
        left join public.scorecards sc on sc.id = l.scorecard_id
        left join public.assessment_results ar on ar.id = l.result_id
        where l.created_at >= p_from and l.created_at < p_to
          and (p_scorecard is null or l.scorecard_id = p_scorecard)
          and (
            ar.overall_percent >= 75
            or exists (select 1 from public.cta_clicks c where c.session_id = l.session_id)
          )
        order by l.created_at desc
        limit 8
      ) hot
    ), '[]'::jsonb),
    'completion', (
      select jsonb_build_object(
        'median_seconds', percentile_cont(0.5) within group (order by secs),
        'average_seconds', round(avg(secs)::numeric, 1),
        'sample', count(*)::int
      )
      from (
        select extract(epoch from (sess.completed_at - sess.started_at)) as secs
        from public.assessment_sessions sess
        where sess.status = 'completed'
          and sess.completed_at is not null
          and sess.completed_at >= p_from and sess.completed_at < p_to
          and (p_scorecard is null or sess.scorecard_id = p_scorecard)
          and extract(epoch from (sess.completed_at - sess.started_at)) between 0 and 86400
      ) durations
    )
  );
$$;

create or replace function public.scorecard_question_stats(
  p_scorecard uuid,
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'started', (
      select count(*)::int from public.assessment_sessions sess
      where sess.scorecard_id = p_scorecard
        and sess.started_at >= p_from and sess.started_at < p_to
    ),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'title', q.title,
        'type', q.type,
        'position', q.position,
        'answered', (
          select count(distinct r.session_id)::int
          from public.responses r
          join public.assessment_sessions sess on sess.id = r.session_id
          where r.question_id = q.id
            and sess.started_at >= p_from and sess.started_at < p_to
        ),
        'options', case
          when q.type in ('single_choice', 'multiple_choice', 'yes_no', 'dropdown') then coalesce((
            select jsonb_agg(jsonb_build_object(
              'label', o.label,
              'count', (
                select count(*)::int
                from public.responses r
                join public.assessment_sessions sess on sess.id = r.session_id
                where r.option_id = o.id
                  and sess.started_at >= p_from and sess.started_at < p_to
              )
            ) order by o.position)
            from public.question_options o
            where o.question_id = q.id
          ), '[]'::jsonb)
          when q.type in ('scale_5', 'scale_10') then coalesce((
            select jsonb_agg(jsonb_build_object('label', label, 'count', cnt) order by label)
            from (
              select r.value_number::text as label, count(*)::int as cnt
              from public.responses r
              join public.assessment_sessions sess on sess.id = r.session_id
              where r.question_id = q.id
                and sess.started_at >= p_from and sess.started_at < p_to
                and r.value_number is not null
              group by r.value_number
            ) scales
          ), '[]'::jsonb)
          else '[]'::jsonb
        end
      ) order by q.position)
      from public.questions q
      join public.scorecards sc on sc.id = q.scorecard_id
      where q.scorecard_id = p_scorecard
        and public.is_org_member(sc.organization_id)
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.list_org_leads(text, uuid, text, text, text, uuid, uuid, numeric, numeric, timestamptz, timestamptz, text, text, text, text, integer, integer, uuid[]) from public, anon;
revoke all on function public.period_counts(timestamptz, timestamptz, uuid) from public, anon;
revoke all on function public.analytics_overview(timestamptz, timestamptz, timestamptz, timestamptz, uuid) from public, anon;
revoke all on function public.channel_stats(timestamptz, timestamptz, uuid, text) from public, anon;
revoke all on function public.scorecard_question_stats(uuid, timestamptz, timestamptz) from public, anon;

grant execute on function public.list_org_leads(text, uuid, text, text, text, uuid, uuid, numeric, numeric, timestamptz, timestamptz, text, text, text, text, integer, integer, uuid[]) to authenticated;
grant execute on function public.period_counts(timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.analytics_overview(timestamptz, timestamptz, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.channel_stats(timestamptz, timestamptz, uuid, text) to authenticated;
grant execute on function public.scorecard_question_stats(uuid, timestamptz, timestamptz) to authenticated;
