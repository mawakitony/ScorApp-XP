-- Import de questionnaire : historique et écriture atomique.
-- Une fonction = une transaction. Une exception annule catégories, questions, options et paliers.

create table public.questionnaire_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  scorecard_id uuid not null references public.scorecards (id) on delete cascade,
  source text not null check (source in ('woloyem_excel', 'scoreapp_excel', 'scoreapp_api')),
  filename text,
  questions_count integer not null check (questions_count >= 0),
  imported_by uuid references auth.users (id),
  status text not null check (status in ('imported', 'failed')),
  created_at timestamptz not null default now()
);

create index questionnaire_imports_scorecard_idx on public.questionnaire_imports (scorecard_id, created_at desc);

alter table public.questionnaire_imports enable row level security;

create policy questionnaire_imports_select on public.questionnaire_imports
  for select to authenticated
  using (public.is_org_member(organization_id));

create or replace function public.import_questionnaire(
  p_scorecard_id uuid,
  p_mode text,
  p_source text,
  p_filename text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  category jsonb;
  question jsonb;
  option jsonb;
  range_row jsonb;
  question_category_id uuid;
  scoring_category_id uuid;
  new_question_id uuid;
  new_range_id uuid;
  inserted integer := 0;
  position_base integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
  if p_mode not in ('add', 'replace') then
    raise exception 'Mode invalide';
  end if;
  if p_source not in ('woloyem_excel', 'scoreapp_excel', 'scoreapp_api') then
    raise exception 'Source invalide';
  end if;
  if not public.can_edit_scorecard(p_scorecard_id) then
    raise exception 'Permission refusée';
  end if;

  select s.organization_id into org_id from public.scorecards s where s.id = p_scorecard_id;
  if org_id is null then
    raise exception 'Scorecard introuvable';
  end if;

  if p_mode = 'replace' then
    delete from public.questions where scorecard_id = p_scorecard_id;
    if jsonb_array_length(coalesce(p_payload -> 'ranges', '[]'::jsonb)) > 0 then
      delete from public.result_ranges where scorecard_id = p_scorecard_id;
    end if;
  else
    select coalesce(max(position), -1) + 1 into position_base from public.questions where scorecard_id = p_scorecard_id;
  end if;

  for category in select * from jsonb_array_elements(coalesce(p_payload -> 'categories', '[]'::jsonb))
  loop
    select id into question_category_id
    from public.question_categories
    where scorecard_id = p_scorecard_id and name = category ->> 'name';
    if question_category_id is null then
      insert into public.question_categories (scorecard_id, name, description, weight, position)
      values (
        p_scorecard_id,
        category ->> 'name',
        nullif(category ->> 'description', ''),
        greatest((category ->> 'weight')::numeric, 0.01),
        coalesce((category ->> 'order')::integer, 0)
      )
      returning id into question_category_id;
    else
      update public.question_categories
      set description = nullif(category ->> 'description', ''),
          weight = greatest((category ->> 'weight')::numeric, 0.01),
          position = coalesce((category ->> 'order')::integer, position)
      where id = question_category_id;
    end if;

    select id into scoring_category_id
    from public.scoring_categories
    where scorecard_id = p_scorecard_id and name = category ->> 'name';
    if scoring_category_id is null then
      insert into public.scoring_categories (
        scorecard_id, name, description, weight, max_score, position, high_message, medium_message, low_message
      ) values (
        p_scorecard_id,
        category ->> 'name',
        nullif(category ->> 'description', ''),
        least(greatest((category ->> 'weight')::numeric, 0.01), 100),
        100,
        coalesce((category ->> 'order')::integer, 0),
        coalesce(category ->> 'highMessage', ''),
        coalesce(category ->> 'mediumMessage', ''),
        coalesce(category ->> 'lowMessage', '')
      );
    else
      update public.scoring_categories
      set description = nullif(category ->> 'description', ''),
          weight = least(greatest((category ->> 'weight')::numeric, 0.01), 100),
          position = coalesce((category ->> 'order')::integer, position),
          high_message = coalesce(category ->> 'highMessage', ''),
          medium_message = coalesce(category ->> 'mediumMessage', ''),
          low_message = coalesce(category ->> 'lowMessage', '')
      where id = scoring_category_id;
    end if;
  end loop;

  for question in select * from jsonb_array_elements(coalesce(p_payload -> 'questions', '[]'::jsonb))
  loop
    select id into question_category_id
    from public.question_categories
    where scorecard_id = p_scorecard_id and name = question ->> 'category';
    select id into scoring_category_id
    from public.scoring_categories
    where scorecard_id = p_scorecard_id and name = question ->> 'category';

    insert into public.questions (
      scorecard_id, question_category_id, scoring_category_id, type, title, description,
      is_required, is_scored, position, settings
    ) values (
      p_scorecard_id,
      question_category_id,
      case when coalesce((question ->> 'isScored')::boolean, false) then scoring_category_id else null end,
      (question ->> 'type')::public.question_type,
      question ->> 'title',
      nullif(question ->> 'description', ''),
      coalesce((question ->> 'required')::boolean, true),
      coalesce((question ->> 'isScored')::boolean, false),
      position_base + coalesce((question ->> 'order')::integer, inserted + 1) - 1,
      coalesce(question -> 'settings', '{"scaleFrom":1,"scaleTo":5,"scoreFrom":0,"scoreTo":100}'::jsonb)
    )
    returning id into new_question_id;

    for option in select * from jsonb_array_elements(coalesce(question -> 'options', '[]'::jsonb))
    loop
      insert into public.question_options (question_id, label, value, score, position)
      values (
        new_question_id,
        option ->> 'label',
        nullif(option ->> 'value', ''),
        (option ->> 'score')::numeric,
        coalesce((option ->> 'position')::integer, 0)
      );
    end loop;
    inserted := inserted + 1;
  end loop;

  for range_row in select * from jsonb_array_elements(coalesce(p_payload -> 'ranges', '[]'::jsonb))
  loop
    insert into public.result_ranges (
      scorecard_id, min_percent, max_percent, label, title, description, badge, position
    ) values (
      p_scorecard_id,
      (range_row ->> 'minScore')::numeric,
      (range_row ->> 'maxScore')::numeric,
      range_row ->> 'label',
      range_row ->> 'title',
      nullif(range_row ->> 'description', ''),
      nullif(range_row ->> 'badge', ''),
      inserted
    )
    returning id into new_range_id;
    if coalesce(range_row ->> 'ctaLabel', '') <> '' or coalesce(range_row ->> 'ctaUrl', '') <> '' then
      insert into public.result_recommendations (result_range_id, title, body, cta_label, cta_url, position)
      values (
        new_range_id,
        coalesce(nullif(range_row ->> 'title', ''), 'Recommandation'),
        nullif(range_row ->> 'description', ''),
        nullif(range_row ->> 'ctaLabel', ''),
        nullif(range_row ->> 'ctaUrl', ''),
        0
      );
    end if;
  end loop;

  insert into public.questionnaire_imports (
    organization_id, scorecard_id, source, filename, questions_count, imported_by, status
  ) values (
    org_id, p_scorecard_id, p_source, nullif(p_filename, ''), inserted, auth.uid(), 'imported'
  );

  return jsonb_build_object('questions', inserted);
end;
$$;

revoke all on function public.import_questionnaire(uuid, text, text, text, jsonb) from public;
grant execute on function public.import_questionnaire(uuid, text, text, text, jsonb) to authenticated;
