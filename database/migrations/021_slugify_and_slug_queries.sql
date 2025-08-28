-- =====================================================
-- MIGRAȚIE 021: Slugify + query după slug + get_categories cu slug
-- =====================================================

-- 1) Funcție slugify IMMUTABLE (diacritic-insensitive, lowercase, delimitatori '-')
CREATE OR REPLACE FUNCTION public.slugify(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        public.immutable_unaccent(lower(COALESCE(input, ''))),
        '[^a-z0-9]+', '-', 'g'
      ),
      '(^-+)|(-+$)', '', 'g'
    ), ''
  );
$$;

COMMENT ON FUNCTION public.slugify(TEXT)
IS 'Normalizează textul într-un slug web-friendly: unaccent, lower, non-alnum -> -, trimmare -.';

-- 2) Index pe slugul categoriei pentru căutare strictă
CREATE INDEX IF NOT EXISTS idx_stiri_category_slug
ON public.stiri (
  public.slugify((content ->> 'category'))
);

-- 3) RPC: stiri_by_category_slug - listează știri după slug de categorie
CREATE OR REPLACE FUNCTION public.stiri_by_category_slug(
  p_slug TEXT,
  p_limit INT DEFAULT 10,
  p_offset INT DEFAULT 0,
  p_order_by TEXT DEFAULT 'publication_date',
  p_order_dir TEXT DEFAULT 'desc'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_by TEXT := LOWER(COALESCE(p_order_by, 'publication_date'));
  v_order_dir TEXT := LOWER(COALESCE(p_order_dir, 'desc'));
  v_sql TEXT;
  v_result JSONB;
BEGIN
  -- Validare coloane sortare
  IF v_order_by NOT IN ('publication_date', 'created_at', 'title', 'id') THEN
    v_order_by := 'publication_date';
  END IF;
  IF v_order_dir NOT IN ('asc', 'desc') THEN
    v_order_dir := 'desc';
  END IF;

  v_sql := format($f$
    WITH filtered AS (
      SELECT s.*
      FROM public.stiri s
      WHERE public.slugify(s.content ->> 'category') = public.slugify(%L)
    ),
    counted AS (
      SELECT COUNT(*)::BIGINT AS total_count FROM filtered
    ),
    paged AS (
      SELECT * FROM filtered
      ORDER BY %I %s, id ASC
      LIMIT %s OFFSET %s
    )
    SELECT jsonb_build_object(
      'items', COALESCE((SELECT jsonb_agg(to_jsonb(p.*)) FROM paged p), '[]'::jsonb),
      'total_count', (SELECT total_count FROM counted)
    )
  $f$, p_slug, v_order_by, upper(v_order_dir), p_limit, p_offset);

  EXECUTE v_sql INTO v_result;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.stiri_by_category_slug(TEXT, INT, INT, TEXT, TEXT)
IS 'Returnează știri filtrate după slug-ul categoriei, cu paginare/sortare. JSON: {items, total_count}';

-- 4) Actualizare get_categories pentru a include slug (alege nume reprezentativ per grup)
CREATE OR REPLACE FUNCTION public.get_categories(
  p_limit INT DEFAULT 100
) RETURNS TABLE(name TEXT, slug TEXT, count BIGINT)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      NULLIF(trim((s.content ->> 'category')), '') AS name_raw,
      public.slugify(s.content ->> 'category') AS slug
    FROM public.stiri s
  ),
  filtered AS (
    SELECT name_raw, slug
    FROM base
    WHERE name_raw IS NOT NULL AND slug IS NOT NULL AND slug <> ''
  ),
  counts_slug AS (
    SELECT slug, COUNT(*)::BIGINT AS total_count
    FROM filtered
    GROUP BY slug
  ),
  counts_orig AS (
    SELECT slug, name_raw, COUNT(*)::BIGINT AS cnt
    FROM filtered
    GROUP BY slug, name_raw
  ),
  representative AS (
    SELECT slug, name_raw,
           ROW_NUMBER() OVER (PARTITION BY slug ORDER BY cnt DESC, name_raw ASC) AS rn
    FROM counts_orig
  ),
  picked AS (
    SELECT r.slug, r.name_raw AS name, cs.total_count AS count
    FROM representative r
    JOIN counts_slug cs ON cs.slug = r.slug
    WHERE r.rn = 1
  )
  SELECT name, slug, count
  FROM picked
  ORDER BY count DESC, name ASC
  LIMIT GREATEST(p_limit, 1);
$$;

COMMENT ON FUNCTION public.get_categories(INT)
IS 'Categorii distincte (slug + nume reprezentativ) și numărul de știri per categorie.';


