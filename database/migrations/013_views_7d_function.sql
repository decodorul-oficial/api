-- ==============================================
-- 013 - Funcție pentru total vizualizări în 7 zile de la publicare
-- ==============================================

CREATE OR REPLACE FUNCTION public.get_views_in_first_7_days(p_news_id BIGINT)
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.news_views nv
  JOIN public.stiri s ON s.id = nv.news_id
  WHERE nv.news_id = p_news_id
    AND nv.viewed_at >= s.publication_date::timestamptz
    AND nv.viewed_at < s.publication_date::timestamptz + INTERVAL '7 days';
$$;

COMMENT ON FUNCTION public.get_views_in_first_7_days(BIGINT) IS 'Numărul de vizualizări în primele 7 zile de la publicare pentru o știre';


