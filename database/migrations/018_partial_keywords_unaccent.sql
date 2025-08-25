-- =====================================================
-- MIGRAȚIE 018: Keywords diacritic-insensitive + partial în stiri_search_enhanced
-- =====================================================

-- Actualizează funcția de căutare pentru a face filtrarea pe content.keywords
-- diacritic-insensitive și partial (ILIKE), cu logică AND peste toate
-- cuvintele-cheie furnizate de utilizator.
-- Exemple de comportament dorit:
--  - în DB: "învățământ postliceal"
--  - căutare: "invatamant" sau "învățământ" sau "postliceal" => se potrivesc

CREATE OR REPLACE FUNCTION public.stiri_search_enhanced(
  p_query TEXT DEFAULT NULL,
  p_keywords TEXT[] DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
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
  -- Validare parametri de sortare
  IF v_order_by NOT IN ('publication_date', 'created_at', 'title', 'id') THEN
    v_order_by := 'publication_date';
  END IF;
  IF v_order_dir NOT IN ('asc', 'desc') THEN
    v_order_dir := 'desc';
  END IF;

  -- Construiește SQL dinamic cu filtrare flexibilă
  v_sql := format($f$
    WITH filtered AS (
      SELECT s.*
      FROM public.stiri s
      WHERE 1=1
        -- Filtrare fuzzy/full-text search (dacă e specificat query)
        AND CASE 
          WHEN %L IS NOT NULL AND trim(%L) != '' THEN (
            (
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
          )
          ELSE true
        END
        -- Filtrare keywords (dacă sunt specificate)
        AND CASE 
          WHEN %L IS NOT NULL AND array_length(%L::text[], 1) > 0 THEN
            -- Logică AND: pentru fiecare keyword din p_keywords trebuie să existe
            -- cel puțin un element în content.keywords care să îl conțină (partial),
            -- insensibil la diacritice și caz.
            NOT EXISTS (
              SELECT 1 FROM unnest(%L::text[]) AS k
              WHERE NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(COALESCE(s.content->'keywords', '[]'::jsonb)) AS kw
                WHERE public.immutable_unaccent(lower(kw)) ILIKE '%%' || public.immutable_unaccent(lower(k)) || '%%'
              )
            )
          ELSE true
        END
        -- Filtrare dată început (dacă e specificată)
        AND CASE 
          WHEN %L IS NOT NULL THEN s.publication_date >= %L
          ELSE true
        END
        -- Filtrare dată sfârșit (dacă e specificată)
        AND CASE 
          WHEN %L IS NOT NULL THEN s.publication_date <= %L
          ELSE true
        END
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
  $f$, 
    -- parametri pentru query search (repetat 4 ori pentru cele 4 folosiri)
    p_query, p_query, p_query, p_query,
    -- parametri pentru keywords (repetat 3 ori)
    p_keywords, p_keywords, p_keywords,
    -- parametri pentru date (repetat 4 ori)
    p_date_from, p_date_from, p_date_to, p_date_to,
    -- parametri pentru sortare și paginare
    v_order_by, upper(v_order_dir), p_limit, p_offset
  );

  EXECUTE v_sql INTO v_result;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.stiri_search_enhanced(TEXT, TEXT[], DATE, DATE, INT, INT, TEXT, TEXT)
IS 'Căutare îmbunătățită: query full-text + filtrare keywords partial/diacritic-insensitive (AND) + date. Returnează JSON: {items, total_count}';


