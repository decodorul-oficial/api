-- =====================================================
-- MIGRAȚIE 008: Fix funcție stiri_search (referință corectă la CTE paged)
-- =====================================================

-- Creează/actualizează wrapper-ul IMMUTABLE pentru unaccent, fără DO/IF pentru a evita problemele de quoting
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $iu$
DECLARE
  v_out text;
BEGIN
  -- Încearcă funcția necalificată (dacă schema extensiei e în search_path)
  BEGIN
    v_out := unaccent($1);
    RETURN v_out;
  EXCEPTION WHEN undefined_function THEN
    -- Încearcă schema public
    BEGIN
      EXECUTE 'SELECT public.unaccent($1)' INTO v_out USING $1;
      RETURN v_out;
    EXCEPTION WHEN undefined_function THEN
      -- Încearcă schema extensions (Supabase)
      EXECUTE 'SELECT extensions.unaccent($1)' INTO v_out USING $1;
      RETURN v_out;
    END;
  END;
END;
$iu$;

-- Înlocuiește funcția RPC cu o versiune care folosește subselect pentru a agrega rezultate din CTE paged
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
  v_result JSONB;
BEGIN
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
      'items', COALESCE((SELECT jsonb_agg(to_jsonb(p.*)) FROM paged p), '[]'::jsonb),
      'total_count', (SELECT total_count FROM counted)
    )
  $f$, p_query, p_query, v_order_by, upper(v_order_dir), p_limit, p_offset);

  EXECUTE v_sql INTO v_result;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.stiri_search(TEXT, INT, INT, TEXT, TEXT)
IS 'Căutare full-text/fuzzy insensibilă la diacritice, cu agregare corectă din CTE paged.';


