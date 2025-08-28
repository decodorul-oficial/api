-- =====================================================
-- MIGRAȚIE 020: Funcție get_categories() - categorii distincte cu count
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_categories(
  p_limit INT DEFAULT 100
) RETURNS TABLE(name TEXT, count BIGINT)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    NULLIF(trim((content ->> 'category')), '') AS name,
    COUNT(*)::BIGINT AS count
  FROM public.stiri
  WHERE NULLIF(trim((content ->> 'category')), '') IS NOT NULL
  GROUP BY 1
  ORDER BY count DESC, name ASC
  LIMIT GREATEST(p_limit, 1);
$$;

COMMENT ON FUNCTION public.get_categories(INT)
IS 'Returnează categorii distincte (content->>category) și numărul de știri din fiecare';


