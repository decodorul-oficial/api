-- =====================================================
-- MIGRAȚIE 003: Căutare full-text/fuzzy pentru știri
-- =====================================================

-- Extensii necesare
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Coloane generate pentru căutare (IMMUTABLE-safe în index)
ALTER TABLE public.stiri
  ADD COLUMN IF NOT EXISTS search_text TEXT
  GENERATED ALWAYS AS (
    regexp_replace(
      regexp_replace(
        coalesce(title, '') || ' ' || coalesce(content::text, ''),
        '<[^>]+>', ' ', 'g'
      ),
      '["{}:\\[\\],]', ' ', 'g'
    )
  ) STORED;

ALTER TABLE public.stiri
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'simple',
      regexp_replace(
        regexp_replace(
          coalesce(title, '') || ' ' || coalesce(content::text, ''),
          '<[^>]+>', ' ', 'g'
        ),
        '["{}:\\[\\],]', ' ', 'g'
      )
    )
  ) STORED;

-- Indexuri pe coloanele generate
CREATE INDEX IF NOT EXISTS idx_stiri_search_tsv ON public.stiri USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS idx_stiri_search_trgm ON public.stiri USING GIN (search_text gin_trgm_ops);

-- Index trigram pe title pentru fuzzy ilike
CREATE INDEX IF NOT EXISTS idx_stiri_title_trgm
ON public.stiri
USING GIN (title gin_trgm_ops);

-- RPC: căutare în știri care returnează JSON cu items + total_count
-- Parametri:
--   p_query: textul căutat
--   p_limit/p_offset: paginare
--   p_order_by: 'publication_date' | 'created_at' | 'title' | 'id' (default: publication_date)
--   p_order_dir: 'asc' | 'desc' (default: desc)
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
  v_total BIGINT;
BEGIN
  -- Whitelist pentru coloanele de sortare
  IF v_order_by NOT IN ('publication_date', 'created_at', 'title', 'id') THEN
    v_order_by := 'publication_date';
  END IF;

  -- Whitelist pentru direcție
  IF v_order_dir NOT IN ('asc', 'desc') THEN
    v_order_dir := 'desc';
  END IF;

  -- Construiește SQL dinamic cu sortare validată
  v_sql := format($f$
    WITH filtered AS (
      SELECT s.*
      FROM public.stiri s
      WHERE
        (
          s.search_tsv @@ websearch_to_tsquery('simple', %L)
        )
        OR s.search_text ILIKE '%%' || %L || '%%'
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

-- OPTIONAL: Grant exec drepturi către rolurile folosite de PostgREST (nu este necesar pentru service_role)
-- GRANT EXECUTE ON FUNCTION public.stiri_search(TEXT, INT, INT, TEXT, TEXT) TO anon, authenticated, service_role;

-- Documentație
COMMENT ON FUNCTION public.stiri_search(TEXT, INT, INT, TEXT, TEXT)
IS 'Căutare full-text/fuzzy în stiri: caută în title și în textul extras din content (JSONB), cu sortare/paginare. Returnează JSON: {items, total_count}';


