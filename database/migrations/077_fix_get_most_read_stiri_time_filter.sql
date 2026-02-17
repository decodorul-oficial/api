-- =====================================================
-- MIGRAȚIE 077: Fix get_most_read_stiri - filtrează și după publication_date
--      Problema: Funcția filtra doar vizualizările pe perioadă, dar nu și știrile
--      după data publicării, rezultând în știri vechi care au primit vizualizări recente.
--      Soluție: Adaugă filtru pe publication_date pentru fiecare perioadă.
-- =====================================================

-- Elimină funcția existentă cu semnătura (TEXT, INT)
DROP FUNCTION IF EXISTS public.get_most_read_stiri(TEXT, INT);

-- Recreează funcția cu filtrare corectă pe publication_date
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
  -- Total agregat (all-time)
  IF p_period IS NULL OR p_period = '' OR lower(p_period) IN ('all', 'total') THEN
    RETURN QUERY
    SELECT s.id, s.title, s.publication_date, s.content, s.created_at, s.filename, COALESCE(s.view_count, 0) AS view_count
    FROM public.stiri s
    ORDER BY COALESCE(s.view_count, 0) DESC, s.id DESC
    LIMIT p_limit;

  -- Ultimele 24 de ore (aliasuri: 24h, 1d, day)
  -- Filtrează și după publication_date >= ultimele 24h
  ELSIF lower(p_period) IN ('24h', '1d', 'day') THEN
    RETURN QUERY
    SELECT s.id, s.title, s.publication_date, s.content, s.created_at, s.filename,
           COALESCE(COUNT(nv.id), 0) AS view_count
    FROM public.stiri s
    LEFT JOIN public.news_views nv ON nv.news_id = s.id AND nv.viewed_at >= NOW() - INTERVAL '24 hours'
    WHERE s.publication_date >= CURRENT_DATE - INTERVAL '1 day'
    GROUP BY s.id
    ORDER BY COALESCE(COUNT(nv.id), 0) DESC, s.id DESC
    LIMIT p_limit;

  -- Ultimele 7 zile (aliasuri: 7d, 1w, week)
  -- Filtrează și după publication_date >= ultimele 7 zile
  ELSIF lower(p_period) IN ('7d', '1w', 'week') THEN
    RETURN QUERY
    SELECT s.id, s.title, s.publication_date, s.content, s.created_at, s.filename,
           COALESCE(COUNT(nv.id), 0) AS view_count
    FROM public.stiri s
    LEFT JOIN public.news_views nv ON nv.news_id = s.id AND nv.viewed_at >= NOW() - INTERVAL '7 days'
    WHERE s.publication_date >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY s.id
    ORDER BY COALESCE(COUNT(nv.id), 0) DESC, s.id DESC
    LIMIT p_limit;

  -- Ultimele 30 de zile (aliasuri: 30d, 30days, 1m, month)
  -- Filtrează și după publication_date >= ultimele 30 zile
  ELSIF lower(p_period) IN ('30d', '30days', '1m', 'month') THEN
    RETURN QUERY
    SELECT s.id, s.title, s.publication_date, s.content, s.created_at, s.filename,
           COALESCE(COUNT(nv.id), 0) AS view_count
    FROM public.stiri s
    LEFT JOIN public.news_views nv ON nv.news_id = s.id AND nv.viewed_at >= NOW() - INTERVAL '30 days'
    WHERE s.publication_date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY s.id
    ORDER BY COALESCE(COUNT(nv.id), 0) DESC, s.id DESC
    LIMIT p_limit;

  -- Fallback: total agregat
  ELSE
    RETURN QUERY
    SELECT s.id, s.title, s.publication_date, s.content, s.created_at, s.filename, COALESCE(s.view_count, 0) AS view_count
    FROM public.stiri s
    ORDER BY COALESCE(s.view_count, 0) DESC, s.id DESC
    LIMIT p_limit;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_most_read_stiri(TEXT, INT) IS 'Returnează cele mai citite știri pe perioadă, filtrând atât după vizualizări cât și după data publicării: 24h/1d/day, 7d/1w/week, 30d/30days/1m/month sau all-time.';
