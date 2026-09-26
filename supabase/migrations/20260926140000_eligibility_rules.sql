-- Règles d'éligibilité. Le pourcentage officiel n'est pas réécrit pour forcer un résultat.
-- result_range_id reste le résultat affiché. matched_range_id conserve la plage du score.

alter table public.scoring_rules drop constraint if exists scoring_rules_rule_type_check;
alter table public.scoring_rules
  add constraint scoring_rules_rule_type_check
  check (rule_type in ('points', 'weight', 'cap', 'threshold', 'eligibility'));

alter table public.assessment_results
  add column if not exists matched_range_id uuid references public.result_ranges (id) on delete set null,
  add column if not exists triggered_rules jsonb not null default '[]'::jsonb;

drop function if exists public.commit_assessment_result(text, numeric, numeric, uuid, jsonb);

create or replace function public.commit_assessment_result(
  p_token_hash text,
  p_overall_score numeric,
  p_overall_percent numeric,
  p_range_id uuid,
  p_categories jsonb,
  p_matched_range_id uuid default null,
  p_triggered_rules jsonb default '[]'::jsonb
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
  if p_matched_range_id is not null and not exists (
    select 1 from public.result_ranges rr
    where rr.id = p_matched_range_id and rr.scorecard_id = sess.scorecard_id
  ) then
    raise exception 'range_invalid';
  end if;

  insert into public.assessment_results (
    session_id, overall_score, overall_percent, result_range_id, matched_range_id, triggered_rules
  ) values (
    sess.id, p_overall_score, p_overall_percent, p_range_id, p_matched_range_id, coalesce(p_triggered_rules, '[]'::jsonb)
  )
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

revoke all on function public.commit_assessment_result(text, numeric, numeric, uuid, jsonb, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.commit_assessment_result(text, numeric, numeric, uuid, jsonb, uuid, jsonb) to service_role;
