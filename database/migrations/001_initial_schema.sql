-- =====================================================
-- MIGRAȚIE 001: SCHEMA INIȚIALĂ
-- =====================================================

-- Pasul 1: Activarea extensiilor necesare
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Pasul 2: Crearea tabelelor
-- Tabela pentru știri
CREATE TABLE IF NOT EXISTS stiri (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    title TEXT NOT NULL,
    publication_date DATE NOT NULL,
    content JSONB NOT NULL
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

-- Pasul 3: Crearea indecșilor pentru performanță
-- Index pentru optimizarea interogărilor de știri
CREATE INDEX IF NOT EXISTS idx_stiri_publication_date ON stiri(publication_date DESC);
CREATE INDEX IF NOT EXISTS idx_stiri_created_at ON stiri(created_at DESC);

-- Index compozit pentru rate limiting
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_timestamp ON usage_logs(user_id, request_timestamp DESC);

-- Index pentru optimizarea interogărilor de profile
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_tier ON profiles(subscription_tier);

-- Pasul 4: Crearea funcțiilor utilitare
-- Funcția pentru crearea automată a profilului
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, subscription_tier)
    VALUES (NEW.id, 'free');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Funcția pentru actualizarea automată a updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

-- Pasul 5: Crearea trigger-urilor
-- Trigger-ul pentru a popula automat tabela profiles
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger-ul pentru actualizarea automată a updated_at în profiles
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Pasul 6: Activarea Row Level Security (RLS)
ALTER TABLE stiri ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- Pasul 7: Crearea politicilor de securitate (RLS Policies)
-- Politici pentru tabela stiri
DROP POLICY IF EXISTS "Allow authenticated users to read stiri" ON stiri;
CREATE POLICY "Allow authenticated users to read stiri" ON stiri
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Block all modifications on stiri" ON stiri;
CREATE POLICY "Block all modifications on stiri" ON stiri
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);

-- Politici pentru tabela profiles
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile" ON profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Politici pentru tabela usage_logs
DROP POLICY IF EXISTS "Block all operations on usage_logs" ON usage_logs;
CREATE POLICY "Block all operations on usage_logs" ON usage_logs
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);

-- Pasul 8: Adăugarea comentariilor pentru documentație
COMMENT ON TABLE stiri IS 'Tabela principală pentru știrile din Monitorul Oficial';
COMMENT ON TABLE profiles IS 'Profilele utilizatorilor cu informații despre abonament';
COMMENT ON TABLE usage_logs IS 'Log pentru rate limiting - accesibil doar prin service_role';
COMMENT ON FUNCTION get_user_request_count_24h(UUID) IS 'Returnează numărul de cereri ale unui utilizator în ultimele 24 de ore';
COMMENT ON FUNCTION get_user_subscription_tier(UUID) IS 'Returnează tier-ul de abonament al unui utilizator';
