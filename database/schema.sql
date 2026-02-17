-- =====================================================
-- SCHEMA PENTRU API-UL GRAPHQL MONITORUL OFICIAL
-- =====================================================

-- Activarea extensiilor necesare
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. CREAREA TABELELOR
-- =====================================================

-- Tabela pentru știri
CREATE TABLE IF NOT EXISTS stiri (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    title TEXT NOT NULL,
    publication_date DATE NOT NULL,
    content JSONB NOT NULL,
    topics JSONB NOT NULL DEFAULT '[]',
    entities JSONB NOT NULL DEFAULT '[]',
    filename TEXT,
    view_count BIGINT DEFAULT 0 NOT NULL
);

-- Tabela pentru profilele utilizatorilor
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_tier TEXT DEFAULT 'free' NOT NULL CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Tabela pentru logarea utilizării API-ului (rate limiting)
CREATE TABLE IF NOT EXISTS usage_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    request_timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- 2. INDECȘI PENTRU PERFORMANȚĂ
-- =====================================================

-- Index pentru optimizarea interogărilor de știri
CREATE INDEX IF NOT EXISTS idx_stiri_publication_date ON stiri(publication_date DESC);
CREATE INDEX IF NOT EXISTS idx_stiri_created_at ON stiri(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stiri_view_count ON stiri(view_count DESC);
CREATE INDEX IF NOT EXISTS idx_stiri_topics_gin ON public.stiri USING GIN (topics);
CREATE INDEX IF NOT EXISTS idx_stiri_entities_gin ON public.stiri USING GIN (entities);

-- Index compozit pentru rate limiting - optimizare pentru interogările pe user_id și timestamp
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_timestamp ON usage_logs(user_id, request_timestamp DESC);

-- Index pentru optimizarea interogărilor de profile
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_tier ON profiles(subscription_tier);

-- =====================================================
-- 3. FUNCȚIA ȘI TRIGGER-UL PENTRU AUTO-POPULARE PROFILES
-- =====================================================

-- Funcția pentru crearea automată a profilului
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, subscription_tier)
    VALUES (NEW.id, 'free');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Funcția pentru tracking vizualizări cu deduplicare pe 24h
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

-- Funcția pentru obținerea celor mai citite știri (agregat sau pe perioadă)
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

-- Trigger-ul pentru a popula automat tabela profiles
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 4. FUNCȚIA PENTRU ACTUALIZAREA TIMESTAMP-ULUI
-- =====================================================

-- Funcția pentru actualizarea automată a updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger-ul pentru actualizarea automată a updated_at în profiles
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 5. ACTIVAREA ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Activarea RLS pentru toate tabelele
ALTER TABLE stiri ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_views ENABLE ROW LEVEL SECURITY;

-- Tabela pentru vizualizări știri
CREATE TABLE IF NOT EXISTS public.news_views (
  id BIGSERIAL PRIMARY KEY,
  news_id BIGINT NOT NULL REFERENCES public.stiri(id) ON DELETE CASCADE,
  ip_address INET NOT NULL,
  user_agent TEXT,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id TEXT
);

-- Indexuri pentru news_views
CREATE INDEX IF NOT EXISTS idx_news_views_news_id ON public.news_views(news_id);
CREATE INDEX IF NOT EXISTS idx_news_views_ip_address ON public.news_views(ip_address);
CREATE INDEX IF NOT EXISTS idx_news_views_viewed_at ON public.news_views(viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_views_session_id ON public.news_views(session_id);

-- =====================================================
-- 6. POLITICI DE SECURITATE (RLS POLICIES)
-- =====================================================

-- Politici pentru tabela stiri
-- Permite citirea știrilor doar utilizatorilor autentificați
DROP POLICY IF EXISTS "Allow authenticated users to read stiri" ON stiri;
CREATE POLICY "Allow authenticated users to read stiri" ON stiri
    FOR SELECT
    TO authenticated
    USING (true);

-- Blochează toate operațiunile de modificare pentru utilizatori
DROP POLICY IF EXISTS "Block all modifications on stiri" ON stiri;
CREATE POLICY "Block all modifications on stiri" ON stiri
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);

-- Politici pentru tabela profiles
-- Permite utilizatorilor să-și citească propriul profil
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile" ON profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- Permite utilizatorilor să-și modifice propriul profil
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Politici pentru tabela usage_logs
-- Blochează toate operațiunile pentru utilizatori obișnuiți
-- Doar API-ul cu cheia service_role va avea acces
DROP POLICY IF EXISTS "Block all operations on usage_logs" ON usage_logs;
CREATE POLICY "Block all operations on usage_logs" ON usage_logs
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);

-- Politici pentru tabela news_views
DROP POLICY IF EXISTS "Block all operations on news_views" ON public.news_views;
CREATE POLICY "Block all operations on news_views" ON public.news_views
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);

-- =====================================================
-- 7. FUNCȚII UTILITARE PENTRU API
-- =====================================================

-- Funcția pentru obținerea numărului de cereri în ultimele 24 de ore
CREATE OR REPLACE FUNCTION get_user_request_count_24h(user_uuid UUID)
RETURNS BIGINT AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM usage_logs
        WHERE user_id = user_uuid
        AND request_timestamp >= NOW() - INTERVAL '24 hours'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Funcția pentru obținerea tier-ului de abonament al unui utilizator
CREATE OR REPLACE FUNCTION get_user_subscription_tier(user_uuid UUID)
RETURNS TEXT AS $$
BEGIN
    RETURN (
        SELECT subscription_tier
        FROM profiles
        WHERE id = user_uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 8. COMENTARII PENTRU DOCUMENTAȚIE
-- =====================================================

COMMENT ON TABLE stiri IS 'Tabela principală pentru știrile din Monitorul Oficial';
COMMENT ON TABLE profiles IS 'Profilele utilizatorilor cu informații despre abonament';
COMMENT ON TABLE usage_logs IS 'Log pentru rate limiting - accesibil doar prin service_role';
COMMENT ON FUNCTION get_user_request_count_24h(UUID) IS 'Returnează numărul de cereri ale unui utilizator în ultimele 24 de ore';
COMMENT ON FUNCTION get_user_subscription_tier(UUID) IS 'Returnează tier-ul de abonament al unui utilizator';

-- Comentarii pentru news_views și view_count
COMMENT ON TABLE public.news_views IS 'Vizualizări individuale ale știrilor pentru analytics și deduplicare';
COMMENT ON COLUMN public.stiri.view_count IS 'Număr total de vizualizări agregate';

-- =====================================================
-- 9. VERIFICĂRI DE SECURITATE
-- =====================================================

-- Verificare că RLS este activat
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE tablename = 'stiri' 
        AND rowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS nu este activat pentru tabela stiri';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE tablename = 'profiles' 
        AND rowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS nu este activat pentru tabela profiles';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE tablename = 'usage_logs' 
        AND rowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS nu este activat pentru tabela usage_logs';
    END IF;
END $$;
