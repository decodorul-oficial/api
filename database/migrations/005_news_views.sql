-- =====================================================
-- MIGRAȚIE 005: Tracking vizualizări știri (news_views) + view_count
-- =====================================================

-- 1) Adăugare coloană view_count în tabela stiri
ALTER TABLE public.stiri
  ADD COLUMN IF NOT EXISTS view_count BIGINT DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.stiri.view_count IS 'Număr total de vizualizări agregate';

-- 2) Crearea tabelei news_views pentru tracking vizualizări individuale
CREATE TABLE IF NOT EXISTS public.news_views (
  id BIGSERIAL PRIMARY KEY,
  news_id BIGINT NOT NULL REFERENCES public.stiri(id) ON DELETE CASCADE,
  ip_address INET NOT NULL,
  user_agent TEXT,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id TEXT
);

COMMENT ON TABLE public.news_views IS 'Vizualizări individuale ale știrilor pentru analytics și deduplicare';
COMMENT ON COLUMN public.news_views.news_id IS 'Referință către știrea vizualizată';
COMMENT ON COLUMN public.news_views.ip_address IS 'Adresa IP a sursei vizualizării (pentru deduplicare)';
COMMENT ON COLUMN public.news_views.user_agent IS 'User agent-ul clientului (opțional)';
COMMENT ON COLUMN public.news_views.viewed_at IS 'Timestamp-ul vizualizării';
COMMENT ON COLUMN public.news_views.session_id IS 'ID de sesiune (opțional)';

-- 3) Indexuri pentru performanță
CREATE INDEX IF NOT EXISTS idx_news_views_news_id ON public.news_views(news_id);
CREATE INDEX IF NOT EXISTS idx_news_views_ip_address ON public.news_views(ip_address);
CREATE INDEX IF NOT EXISTS idx_news_views_viewed_at ON public.news_views(viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_views_session_id ON public.news_views(session_id);

-- Notă: deduplicarea pe o fereastră glisantă de 24h nu poate fi impusă direct cu un index unic.
-- Va fi implementată atomic în funcția track_news_view de mai jos.

-- 4) Activarea Row Level Security și politici stricte
ALTER TABLE public.news_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Block all operations on news_views" ON public.news_views;
CREATE POLICY "Block all operations on news_views" ON public.news_views
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- 5) Funcție atomică pentru tracking vizualizări cu deduplicare pe 24h
--    Returnează TRUE dacă s-a înregistrat vizualizarea și s-a incrementat view_count,
--    FALSE dacă a existat deja o vizualizare din același IP în ultimele 24h pentru aceeași știre.
CREATE OR REPLACE FUNCTION public.track_news_view(
  p_news_id BIGINT,
  p_ip TEXT,
  p_user_agent TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_inserted BOOLEAN := FALSE;
BEGIN
  PERFORM 1
  FROM public.news_views nv
  WHERE nv.news_id = p_news_id
    AND nv.ip_address = p_ip::inet
    AND nv.viewed_at >= NOW() - INTERVAL '24 hours'
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.news_views (news_id, ip_address, user_agent, session_id)
    VALUES (p_news_id, p_ip::inet, p_user_agent, p_session_id);

    UPDATE public.stiri
    SET view_count = COALESCE(view_count, 0) + 1
    WHERE id = p_news_id;

    v_inserted := TRUE;
  END IF;

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.track_news_view(BIGINT, TEXT, TEXT, TEXT) IS 'Înregistrează o vizualizare dacă nu există deja din același IP în ultimele 24h și incrementează view_count';

-- 6) Funcție pentru obținerea celor mai citite știri
--    p_period: valori suportate '' (sau NULL) pentru total agregat, '24h', '7d', '30d'
CREATE OR REPLACE FUNCTION public.get_most_read_stiri(
  p_period TEXT DEFAULT NULL,
  p_limit INT DEFAULT 10
) RETURNS TABLE(
  id BIGINT,
  title TEXT,
  publication_date DATE,
  content JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  filename TEXT,
  view_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF p_period IS NULL OR p_period = '' OR lower(p_period) = 'all' THEN
    RETURN QUERY
    SELECT s.id, s.title, s.publication_date, s.content, s.created_at, s.updated_at, s.filename, COALESCE(s.view_count, 0) AS view_count
    FROM public.stiri s
    ORDER BY COALESCE(s.view_count, 0) DESC, s.id DESC
    LIMIT p_limit;
  ELSIF lower(p_period) = '24h' THEN
    RETURN QUERY
    SELECT s.id, s.title, s.publication_date, s.content, s.created_at, s.updated_at, s.filename,
           COALESCE(COUNT(nv.id), 0) AS view_count
    FROM public.stiri s
    LEFT JOIN public.news_views nv ON nv.news_id = s.id AND nv.viewed_at >= NOW() - INTERVAL '24 hours'
    GROUP BY s.id
    ORDER BY COALESCE(COUNT(nv.id), 0) DESC, s.id DESC
    LIMIT p_limit;
  ELSIF lower(p_period) = '7d' THEN
    RETURN QUERY
    SELECT s.id, s.title, s.publication_date, s.content, s.created_at, s.updated_at, s.filename,
           COALESCE(COUNT(nv.id), 0) AS view_count
    FROM public.stiri s
    LEFT JOIN public.news_views nv ON nv.news_id = s.id AND nv.viewed_at >= NOW() - INTERVAL '7 days'
    GROUP BY s.id
    ORDER BY COALESCE(COUNT(nv.id), 0) DESC, s.id DESC
    LIMIT p_limit;
  ELSIF lower(p_period) = '30d' OR lower(p_period) = '30days' OR lower(p_period) = 'month' THEN
    RETURN QUERY
    SELECT s.id, s.title, s.publication_date, s.content, s.created_at, s.updated_at, s.filename,
           COALESCE(COUNT(nv.id), 0) AS view_count
    FROM public.stiri s
    LEFT JOIN public.news_views nv ON nv.news_id = s.id AND nv.viewed_at >= NOW() - INTERVAL '30 days'
    GROUP BY s.id
    ORDER BY COALESCE(COUNT(nv.id), 0) DESC, s.id DESC
    LIMIT p_limit;
  ELSE
    -- Perioadă necunoscută -> considerăm totalul agregat
    RETURN QUERY
    SELECT s.id, s.title, s.publication_date, s.content, s.created_at, s.updated_at, s.filename, COALESCE(s.view_count, 0) AS view_count
    FROM public.stiri s
    ORDER BY COALESCE(s.view_count, 0) DESC, s.id DESC
    LIMIT p_limit;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_most_read_stiri(TEXT, INT) IS 'Returnează lista celor mai citite știri, agregând după perioada specificată';


