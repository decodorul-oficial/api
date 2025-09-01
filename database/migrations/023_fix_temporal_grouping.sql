-- =====================================================
-- MIGRAȚIE 023: Corectarea grupării temporale pentru legislativeActivityOverTime
-- =====================================================

-- Corectarea funcției get_legislative_activity_over_time pentru a folosi date_trunc
-- în loc de GROUP BY direct pe publication_date, asigurând agregarea corectă pe zi

-- Problema identificată: GROUP BY s.publication_date nu asigură agregarea corectă pe zi calendaristică
-- Soluția: Folosirea date_trunc('day', s.publication_date) pentru gruparea corectă

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

-- Verificare că funcția funcționează corect
DO $$
BEGIN
  RAISE NOTICE 'Funcția get_legislative_activity_over_time a fost corectată cu succes!';
  RAISE NOTICE 'Acum folosește date_trunc pentru gruparea corectă pe zi calendaristică.';
END $$;
