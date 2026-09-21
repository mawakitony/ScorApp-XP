-- Parcours visiteur. Les écritures publiques passent par des fonctions
-- réservées au rôle serveur. Les visiteurs anonymes ne lisent plus les barèmes.

alter table public.assessment_sessions
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists expires_at timestamptz,
  add column if not exists client_hash text;

update public.assessment_sessions
set expires_at = started_at + interval '30 days'
where expires_at is null;

alter table public.assessment_sessions
  alter column expires_at set default (now() + interval '30 days'),
  alter column expires_at set not null;

alter table public.assessment_sessions
  drop constraint if exists assessment_sessions_completed_ck;

alter table public.assessment_sessions
  add constraint assessment_sessions_completed_ck check (
    (status = 'completed' and completed_at is not null)
    or status <> 'completed'
  );

alter table public.respondents
  add column if not exists consent_given boolean not null default false,
  add column if not exists consent_text text,
  add column if not exists phone_normalized text,
  add column if not exists whatsapp_normalized text;

alter table public.responses
  drop constraint if exists responses_value_text_len;

alter table public.responses
  add constraint responses_value_text_len check (value_text is null or char_length(value_text) <= 5000);

create index if not exists assessment_sessions_status_idx on public.assessment_sessions (status);
create index if not exists assessment_sessions_client_idx on public.assessment_sessions (client_hash, created_at desc);
create index if not exists responses_question_idx on public.responses (question_id);
create index if not exists events_type_created_idx on public.events (event_type, created_at desc);

create unique index if not exists leads_session_uidx
  on public.leads (session_id)
  where session_id is not null;

create unique index if not exists respondents_org_email_uidx
  on public.respondents (organization_id, lower(email))
  where email is not null and length(trim(email)) > 0;

create unique index if not exists events_started_once_idx
  on public.events (session_id)
  where event_type = 'assessment_started' and session_id is not null;

create unique index if not exists events_completed_once_idx
  on public.events (session_id)
  where event_type = 'assessment_completed' and session_id is not null;

create unique index if not exists events_lead_once_idx
  on public.events (session_id)
  where event_type = 'lead_submitted' and session_id is not null;

create unique index if not exists events_lead_form_once_idx
  on public.events (session_id)
  where event_type = 'lead_form_viewed' and session_id is not null;

-- ---------------------------------------------------------------------------
-- Lecture publique restreinte aux pages. Les points restent côté serveur.
-- ---------------------------------------------------------------------------

revoke select on public.questions from anon;
revoke select on public.question_options from anon;
revoke select on public.question_categories from anon;
revoke select on public.scoring_categories from anon;
revoke select on public.scoring_rules from anon;
revoke select on public.result_ranges from anon;
revoke select on public.result_recommendations from anon;
revoke select on public.scorecard_lead_forms from anon;

drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions
  for select to authenticated
  using (
    exists (
      select 1 from public.scorecards s
      where s.id = scorecard_id and public.is_org_member(s.organization_id)
    )
  );

drop policy if exists question_options_select on public.question_options;
create policy question_options_select on public.question_options
  for select to authenticated
  using (
    exists (
      select 1
      from public.questions q
      join public.scorecards s on s.id = q.scorecard_id
      where q.id = question_id and public.is_org_member(s.organization_id)
    )
  );

drop policy if exists question_categories_select on public.question_categories;
create policy question_categories_select on public.question_categories
  for select to authenticated
  using (
    exists (
      select 1 from public.scorecards s
      where s.id = scorecard_id and public.is_org_member(s.organization_id)
    )
  );

drop policy if exists scoring_categories_select on public.scoring_categories;
create policy scoring_categories_select on public.scoring_categories
  for select to authenticated
  using (
    exists (
      select 1 from public.scorecards s
      where s.id = scorecard_id and public.is_org_member(s.organization_id)
    )
  );

drop policy if exists result_ranges_select on public.result_ranges;
create policy result_ranges_select on public.result_ranges
  for select to authenticated
  using (
    exists (
      select 1 from public.scorecards s
      where s.id = scorecard_id and public.is_org_member(s.organization_id)
    )
  );

drop policy if exists result_recommendations_select on public.result_recommendations;
create policy result_recommendations_select on public.result_recommendations
  for select to authenticated
  using (
    exists (
      select 1
      from public.result_ranges rr
      join public.scorecards s on s.id = rr.scorecard_id
      where rr.id = result_range_id and public.is_org_member(s.organization_id)
    )
  );

drop policy if exists scorecard_lead_forms_select on public.scorecard_lead_forms;
create policy scorecard_lead_forms_select on public.scorecard_lead_forms
  for select to authenticated
  using (
    exists (
      select 1 from public.scorecards s
      where s.id = scorecard_id and public.is_org_member(s.organization_id)
    )
  );

create or replace view public.scorecard_stats
with (security_invoker = true) as
select
  sc.id as scorecard_id,
  count(e.id) filter (where e.event_type in ('page_view', 'landing_viewed'))::integer as visitors,
  count(e.id) filter (where e.event_type = 'assessment_started')::integer as participants,
  count(e.id) filter (where e.event_type = 'assessment_completed')::integer as results
from public.scorecards sc
left join public.events e on e.scorecard_id = sc.id
where public.is_org_member(sc.organization_id)
group by sc.id;

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
      (select count(*) from public.events where event_type in ('page_view', 'landing_viewed') and created_at >= p_from and created_at < p_to) as page_views,
      (select count(*) from public.events where event_type = 'assessment_started' and created_at >= p_from and created_at < p_to) as started,
      (select count(*) from public.events where event_type in ('lead_captured', 'lead_submitted') and created_at >= p_from and created_at < p_to) as captured,
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
        select coalesce(nullif(trim(utm_source), ''), 'direct') as source, count(*)::int as cnt
        from public.utm_tracking ut
        join public.assessment_sessions sess on sess.id = ut.session_id
        join public.scorecards sc on sc.id = sess.scorecard_id
        where ut.created_at >= p_from and ut.created_at < p_to
          and public.is_org_member(sc.organization_id)
        group by 1
      ) src
    ), '[]'::jsonb)
  )
  from counts;
$$;

create or replace function public.save_session_answer(
  p_token_hash text,
  p_question_id uuid,
  p_option_ids uuid[],
  p_value_text text,
  p_value_number numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sess public.assessment_sessions%rowtype;
  q public.questions%rowtype;
  sc_status public.scorecard_status;
  expected integer;
  found_options integer;
  scale_from integer;
  scale_to integer;
begin
  select * into sess
  from public.assessment_sessions
  where anonymous_key = p_token_hash
  for update;

  if not found then
    raise exception 'session_invalid';
  end if;
  if sess.expires_at <= now() or sess.status in ('completed', 'abandoned') then
    raise exception 'session_expired';
  end if;

  select s.status into sc_status
  from public.scorecards s
  where s.id = sess.scorecard_id;
  if sc_status is null or sc_status not in ('published', 'paused') then
    raise exception 'session_invalid';
  end if;

  select * into q
  from public.questions
  where id = p_question_id and scorecard_id = sess.scorecard_id;
  if not found then
    raise exception 'question_invalid';
  end if;

  if q.type in ('single_choice', 'yes_no', 'dropdown', 'multiple_choice') then
    expected := coalesce(array_length(p_option_ids, 1), 0);
    if q.type = 'multiple_choice' and expected < 1 then
      raise exception 'answer_invalid';
    end if;
    if q.type <> 'multiple_choice' and expected <> 1 then
      raise exception 'answer_invalid';
    end if;
    select count(distinct id) into found_options
    from public.question_options
    where question_id = q.id and id = any(p_option_ids);
    if found_options <> expected then
      raise exception 'option_invalid';
    end if;
  elsif q.type in ('scale_5', 'scale_10') then
    scale_from := coalesce((q.settings ->> 'scaleFrom')::integer, 1);
    scale_to := coalesce((q.settings ->> 'scaleTo')::integer, case when q.type = 'scale_10' then 10 else 5 end);
    if p_value_number is null or p_value_number < scale_from or p_value_number > scale_to then
      raise exception 'answer_invalid';
    end if;
  elsif q.type = 'number' then
    if p_value_number is null then
      raise exception 'answer_invalid';
    end if;
  else
    if p_value_text is null or length(trim(p_value_text)) = 0 or length(p_value_text) > 5000 then
      raise exception 'answer_invalid';
    end if;
  end if;

  delete from public.responses
  where session_id = sess.id and question_id = q.id;

  if q.type in ('single_choice', 'yes_no', 'dropdown', 'multiple_choice') then
    insert into public.responses (session_id, question_id, option_id, score_awarded)
    select sess.id, q.id, option_id, 0
    from unnest(p_option_ids) as option_id;
  elsif q.type in ('scale_5', 'scale_10', 'number') then
    insert into public.responses (session_id, question_id, value_number, score_awarded)
    values (sess.id, q.id, p_value_number, 0);
  else
    insert into public.responses (session_id, question_id, value_text, score_awarded)
    values (sess.id, q.id, left(trim(p_value_text), 5000), 0);
  end if;

  update public.assessment_sessions
  set status = 'in_progress',
      last_activity_at = now(),
      current_step = q.position
  where id = sess.id;
end;
$$;

create or replace function public.commit_assessment_result(
  p_token_hash text,
  p_overall_score numeric,
  p_overall_percent numeric,
  p_range_id uuid,
  p_categories jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sess public.assessment_sessions%rowtype;
  existing_id uuid;
  new_result_id uuid;
  category jsonb;
  category_id uuid;
  index integer;
begin
  select * into sess
  from public.assessment_sessions
  where anonymous_key = p_token_hash
  for update;

  if not found then
    raise exception 'session_invalid';
  end if;

  select ar.id into existing_id
  from public.assessment_results ar
  where ar.session_id = sess.id;

  if sess.status = 'completed' or existing_id is not null then
    return jsonb_build_object('result_id', existing_id, 'created', false);
  end if;

  if sess.expires_at <= now() then
    raise exception 'session_expired';
  end if;
  if p_overall_percent < 0 or p_overall_percent > 100 or p_overall_percent is null then
    raise exception 'score_invalid';
  end if;
  if not exists (
    select 1 from public.result_ranges rr
    where rr.id = p_range_id and rr.scorecard_id = sess.scorecard_id
  ) then
    raise exception 'range_invalid';
  end if;

  insert into public.assessment_results (session_id, overall_score, overall_percent, result_range_id)
  values (sess.id, p_overall_score, p_overall_percent, p_range_id)
  returning id into new_result_id;

  if jsonb_typeof(coalesce(p_categories, '[]'::jsonb)) = 'array' then
    for index in 0 .. jsonb_array_length(coalesce(p_categories, '[]'::jsonb)) - 1 loop
      category := coalesce(p_categories, '[]'::jsonb) -> index;
      category_id := (category ->> 'scoring_category_id')::uuid;
      if not exists (
        select 1 from public.scoring_categories sc
        where sc.id = category_id and sc.scorecard_id = sess.scorecard_id
      ) then
        raise exception 'category_invalid';
      end if;
      insert into public.category_scores (result_id, scoring_category_id, score, percent, max_score)
      values (
        new_result_id,
        category_id,
        (category ->> 'score')::numeric,
        least(100, greatest(0, (category ->> 'percent')::numeric)),
        (category ->> 'max_score')::numeric
      );
    end loop;
  end if;

  update public.assessment_sessions
  set status = 'completed',
      completed_at = now(),
      last_activity_at = now()
  where id = sess.id;

  update public.leads
  set result_id = new_result_id
  where session_id = sess.id and public.leads.result_id is null;

  insert into public.events (organization_id, scorecard_id, session_id, event_type)
  select s.organization_id, s.id, sess.id, 'assessment_completed'
  from public.scorecards s
  where s.id = sess.scorecard_id
    and not exists (
      select 1 from public.events e
      where e.session_id = sess.id and e.event_type = 'assessment_completed'
    );

  return jsonb_build_object('result_id', new_result_id, 'created', true);
end;
$$;

revoke all on function public.save_session_answer(text, uuid, uuid[], text, numeric) from public, anon, authenticated;
revoke all on function public.commit_assessment_result(text, numeric, numeric, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_session_answer(text, uuid, uuid[], text, numeric) to service_role;
grant execute on function public.commit_assessment_result(text, numeric, numeric, uuid, jsonb) to service_role;
