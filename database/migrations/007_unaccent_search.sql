-- =====================================================
-- MIGRAȚIE 007: Căutare insensibilă la diacritice (unaccent)
-- =====================================================

-- Asigură extensiile necesare
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Wrapper IMMUTABLE peste unaccent pentru a putea fi folosit în indecși
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_out text;
BEGIN
  -- Încearcă funcția necalificată (dacă schema extensiei e în search_path)
  BEGIN
    EXECUTE 'SELECT unaccent($1)'
    INTO v_out
    USING $1;
    RETURN v_out;
  EXCEPTION WHEN undefined_function THEN
    -- Încearcă schema public
    BEGIN
      EXECUTE 'SELECT public.unaccent($1)'
      INTO v_out
      USING $1;
      RETURN v_out;
    EXCEPTION WHEN undefined_function THEN
      -- Încearcă schema extensions (Supabase)
      EXECUTE 'SELECT extensions.unaccent($1)'
      INTO v_out
      USING $1;
      RETURN v_out;
    END;
  END;
END;
$$;

-- Indecși pe expresii normalizate cu unaccent + lower pentru a permite căutarea fără diacritice
-- Text normalizat: strip HTML, strip caractere JSON, concat title + content::text
-- 1) Index GIN pentru full-text search pe text unaccent
CREATE INDEX IF NOT EXISTS idx_stiri_search_tsv_unaccent ON public.stiri USING GIN (
  to_tsvector(
    'simple',
    public.immutable_unaccent(lower(
      regexp_replace(
        regexp_replace(
          coalesce(title, '') || ' ' || coalesce(content::text, ''),
          '<[^>]+>', ' ', 'g'
        ),
        '["{}:\\[\\],]', ' ', 'g'
      )
    ))
  )
);

-- 2) Index GIN trigram pentru ILIKE pe text unaccent
CREATE INDEX IF NOT EXISTS idx_stiri_search_unaccent_trgm ON public.stiri USING GIN (
  public.immutable_unaccent(lower(
    regexp_replace(
      regexp_replace(
        coalesce(title, '') || ' ' || coalesce(content::text, ''),
        '<[^>]+>', ' ', 'g'
      ),
      '["{}:\\[\\],]', ' ', 'g'
    )
  )) gin_trgm_ops
);

-- 3) Index trigram separat pentru title unaccent (opțional dar util pentru căutări scurte)
CREATE INDEX IF NOT EXISTS idx_stiri_title_unaccent_trgm ON public.stiri USING GIN (
  public.immutable_unaccent(lower(title)) gin_trgm_ops
);

-- Actualizează funcția RPC public.stiri_search pentru a folosi unaccent pe ambele părți
CREATE OR REPLACE FUNCTION public.stiri_search(
  p_query TEXT,
  p_limit INT DEFAULT 10,
  p_offset INT DEFAULT 0,
  p_order_by TEXT DEFAULT 'publication_date',
  p_order_dir TEXT DEFAULT 'desc'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_by TEXT := LOWER(COALESCE(p_order_by, 'publication_date'));
  v_order_dir TEXT := LOWER(COALESCE(p_order_dir, 'desc'));
  v_sql TEXT;
  v_items JSONB;
BEGIN
  -- Whitelist pentru coloanele de sortare
  IF v_order_by NOT IN ('publication_date', 'created_at', 'title', 'id') THEN
    v_order_by := 'publication_date';
  END IF;

  -- Whitelist pentru direcție
  IF v_order_dir NOT IN ('asc', 'desc') THEN
    v_order_dir := 'desc';
  END IF;

  -- Construiește SQL dinamic cu expresii indexabile (unaccent + lower)
  v_sql := format($f$
    WITH filtered AS (
      SELECT s.*
      FROM public.stiri s
      WHERE (
        to_tsvector(
          'simple',
          public.immutable_unaccent(lower(
            regexp_replace(
              regexp_replace(
                coalesce(s.title, '') || ' ' || coalesce(s.content::text, ''),
                '<[^>]+>', ' ', 'g'
              ),
              '["{}:\\[\\],]', ' ', 'g'
            )
          ))
        ) @@ websearch_to_tsquery('simple', public.immutable_unaccent(lower(%L)))
      )
      OR (
        public.immutable_unaccent(lower(
          regexp_replace(
            regexp_replace(
              coalesce(s.title, '') || ' ' || coalesce(s.content::text, ''),
              '<[^>]+>', ' ', 'g'
            ),
            '["{}:\\[\\],]', ' ', 'g'
          )
        )) ILIKE '%%' || public.immutable_unaccent(lower(%L)) || '%%'
      )
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
      'items', COALESCE(jsonb_agg(to_jsonb(paged.*)), '[]'::jsonb),
      'total_count', (SELECT total_count FROM counted)
    )
  $f$, p_query, p_query, v_order_by, upper(v_order_dir), p_limit, p_offset);

  EXECUTE v_sql INTO v_items;
  RETURN v_items;
END;
$$;

COMMENT ON FUNCTION public.stiri_search(TEXT, INT, INT, TEXT, TEXT)
IS 'Căutare full-text/fuzzy insensibilă la diacritice: caută în title și textul extras din content (JSONB), cu sortare/paginare. Returnează JSON: {items, total_count}';


