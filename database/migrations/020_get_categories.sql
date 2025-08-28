-- =====================================================
-- MIGRAȚIE 020: Funcție get_categories() - categorii distincte cu count
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_categories(
  p_limit INT DEFAULT 100
) RETURNS TABLE(name TEXT, count BIGINT)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      NULLIF(trim((s.content ->> 'category')), '') AS name_raw,
      public.immutable_unaccent(lower(NULLIF(trim((s.content ->> 'category')), ''))) AS name_norm
    FROM public.stiri s
  ),
  filtered AS (
    SELECT name_raw, name_norm
    FROM base
    WHERE name_raw IS NOT NULL AND name_norm IS NOT NULL AND name_norm <> ''
  ),
  counts_norm AS (
    SELECT name_norm, COUNT(*)::BIGINT AS total_count
    FROM filtered
    GROUP BY name_norm
  ),
  counts_orig AS (
    SELECT name_norm, name_raw, COUNT(*)::BIGINT AS cnt
    FROM filtered
    GROUP BY name_norm, name_raw
  ),
  representative AS (
    SELECT name_norm, name_raw,
           ROW_NUMBER() OVER (PARTITION BY name_norm ORDER BY cnt DESC, name_raw ASC) AS rn
    FROM counts_orig
  ),
  picked AS (
    SELECT r.name_norm, r.name_raw AS name, cn.total_count AS count
    FROM representative r
    JOIN counts_norm cn ON cn.name_norm = r.name_norm
    WHERE r.rn = 1
  )
  SELECT name, count
  FROM picked
  ORDER BY count DESC, name ASC
  LIMIT GREATEST(p_limit, 1);
$$;

COMMENT ON FUNCTION public.get_categories(INT)
IS 'Returnează categorii distincte (content->>category) și numărul de știri din fiecare';


