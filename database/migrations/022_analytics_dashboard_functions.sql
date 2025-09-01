-- =====================================================
-- MIGRAȚIE 022: Funcții pentru dashboard-ul de analitice
-- =====================================================

-- 1. Funcție pentru numărul total de acte în perioada specificată
CREATE OR REPLACE FUNCTION public.get_total_acts(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM public.stiri s
    WHERE s.publication_date >= p_start_date
      AND s.publication_date <= p_end_date
  );
END;
$$;

COMMENT ON FUNCTION public.get_total_acts(DATE, DATE)
IS 'Returnează numărul total de acte normative publicate în intervalul specificat';

-- 2. Funcție pentru activitatea legislativă în timp (pe zile)
CREATE OR REPLACE FUNCTION public.get_legislative_activity_over_time(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE(
  date TEXT,
  value BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    date_trunc('day', s.publication_date)::TEXT as date,
    COUNT(*)::BIGINT as value
  FROM public.stiri s
  WHERE s.publication_date >= p_start_date
    AND s.publication_date <= p_end_date
  GROUP BY date_trunc('day', s.publication_date)
  ORDER BY date_trunc('day', s.publication_date) ASC;
END;
$$;

COMMENT ON FUNCTION public.get_legislative_activity_over_time(DATE, DATE)
IS 'Returnează numărul de acte publicate pe fiecare zi din intervalul specificat, folosind date_trunc pentru agregare corectă pe zi calendaristică';

-- 3. Funcție pentru top ministere/instituții active
CREATE OR REPLACE FUNCTION public.get_top_active_ministries(
  p_start_date DATE,
  p_end_date DATE,
  p_limit INT DEFAULT 5
)
RETURNS TABLE(
  label TEXT,
  value BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(s.content->>'author', 'Necunoscut')::TEXT as label,
    COUNT(*)::BIGINT as value
  FROM public.stiri s
  WHERE s.publication_date >= p_start_date
    AND s.publication_date <= p_end_date
    AND s.content->>'author' IS NOT NULL
    AND trim(s.content->>'author') != ''
  GROUP BY s.content->>'author'
  ORDER BY COUNT(*) DESC, s.content->>'author' ASC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_top_active_ministries(DATE, DATE, INT)
IS 'Returnează top ministerele/instituțiile cu cel mai mare număr de acte publicate';

-- 4. Funcție pentru distribuția pe categorii
CREATE OR REPLACE FUNCTION public.get_distribution_by_category(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE(
  label TEXT,
  value BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(s.content->>'category', 'Necategorizat')::TEXT as label,
    COUNT(*)::BIGINT as value
  FROM public.stiri s
  WHERE s.publication_date >= p_start_date
    AND s.publication_date <= p_end_date
  GROUP BY s.content->>'category'
  ORDER BY COUNT(*) DESC, s.content->>'category' ASC;
END;
$$;

COMMENT ON FUNCTION public.get_distribution_by_category(DATE, DATE)
IS 'Returnează distribuția actelor normative pe categorii';

-- 5. Funcție pentru top cuvinte cheie
CREATE OR REPLACE FUNCTION public.get_top_keywords(
  p_start_date DATE,
  p_end_date DATE,
  p_limit INT DEFAULT 10
)
RETURNS TABLE(
  label TEXT,
  value BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    keyword::TEXT as label,
    COUNT(*)::BIGINT as value
  FROM public.stiri s,
       jsonb_array_elements_text(s.content->'keywords') as keyword
  WHERE s.publication_date >= p_start_date
    AND s.publication_date <= p_end_date
    AND s.content->'keywords' IS NOT NULL
    AND jsonb_typeof(s.content->'keywords') = 'array'
    AND keyword IS NOT NULL
    AND trim(keyword::TEXT) != ''
  GROUP BY keyword
  ORDER BY COUNT(*) DESC, keyword ASC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_top_keywords(DATE, DATE, INT)
IS 'Returnează top cuvintele cheie cele mai frecvente din actele normative';

-- 6. Funcție pentru actele cele mai menționate (entități WORK_OF_ART)
CREATE OR REPLACE FUNCTION public.get_top_mentioned_laws(
  p_start_date DATE,
  p_end_date DATE,
  p_limit INT DEFAULT 10
)
RETURNS TABLE(
  label TEXT,
  value BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    entity->>'text' as label,
    COUNT(*)::BIGINT as value
  FROM public.stiri s,
       jsonb_array_elements(s.entities) as entity
  WHERE s.publication_date >= p_start_date
    AND s.publication_date <= p_end_date
    AND s.entities IS NOT NULL
    AND jsonb_typeof(s.entities) = 'array'
    AND entity->>'label' = 'WORK_OF_ART'
    AND entity->>'text' IS NOT NULL
    AND trim(entity->>'text') != ''
  GROUP BY entity->>'text'
  ORDER BY COUNT(*) DESC, entity->>'text' ASC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_top_mentioned_laws(DATE, DATE, INT)
IS 'Returnează top actele normative cel mai des menționate (entități WORK_OF_ART)';

-- 7. Funcție agregată pentru toate datele dashboard-ului (opțional - pentru optimizare)
CREATE OR REPLACE FUNCTION public.get_analytics_dashboard_data(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_acts', (SELECT public.get_total_acts(p_start_date, p_end_date)),
    'legislative_activity', (
      SELECT jsonb_agg(
        jsonb_build_object('date', date, 'value', value)
        ORDER BY date
      )
      FROM public.get_legislative_activity_over_time(p_start_date, p_end_date)
    ),
    'top_ministries', (
      SELECT jsonb_agg(
        jsonb_build_object('label', label, 'value', value)
        ORDER BY value DESC
      )
      FROM public.get_top_active_ministries(p_start_date, p_end_date, 5)
    ),
    'distribution_by_category', (
      SELECT jsonb_agg(
        jsonb_build_object('label', label, 'value', value)
        ORDER BY value DESC
      )
      FROM public.get_distribution_by_category(p_start_date, p_end_date)
    ),
    'top_keywords', (
      SELECT jsonb_agg(
        jsonb_build_object('label', label, 'value', value)
        ORDER BY value DESC
      )
      FROM public.get_top_keywords(p_start_date, p_end_date, 10)
    ),
    'top_mentioned_laws', (
      SELECT jsonb_agg(
        jsonb_build_object('label', label, 'value', value)
        ORDER BY value DESC
      )
      FROM public.get_top_mentioned_laws(p_start_date, p_end_date, 10)
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_analytics_dashboard_data(DATE, DATE)
IS 'Returnează toate datele pentru dashboard-ul de analitice într-un singur apel (optimizat)';

-- Indexuri suplimentare pentru optimizarea analiticelor (dacă nu există deja)
CREATE INDEX IF NOT EXISTS idx_stiri_publication_date_content_author 
ON public.stiri (publication_date, (content->>'author'));

CREATE INDEX IF NOT EXISTS idx_stiri_publication_date_content_category 
ON public.stiri (publication_date, (content->>'category'));

-- Index pentru entities cu filtrare pe label
CREATE INDEX IF NOT EXISTS idx_stiri_entities_work_of_art 
ON public.stiri USING GIN (entities) 
WHERE entities @> '[{"label": "WORK_OF_ART"}]';

-- Index pentru keywords
CREATE INDEX IF NOT EXISTS idx_stiri_content_keywords_publication_date 
ON public.stiri (publication_date) 
WHERE content->'keywords' IS NOT NULL AND jsonb_typeof(content->'keywords') = 'array';
