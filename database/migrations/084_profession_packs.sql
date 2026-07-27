-- =====================================================
-- 084: Profession packs + category digest support
-- =====================================================

CREATE TABLE IF NOT EXISTS public.profession_packs (
  id TEXT PRIMARY KEY,
  name_ro TEXT NOT NULL,
  description_ro TEXT,
  categories TEXT[] NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  anchor_identifiers TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.profession_packs IS 'Pachete editoriale per profesie — categorii, keywords și acte ancora';

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS profession_pack_id TEXT REFERENCES public.profession_packs(id);

COMMENT ON COLUMN public.user_preferences.profession_pack_id IS 'Pachetul profesional aplicat (notar, contabil, etc.)';

-- Seed packs (categories as slugs — match preferred_categories + slugify(stiri.category))
INSERT INTO public.profession_packs (id, name_ro, description_ro, categories, keywords, anchor_identifiers, sort_order)
VALUES
  (
    'notar',
    'Notar public',
    'Acte, fiscalitate și cadastru relevante pentru notariat.',
    ARRAY['justitie', 'fiscalitate'],
    ARRAY['autentificare', 'succesiune', 'cadastru', 'carte funciara'],
    ARRAY['Codul civil'],
    1
  ),
  (
    'contabil',
    'Contabil / fiscalist',
    'Fiscalitate, ANAF și contabilitate.',
    ARRAY['fiscalitate', 'economie'],
    ARRAY['ANAF', 'TVA', 'Cod fiscal', 'contabilitate', 'PFA'],
    ARRAY['Codul fiscal'],
    2
  ),
  (
    'jurist',
    'Jurist',
    'Justiție și acte administrative.',
    ARRAY['justitie', 'administratie'],
    ARRAY['OUG', 'ordonanta', 'Cod procedura'],
    ARRAY[]::TEXT[],
    3
  ),
  (
    'magistrat',
    'Magistrat',
    'Procedură civilă și penală, CSM.',
    ARRAY['justitie'],
    ARRAY['CSM', 'instanta', 'procedura penala', 'procedura civila'],
    ARRAY[]::TEXT[],
    4
  ),
  (
    'grafier',
    'Grafier / executor',
    'Executare silită și titluri executorii.',
    ARRAY['justitie'],
    ARRAY['executare silita', 'BEJ', 'titlu executoriu'],
    ARRAY[]::TEXT[],
    5
  )
ON CONFLICT (id) DO UPDATE SET
  name_ro = EXCLUDED.name_ro,
  description_ro = EXCLUDED.description_ro,
  categories = EXCLUDED.categories,
  keywords = EXCLUDED.keywords,
  anchor_identifiers = EXCLUDED.anchor_identifiers,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

GRANT SELECT ON public.profession_packs TO authenticated, anon, service_role;

-- Category digest hits (preferred_categories slugs vs stiri.content.category)
CREATE OR REPLACE FUNCTION public.get_category_digest_hits(
  p_user_id UUID,
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ
)
RETURNS TABLE(
  stiri_id BIGINT,
  stiri_title TEXT,
  stiri_slug TEXT,
  publication_date TIMESTAMPTZ,
  category TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_categories JSONB;
BEGIN
  SELECT up.preferred_categories INTO v_categories
  FROM public.user_preferences up
  WHERE up.id = p_user_id;

  IF v_categories IS NULL OR jsonb_array_length(v_categories) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    s.id AS stiri_id,
    s.title AS stiri_title,
    (public.slugify(s.title) || '-' || s.id::text) AS stiri_slug,
    coalesce(s.publication_date::timestamptz, s.created_at) AS publication_date,
    s.content->>'category' AS category
  FROM public.stiri s
  WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(v_categories) AS cat(value)
    WHERE public.slugify(coalesce(s.content->>'category', '')) = public.slugify(cat.value)
  )
  AND coalesce(s.publication_date::timestamptz, s.created_at) >= p_since
  AND coalesce(s.publication_date::timestamptz, s.created_at) < p_until
  ORDER BY coalesce(s.publication_date::timestamptz, s.created_at) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_category_digest_hits(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- Extend digest user list: watches, searches, OR category alerts (paid + flags)
DROP FUNCTION IF EXISTS public.get_users_with_active_digests();
CREATE OR REPLACE FUNCTION public.get_users_with_active_digests()
RETURNS TABLE(
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  saved_searches JSONB,
  legislation_watches JSONB,
  notification_settings JSONB,
  preferred_categories JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH paid AS (
    SELECT s.user_id
    FROM payments.subscriptions s
    WHERE s.status = 'ACTIVE'
  ),
  search_users AS (
    SELECT ss.user_id,
      jsonb_agg(jsonb_build_object(
        'id', ss.id, 'name', ss.name, 'search_params', ss.search_params
      )) AS saved_searches
    FROM saved_searches ss
    JOIN paid p ON p.user_id = ss.user_id
    WHERE ss.email_notifications_enabled = TRUE
    GROUP BY ss.user_id
  ),
  watch_users AS (
    SELECT w.user_id,
      jsonb_agg(jsonb_build_object(
        'id', w.id, 'label', w.label, 'normalized_key', w.normalized_key
      )) AS legislation_watches
    FROM public.legislation_watches w
    JOIN paid p ON p.user_id = w.user_id
    WHERE w.email_enabled = TRUE
    GROUP BY w.user_id
  ),
  category_users AS (
    SELECT up.id AS user_id
    FROM public.user_preferences up
    JOIN paid p ON p.user_id = up.id
    WHERE coalesce((up.notification_settings->>'category_email_enabled')::boolean, false) = true
      AND up.preferred_categories IS NOT NULL
      AND jsonb_array_length(up.preferred_categories) > 0
  ),
  all_user_ids AS (
    SELECT user_id FROM search_users
    UNION
    SELECT user_id FROM watch_users
    UNION
    SELECT user_id FROM category_users
  ),
  all_users AS (
    SELECT
      ids.user_id,
      coalesce(su.saved_searches, '[]'::jsonb) AS saved_searches,
      coalesce(wu.legislation_watches, '[]'::jsonb) AS legislation_watches
    FROM all_user_ids ids
    LEFT JOIN search_users su ON su.user_id = ids.user_id
    LEFT JOIN watch_users wu ON wu.user_id = ids.user_id
  )
  SELECT
    au.user_id,
    u.email::TEXT AS user_email,
    coalesce(pr.display_name, u.email)::TEXT AS user_name,
    au.saved_searches,
    au.legislation_watches,
    coalesce(up.notification_settings, '{}'::jsonb) AS notification_settings,
    coalesce(up.preferred_categories, '[]'::jsonb) AS preferred_categories
  FROM all_users au
  JOIN auth.users u ON u.id = au.user_id
  LEFT JOIN public.profiles pr ON pr.id = au.user_id
  LEFT JOIN public.user_preferences up ON up.id = au.user_id
  WHERE u.email_confirmed_at IS NOT NULL
    AND coalesce((up.notification_settings->>'digest_email_enabled')::boolean, true) = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_users_with_active_digests() TO service_role;

-- Legacy template: mention watch/category sections in subject (slot pipeline uses AlertDigestEmailBuilder)
UPDATE payments.email_templates
SET
  subject = 'Decodorul Oficial — Digest alerte: {totalArticleCount} noutăți (acte, căutări, domenii)',
  body_html = '{htmlBody}',
  body_text = '{textBody}',
  variables = '["userName","currentDate","totalArticleCount","htmlBody","textBody","watchArticleList","searchArticleList","categoryArticleList"]'::jsonb,
  updated_at = now()
WHERE template_name = 'daily_article_digest';
