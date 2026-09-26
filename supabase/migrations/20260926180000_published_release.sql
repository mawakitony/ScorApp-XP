-- Version publiée unique, annulation du brouillon, archivage des questions et options.
-- Les réponses historiques restent liées à la question : la suppression physique est refusée.

alter table public.scorecards
  add column if not exists undo_document jsonb;

alter table public.questions
  add column if not exists archived_at timestamptz;

alter table public.question_options
  add column if not exists archived_at timestamptz;

create table if not exists public.scorecard_releases (
  scorecard_id uuid primary key references public.scorecards (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  document jsonb not null,
  published_at timestamptz not null default now()
);

alter table public.scorecard_releases enable row level security;

drop policy if exists scorecard_releases_select on public.scorecard_releases;
create policy scorecard_releases_select on public.scorecard_releases
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists scorecard_releases_write on public.scorecard_releases;
create policy scorecard_releases_write on public.scorecard_releases
  for all to authenticated
  using (public.can_edit_scorecard(scorecard_id))
  with check (public.can_edit_scorecard(scorecard_id) and public.is_org_member(organization_id));

grant select, insert, update, delete on public.scorecard_releases to authenticated;

alter table public.responses drop constraint if exists responses_question_id_fkey;
alter table public.responses
  add constraint responses_question_id_fkey
  foreign key (question_id) references public.questions (id) on delete restrict;

insert into public.scorecard_releases (scorecard_id, organization_id, document, published_at)
select
  s.id,
  s.organization_id,
  jsonb_build_object(
    'version', 1,
    'page', (
      select jsonb_build_object(
        'title', p.title,
        'subtitle', coalesce(p.subtitle, ''),
        'description', coalesce(p.description, ''),
        'ctaLabel', p.cta_text
      )
      from public.scorecard_pages p
      where p.scorecard_id = s.id
    ),
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'questionCategoryId', q.question_category_id,
          'scoringCategoryId', q.scoring_category_id,
          'type', q.type,
          'title', q.title,
          'description', coalesce(q.description, ''),
          'isRequired', q.is_required,
          'isScored', q.is_scored,
          'position', q.position,
          'settings', q.settings,
          'options', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', o.id,
                'label', o.label,
                'value', coalesce(o.value, ''),
                'score', o.score,
                'position', o.position
              )
              order by o.position
            )
            from public.question_options o
            where o.question_id = q.id and o.archived_at is null
          ), '[]'::jsonb)
        )
        order by q.position
      )
      from public.questions q
      where q.scorecard_id = s.id and q.archived_at is null
    ), '[]'::jsonb),
    'scoringCategories', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', c.id, 'name', c.name, 'weight', c.weight, 'maxScore', c.max_score)
        order by c.position
      )
      from public.scoring_categories c
      where c.scorecard_id = s.id
    ), '[]'::jsonb),
    'ranges', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'minPercent', r.min_percent,
          'maxPercent', r.max_percent,
          'label', r.label,
          'title', r.title
        )
        order by r.position
      )
      from public.result_ranges r
      where r.scorecard_id = s.id
    ), '[]'::jsonb),
    'rules', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', rule.id, 'ruleType', rule.rule_type, 'config', rule.config, 'position', rule.position)
        order by rule.position
      )
      from public.scoring_rules rule
      where rule.scorecard_id = s.id and rule.rule_type in ('eligibility', 'cap')
    ), '[]'::jsonb)
  ),
  coalesce(s.published_at, now())
from public.scorecards s
where s.status in ('published', 'paused')
on conflict (scorecard_id) do nothing;

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
    update public.question_options o
    set archived_at = now()
    from public.questions q
    where o.question_id = q.id
      and q.scorecard_id = p_scorecard_id
      and o.archived_at is null;
    update public.questions
    set archived_at = now()
    where scorecard_id = p_scorecard_id
      and archived_at is null;
    position_base := 0;
    if jsonb_array_length(coalesce(p_payload -> 'ranges', '[]'::jsonb)) > 0 then
      delete from public.result_ranges where scorecard_id = p_scorecard_id;
    end if;
  else
    select coalesce(max(position), -1) + 1 into position_base
    from public.questions
    where scorecard_id = p_scorecard_id and archived_at is null;
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
    scorecard_id, eyebrow, title, subtitle, description, hero_image_url, benefits, testimonial,
    cta_text, estimated_time_label, show_estimated_time, show_question_count, show_privacy
  )
  select
    new_id, eyebrow, title, subtitle, description, hero_image_url, benefits, testimonial,
    cta_text, estimated_time_label, show_estimated_time, show_question_count, show_privacy
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
    insert into public.scoring_categories (
      scorecard_id, name, description, weight, max_score, position, high_message, medium_message, low_message
    ) values (
      new_id, rec.name, rec.description, rec.weight, rec.max_score, rec.position,
      rec.high_message, rec.medium_message, rec.low_message
    )
    returning id into new_row_id;
    scat_map := scat_map || jsonb_build_object(rec.id::text, new_row_id);
  end loop;

  for rec in
    select * from public.question_categories where scorecard_id = source_id order by position
  loop
    insert into public.question_categories (scorecard_id, name, description, icon, weight, position)
    values (new_id, rec.name, rec.description, rec.icon, rec.weight, rec.position)
    returning id into new_row_id;
    qcat_map := qcat_map || jsonb_build_object(rec.id::text, new_row_id);
  end loop;

  for rec in
    select * from public.questions
    where scorecard_id = source_id and archived_at is null
    order by position
  loop
    insert into public.questions (
      scorecard_id, question_category_id, scoring_category_id, type, title, description,
      is_required, is_scored, position, max_score, settings
    ) values (
      new_id,
      case when rec.question_category_id is null then null else (qcat_map ->> rec.question_category_id::text)::uuid end,
      case when rec.scoring_category_id is null then null else (scat_map ->> rec.scoring_category_id::text)::uuid end,
      rec.type, rec.title, rec.description, rec.is_required, rec.is_scored, rec.position, rec.max_score, rec.settings
    )
    returning id into new_row_id;
    question_map := question_map || jsonb_build_object(rec.id::text, new_row_id);
  end loop;

  for rec in
    select o.*
    from public.question_options o
    join public.questions q on q.id = o.question_id
    where q.scorecard_id = source_id
      and q.archived_at is null
      and o.archived_at is null
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
      scorecard_id, min_percent, max_percent, label, title, description, badge, position
    ) values (
      new_id, rec.min_percent, rec.max_percent, rec.label, rec.title, rec.description, rec.badge, rec.position
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
