-- =====================================================
-- MIGRAȚIE 006: Fix get_most_read_stiri (elimină referința la s.updated_at)
-- =====================================================

-- Elimină funcția existentă cu semnătura (TEXT, INT)
DROP FUNCTION IF EXISTS public.get_most_read_stiri(TEXT, INT);

-- Recreează funcția fără coloana updated_at (care nu există în stiri)
CREATE OR REPLACE FUNCTION public.get_most_read_stiri(
  p_period TEXT DEFAULT NULL,
  p_limit INT DEFAULT 10
) RETURNS TABLE(
  id BIGINT,
  title TEXT,
  publication_date DATE,
  content JSONB,
  created_at TIMESTAMPTZ,
  filename TEXT,
  view_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF p_period IS NULL OR p_period = '' OR lower(p_period) = 'all' THEN
    RETURN QUERY
    SELECT s.id, s.title, s.publication_date, s.content, s.created_at, s.filename, COALESCE(s.view_count, 0) AS view_count
    FROM public.stiri s
    ORDER BY COALESCE(s.view_count, 0) DESC, s.id DESC
    LIMIT p_limit;
  ELSIF lower(p_period) = '24h' THEN
    RETURN QUERY
    SELECT s.id, s.title, s.publication_date, s.content, s.created_at, s.filename,
           COALESCE(COUNT(nv.id), 0) AS view_count
    FROM public.stiri s
    LEFT JOIN public.news_views nv ON nv.news_id = s.id AND nv.viewed_at >= NOW() - INTERVAL '24 hours'
    GROUP BY s.id
    ORDER BY COALESCE(COUNT(nv.id), 0) DESC, s.id DESC
    LIMIT p_limit;
  ELSIF lower(p_period) = '7d' THEN
    RETURN QUERY
    SELECT s.id, s.title, s.publication_date, s.content, s.created_at, s.filename,
           COALESCE(COUNT(nv.id), 0) AS view_count
    FROM public.stiri s
    LEFT JOIN public.news_views nv ON nv.news_id = s.id AND nv.viewed_at >= NOW() - INTERVAL '7 days'
    GROUP BY s.id
    ORDER BY COALESCE(COUNT(nv.id), 0) DESC, s.id DESC
    LIMIT p_limit;
  ELSIF lower(p_period) = '30d' OR lower(p_period) = '30days' OR lower(p_period) = 'month' THEN
    RETURN QUERY
    SELECT s.id, s.title, s.publication_date, s.content, s.created_at, s.filename,
           COALESCE(COUNT(nv.id), 0) AS view_count
    FROM public.stiri s
    LEFT JOIN public.news_views nv ON nv.news_id = s.id AND nv.viewed_at >= NOW() - INTERVAL '30 days'
    GROUP BY s.id
    ORDER BY COALESCE(COUNT(nv.id), 0) DESC, s.id DESC
    LIMIT p_limit;
  ELSE
    RETURN QUERY
    SELECT s.id, s.title, s.publication_date, s.content, s.created_at, s.filename, COALESCE(s.view_count, 0) AS view_count
    FROM public.stiri s
    ORDER BY COALESCE(s.view_count, 0) DESC, s.id DESC
    LIMIT p_limit;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_most_read_stiri(TEXT, INT) IS 'Returnează lista celor mai citite știri, fără a referi coloane inexistente';


