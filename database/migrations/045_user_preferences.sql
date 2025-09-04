-- =====================================================
-- MIGRAȚIE 045: User Preferences & Profile Extensions
-- =====================================================
-- Scop: Implementarea sistemului de preferințe utilizator și extinderea profilului
-- pentru Feature 1: Identitate Utilizator & Nucleu de Personalizare

-- =====================================================
-- 1. CREAREA TABELEI USER_PREFERENCES
-- =====================================================

-- Tabela pentru preferințele utilizatorilor
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    preferred_categories JSONB DEFAULT '[]' NOT NULL,
    notification_settings JSONB DEFAULT '{}' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Comentarii pentru documentație
COMMENT ON TABLE user_preferences IS 'Preferințele utilizatorilor pentru personalizarea conținutului';
COMMENT ON COLUMN user_preferences.preferred_categories IS 'Lista categoriilor preferate de utilizator (JSON array)';
COMMENT ON COLUMN user_preferences.notification_settings IS 'Setările de notificare ale utilizatorului (JSON object)';

-- =====================================================
-- 2. EXTINDEREA TABELEI PROFILES
-- =====================================================

-- Adăugare câmpuri noi la tabela profiles pentru profil complet
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Comentarii pentru noile coloane
COMMENT ON COLUMN profiles.display_name IS 'Numele de afișare al utilizatorului';
COMMENT ON COLUMN profiles.avatar_url IS 'URL-ul avatarului utilizatorului';

-- =====================================================
-- 3. INDECȘI PENTRU PERFORMANȚĂ
-- =====================================================

-- Index GIN pentru căutarea eficientă în categorii preferate
CREATE INDEX IF NOT EXISTS idx_user_preferences_categories 
ON user_preferences USING GIN (preferred_categories);

-- Index pentru optimizarea interogărilor pe notification_settings
CREATE INDEX IF NOT EXISTS idx_user_preferences_notifications 
ON user_preferences USING GIN (notification_settings);

-- Index pentru display_name pentru căutare utilizatori
CREATE INDEX IF NOT EXISTS idx_profiles_display_name 
ON profiles(display_name) 
WHERE display_name IS NOT NULL;

-- =====================================================
-- 4. FUNCȚII UTILITARE
-- =====================================================

-- Funcția pentru obținerea preferințelor unui utilizator
CREATE OR REPLACE FUNCTION public.get_user_preferences(user_uuid UUID)
RETURNS TABLE(
    preferred_categories JSONB,
    notification_settings JSONB,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT 
        up.preferred_categories,
        up.notification_settings,
        up.created_at,
        up.updated_at
    FROM public.user_preferences up
    WHERE up.id = user_uuid;
$$;

COMMENT ON FUNCTION public.get_user_preferences(UUID) 
IS 'Returnează preferințele unui utilizator specificat';

-- Funcția pentru actualizarea preferințelor unui utilizator
CREATE OR REPLACE FUNCTION public.update_user_preferences(
    user_uuid UUID,
    new_categories JSONB DEFAULT NULL,
    new_notifications JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Upsert preferințele utilizatorului
    INSERT INTO public.user_preferences (id, preferred_categories, notification_settings)
    VALUES (
        user_uuid,
        COALESCE(new_categories, '[]'::jsonb),
        COALESCE(new_notifications, '{}'::jsonb)
    )
    ON CONFLICT (id) 
    DO UPDATE SET
        preferred_categories = COALESCE(new_categories, user_preferences.preferred_categories),
        notification_settings = COALESCE(new_notifications, user_preferences.notification_settings),
        updated_at = NOW();
    
    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.update_user_preferences(UUID, JSONB, JSONB) 
IS 'Actualizează preferințele unui utilizator (upsert)';

-- Funcția pentru obținerea știrilor personalizate
CREATE OR REPLACE FUNCTION public.get_personalized_stiri(
    user_uuid UUID,
    p_limit INT DEFAULT 10,
    p_offset INT DEFAULT 0,
    p_order_by TEXT DEFAULT 'publication_date',
    p_order_dir TEXT DEFAULT 'desc'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_categories JSONB;
    v_order_by TEXT := LOWER(COALESCE(p_order_by, 'publication_date'));
    v_order_dir TEXT := LOWER(COALESCE(p_order_dir, 'desc'));
    v_sql TEXT;
    v_result JSONB;
BEGIN
    -- Obține categoriile preferate ale utilizatorului
    SELECT preferred_categories INTO v_categories
    FROM public.user_preferences
    WHERE id = user_uuid;
    
    -- Validare coloane sortare
    IF v_order_by NOT IN ('publication_date', 'created_at', 'title', 'id', 'view_count') THEN
        v_order_by := 'publication_date';
    END IF;
    IF v_order_dir NOT IN ('asc', 'desc') THEN
        v_order_dir := 'desc';
    END IF;
    
    -- Construiește query-ul SQL
    IF v_categories IS NOT NULL AND jsonb_array_length(v_categories) > 0 THEN
        -- Filtrează pe categorii preferate
        v_sql := format($f$
            WITH filtered AS (
                SELECT s.*
                FROM public.stiri s
                WHERE s.content ->> 'category' = ANY(
                    SELECT jsonb_array_elements_text(%L::jsonb)
                )
            ),
            counted AS (
                SELECT COUNT(*)::BIGINT AS total_count FROM filtered
            ),
            paged AS (
                SELECT * FROM filtered
                ORDER BY %I %s, id ASC
                LIMIT %s OFFSET %s
            )
            SELECT jsonb_build_object(
                'items', COALESCE((SELECT jsonb_agg(to_jsonb(p.*)) FROM paged p), '[]'::jsonb),
                'total_count', (SELECT total_count FROM counted)
            )
        $f$, v_categories, v_order_by, upper(v_order_dir), p_limit, p_offset);
    ELSE
        -- Returnează toate știrile dacă nu are preferințe
        v_sql := format($f$
            WITH counted AS (
                SELECT COUNT(*)::BIGINT AS total_count FROM public.stiri
            ),
            paged AS (
                SELECT * FROM public.stiri
                ORDER BY %I %s, id ASC
                LIMIT %s OFFSET %s
            )
            SELECT jsonb_build_object(
                'items', COALESCE((SELECT jsonb_agg(to_jsonb(p.*)) FROM paged p), '[]'::jsonb),
                'total_count', (SELECT total_count FROM counted)
            )
        $f$, v_order_by, upper(v_order_dir), p_limit, p_offset);
    END IF;
    
    EXECUTE v_sql INTO v_result;
    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_personalized_stiri(UUID, INT, INT, TEXT, TEXT) 
IS 'Returnează știri personalizate pe baza preferințelor utilizatorului';

-- =====================================================
-- 5. TRIGGER-URI PENTRU ACTUALIZAREA AUTOMATĂ
-- =====================================================

-- Trigger pentru actualizarea automată a updated_at în user_preferences
DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;
CREATE TRIGGER update_user_preferences_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 6. ACTIVAREA ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Activarea RLS pentru tabela user_preferences
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. POLITICI DE SECURITATE (RLS POLICIES)
-- =====================================================

-- Politici pentru tabela user_preferences
-- Permite utilizatorilor să-și citească propriile preferințe
DROP POLICY IF EXISTS "Users can read own preferences" ON user_preferences;
CREATE POLICY "Users can read own preferences" ON user_preferences
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- Permite utilizatorilor să-și insereze propriile preferințe
DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
CREATE POLICY "Users can insert own preferences" ON user_preferences
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

-- Permite utilizatorilor să-și actualizeze propriile preferințe
DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
CREATE POLICY "Users can update own preferences" ON user_preferences
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Blochează ștergerea preferințelor pentru utilizatori
DROP POLICY IF EXISTS "Users cannot delete preferences" ON user_preferences;
CREATE POLICY "Users cannot delete preferences" ON user_preferences
    FOR DELETE
    TO authenticated
    USING (false);

-- =====================================================
-- 8. VERIFICĂRI DE SECURITATE
-- =====================================================

-- Verificare că RLS este activat pentru user_preferences
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE tablename = 'user_preferences' 
        AND rowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS nu este activat pentru tabela user_preferences';
    END IF;
END $$;

-- =====================================================
-- 9. DATE DE TEST (OPȚIONAL - DOAR PENTRU DEZVOLTARE)
-- =====================================================

-- Comentat pentru producție - decomentează doar pentru testare
/*
-- Inserare preferințe de test pentru un utilizator existent
-- Înlocuiește 'test-user-uuid' cu un UUID real din auth.users
INSERT INTO user_preferences (id, preferred_categories, notification_settings)
VALUES (
    'test-user-uuid'::uuid,
    '["Fiscalitate", "Justiție", "Sănătate"]'::jsonb,
    '{"email_notifications": true, "push_notifications": false}'::jsonb
) ON CONFLICT (id) DO NOTHING;
*/

-- =====================================================
-- 10. COMENTARII FINALE
-- =====================================================

-- Log pentru confirmarea aplicării migrației
DO $$
BEGIN
    RAISE NOTICE 'Migrația 045_user_preferences aplicată cu succes!';
    RAISE NOTICE 'Tabele create: user_preferences';
    RAISE NOTICE 'Coloane adăugate la profiles: display_name, avatar_url';
    RAISE NOTICE 'Funcții create: get_user_preferences, update_user_preferences, get_personalized_stiri';
    RAISE NOTICE 'Politici RLS configurate pentru securitate';
END $$;
