-- Colonnes du builder. La migration initiale n'est pas modifiée.

alter table public.scorecard_pages
  add column if not exists eyebrow text,
  add column if not exists estimated_time_label text;

alter table public.question_categories
  add column if not exists icon text,
  add column if not exists weight numeric(8, 2) not null default 1;

alter table public.question_categories
  drop constraint if exists question_categories_weight_check;

alter table public.question_categories
  add constraint question_categories_weight_check check (weight > 0);

alter table public.questions
  add column if not exists is_scored boolean not null default true;

alter table public.result_ranges
  add column if not exists badge text;

alter table public.scorecard_lead_forms
  alter column consent_required set default false;

alter table public.scorecard_lead_forms
  alter column consent_label set default 'J''accepte que WOLOYEM utilise mes informations afin de me communiquer mes résultats et les ressources correspondant à mon profil.';

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
    insert into public.scoring_categories (scorecard_id, name, description, weight, max_score, position)
    values (new_id, rec.name, rec.description, rec.weight, rec.max_score, rec.position)
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
    select * from public.questions where scorecard_id = source_id order by position
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

-- Exemple éditable : Éligibilité PMP®. Aucune question n'est codée dans React.
do $$
declare
  org_id uuid := '00000000-0000-4000-8000-000000000001';
  card_id uuid;
  cat_education uuid;
  cat_experience uuid;
  cat_training uuid;
  cat_readiness uuid;
  score_experience uuid;
  score_training uuid;
  score_knowledge uuid;
  score_readiness uuid;
  q_id uuid;
  range_ready uuid;
begin
  if not exists (select 1 from public.organizations where id = org_id) then
    return;
  end if;

  if exists (select 1 from public.scorecards where slug = 'eligibilite-pmp') then
    return;
  end if;

  insert into public.scorecards (
    organization_id, name, slug, description, language, category, status,
    primary_color, secondary_color, estimated_minutes, privacy_text
  ) values (
    org_id,
    'Éligibilité PMP®',
    'eligibilite-pmp',
    'Scorecard d''exemple pour qualifier un premier niveau de préparation PMP®.',
    'fr',
    'PMP',
    'draft',
    '#16324F',
    '#C4A15A',
    3,
    'Cette évaluation fournit une indication préliminaire et ne constitue pas une validation officielle de votre éligibilité. La validation définitive dépend des critères en vigueur et de l''examen de votre candidature par PMI®.'
  ) returning id into card_id;

  insert into public.scorecard_pages (
    scorecard_id, eyebrow, title, subtitle, description, cta_text, estimated_time_label,
    benefits, testimonial, show_estimated_time, show_question_count, show_privacy
  ) values (
    card_id,
    'WOLOYEM',
    'Êtes-vous éligible à la certification PMP® ?',
    'Découvrez votre situation en quelques minutes.',
    'Répondez à quelques questions et obtenez une première évaluation personnalisée de votre profil.',
    'Vérifier mon éligibilité',
    'Environ 3 minutes',
    '[
      {"title":"Une lecture claire","description":"Votre expérience, votre formation et votre objectif sont situés simplement.","icon":"compass"},
      {"title":"Un score par thème","description":"Chaque catégorie contribue au résultat selon son poids.","icon":"layers"},
      {"title":"Une orientation","description":"Le résultat propose une prochaine étape de formation, sans décision officielle.","icon":"target"}
    ]'::jsonb,
    '{"quote":"Le diagnostic m''a aidé à voir si je devais d''abord consolider mes bases.","author":"Participant WOLOYEM","role":"Chef de projet"}'::jsonb,
    true,
    true,
    true
  );

  insert into public.scorecard_lead_forms (scorecard_id, timing, consent_required, consent_label, fields)
  values (
    card_id,
    'before_results',
    false,
    'J''accepte que WOLOYEM utilise mes informations afin de me communiquer mes résultats et les ressources correspondant à mon profil.',
    '{
      "first_name": {"enabled": true, "required": true, "label": "Prénom", "placeholder": "Awa"},
      "last_name": {"enabled": true, "required": false, "label": "Nom", "placeholder": "Diallo"},
      "email": {"enabled": true, "required": true, "label": "Email", "placeholder": "awa@exemple.com"},
      "phone": {"enabled": true, "required": false, "label": "Téléphone", "placeholder": "+225"},
      "whatsapp": {"enabled": false, "required": false, "label": "WhatsApp", "placeholder": ""},
      "company": {"enabled": true, "required": false, "label": "Entreprise", "placeholder": ""},
      "job_title": {"enabled": false, "required": false, "label": "Fonction", "placeholder": ""},
      "country": {"enabled": true, "required": false, "label": "Pays", "placeholder": ""},
      "city": {"enabled": false, "required": false, "label": "Ville", "placeholder": ""}
    }'::jsonb
  );

  insert into public.question_categories (scorecard_id, name, description, icon, weight, position)
  values (card_id, 'Education', 'Niveau d''études', 'graduation-cap', 1, 0) returning id into cat_education;
  insert into public.question_categories (scorecard_id, name, description, icon, weight, position)
  values (card_id, 'Experience', 'Expérience professionnelle et projets', 'briefcase', 1, 1) returning id into cat_experience;
  insert into public.question_categories (scorecard_id, name, description, icon, weight, position)
  values (card_id, 'Project Management Training', 'Formation déjà suivie', 'book-open', 1, 2) returning id into cat_training;
  insert into public.question_categories (scorecard_id, name, description, icon, weight, position)
  values (card_id, 'Exam Readiness', 'Objectif de certification', 'target', 1, 3) returning id into cat_readiness;

  insert into public.scoring_categories (scorecard_id, name, description, weight, max_score, position)
  values (card_id, 'Experience', 'Poids de l''expérience', 40, 100, 0) returning id into score_experience;
  insert into public.scoring_categories (scorecard_id, name, description, weight, max_score, position)
  values (card_id, 'Training', 'Poids de la formation', 20, 100, 1) returning id into score_training;
  insert into public.scoring_categories (scorecard_id, name, description, weight, max_score, position)
  values (card_id, 'Knowledge', 'Poids des connaissances', 25, 100, 2) returning id into score_knowledge;
  insert into public.scoring_categories (scorecard_id, name, description, weight, max_score, position)
  values (card_id, 'Readiness', 'Poids de la préparation', 15, 100, 3) returning id into score_readiness;

  insert into public.questions (
    scorecard_id, question_category_id, scoring_category_id, type, title, description, is_required, is_scored, position, settings
  ) values (
    card_id, cat_education, score_knowledge, 'single_choice',
    'Quel est votre niveau d''études ?',
    'Indiquez le diplôme le plus élevé obtenu ou en cours.',
    true, true, 0, '{}'::jsonb
  ) returning id into q_id;
  insert into public.question_options (question_id, label, value, score, position) values
    (q_id, 'Inférieur à une licence', 'below-bachelor', 20, 0),
    (q_id, 'Licence ou équivalent', 'bachelor', 60, 1),
    (q_id, 'Master ou équivalent', 'master', 90, 2),
    (q_id, 'Doctorat', 'doctorate', 100, 3);

  insert into public.questions (
    scorecard_id, question_category_id, scoring_category_id, type, title, is_required, is_scored, position, settings
  ) values (
    card_id, cat_experience, score_experience, 'single_choice',
    'Combien d''années d''expérience professionnelle possédez-vous ?',
    true, true, 1, '{}'::jsonb
  ) returning id into q_id;
  insert into public.question_options (question_id, label, value, score, position) values
    (q_id, 'Moins de 1 an', 'lt-1', 0, 0),
    (q_id, '1 à 2 ans', 'y1-2', 25, 1),
    (q_id, '3 à 5 ans', 'y3-5', 60, 2),
    (q_id, 'Plus de 5 ans', 'gt-5', 100, 3);

  insert into public.questions (
    scorecard_id, question_category_id, scoring_category_id, type, title, is_required, is_scored, position, settings
  ) values (
    card_id, cat_experience, score_experience, 'yes_no',
    'Avez-vous dirigé ou géré des projets ?',
    true, true, 2, '{}'::jsonb
  ) returning id into q_id;
  insert into public.question_options (question_id, label, value, score, position) values
    (q_id, 'Oui', 'yes', 100, 0),
    (q_id, 'Non', 'no', 0, 1);

  insert into public.questions (
    scorecard_id, question_category_id, scoring_category_id, type, title, is_required, is_scored, position, settings
  ) values (
    card_id, cat_training, score_training, 'yes_no',
    'Avez-vous suivi une formation en gestion de projet ?',
    true, true, 3, '{}'::jsonb
  ) returning id into q_id;
  insert into public.question_options (question_id, label, value, score, position) values
    (q_id, 'Oui', 'yes', 100, 0),
    (q_id, 'Non', 'no', 20, 1);

  insert into public.questions (
    scorecard_id, question_category_id, scoring_category_id, type, title, is_required, is_scored, position, settings
  ) values (
    card_id, cat_readiness, score_readiness, 'single_choice',
    'Quel est votre objectif principal ?',
    true, true, 4, '{}'::jsonb
  ) returning id into q_id;
  insert into public.question_options (question_id, label, value, score, position) values
    (q_id, 'Comprendre mon niveau', 'explore', 40, 0),
    (q_id, 'Préparer la CAPM®', 'capm', 70, 1),
    (q_id, 'Préparer la PMP®', 'pmp', 100, 2);

  insert into public.result_ranges (scorecard_id, min_percent, max_percent, label, title, description, badge, position)
  values
    (card_id, 0, 39, 'Needs Preparation', 'Vous devez encore renforcer vos fondamentaux.', 'Votre profil gagne à consolider les bases avant une candidature.', 'Début', 0),
    (card_id, 40, 59, 'Developing', 'Vous êtes sur la bonne voie.', 'Quelques expériences ou une formation structurée rapprocheraient votre profil.', 'En progression', 1),
    (card_id, 60, 79, 'Ready', 'Votre profil avance vers une préparation PMP®.', 'Les bases sont présentes. Une préparation guidée peut préciser la suite.', 'Prêt', 2);
  insert into public.result_ranges (scorecard_id, min_percent, max_percent, label, title, description, badge, position)
  values (
    card_id, 80, 100, 'Highly Ready',
    'Votre profil semble correspondre à une préparation PMP®.',
    'Votre expérience et votre niveau actuel indiquent que vous êtes bien positionné pour poursuivre votre préparation.',
    'Très prêt', 3
  ) returning id into range_ready;

  insert into public.result_recommendations (result_range_id, title, body, cta_label, cta_url, position)
  values (
    range_ready,
    'Préparez votre certification PMP® avec WOLOYEM',
    'Cette indication reste préliminaire. PMI® examine la candidature définitive.',
    'Découvrir le Bootcamp PMP®',
    'https://www.woloyem.com/pmp-en-francais',
    0
  );
end;
$$;
