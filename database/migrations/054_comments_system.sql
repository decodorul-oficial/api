-- =====================================================
-- MIGRAȚIE 054: SISTEM DE COMENTARII
-- =====================================================
-- Această migrație implementează sistemul de comentarii pentru utilizatorii
-- cu abonament activ (inclusiv Trial) la știri și sinteze zilnice

-- =====================================================
-- 1. CREAREA TABELELOR
-- =====================================================

-- Tabela principală pentru comentarii
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (length(content) >= 1 AND length(content) <= 2000),
    parent_type TEXT NOT NULL CHECK (parent_type IN ('stire', 'synthesis')),
    parent_id TEXT NOT NULL,
    is_edited BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Tabela pentru istoricul editărilor
CREATE TABLE IF NOT EXISTS comment_edits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    previous_content TEXT NOT NULL,
    edited_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- 2. INDECȘI PENTRU PERFORMANȚĂ
-- =====================================================

-- Index pentru căutarea comentariilor după părinte
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_type, parent_id);

-- Index pentru căutarea comentariilor după utilizator
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);

-- Index pentru sortarea comentariilor după data creării
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC);

-- Index pentru istoricul editărilor
CREATE INDEX IF NOT EXISTS idx_comment_edits_comment_id ON comment_edits(comment_id);

-- Index compozit pentru performanță optimă la interogări
CREATE INDEX IF NOT EXISTS idx_comments_parent_created ON comments(parent_type, parent_id, created_at DESC);

-- =====================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Activarea RLS pentru tabelele de comentarii
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_edits ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. POLITICI DE SECURITATE
-- =====================================================

-- Politică pentru citirea comentariilor - toți utilizatorii autentificați
DROP POLICY IF EXISTS "Users can read all comments" ON comments;
CREATE POLICY "Users can read all comments" ON comments
    FOR SELECT
    TO authenticated
    USING (true);

-- Politică pentru crearea comentariilor - doar utilizatorii cu abonament activ sau trial
DROP POLICY IF EXISTS "Users can create comments with active subscription" ON comments;
CREATE POLICY "Users can create comments with active subscription" ON comments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND
            (p.subscription_tier IN ('pro', 'enterprise') OR
             (p.trial_end IS NOT NULL AND p.trial_end > NOW()))
        )
    );

-- Politică pentru actualizarea comentariilor - doar proprietarul
DROP POLICY IF EXISTS "Users can update own comments" ON comments;
CREATE POLICY "Users can update own comments" ON comments
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Politică pentru ștergerea comentariilor - doar proprietarul
DROP POLICY IF EXISTS "Users can delete own comments" ON comments;
CREATE POLICY "Users can delete own comments" ON comments
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Politici pentru istoricul editărilor
DROP POLICY IF EXISTS "Users can read comment edits for own comments" ON comment_edits;
CREATE POLICY "Users can read comment edits for own comments" ON comment_edits
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM comments c
            WHERE c.id = comment_id AND c.user_id = auth.uid()
        )
    );

-- Blocarea tuturor operațiunilor de modificare pentru istoricul editărilor
DROP POLICY IF EXISTS "Block all modifications on comment_edits" ON comment_edits;
CREATE POLICY "Block all modifications on comment_edits" ON comment_edits
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);

-- =====================================================
-- 5. TRIGGER-URI PENTRU ACTUALIZAREA TIMESTAMP-URILOR
-- =====================================================

-- Trigger pentru actualizarea automată a updated_at în comments
DROP TRIGGER IF EXISTS update_comments_updated_at ON comments;
CREATE TRIGGER update_comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 6. FUNCȚII UTILITARE
-- =====================================================

-- Funcție pentru validarea existenței părintelui
CREATE OR REPLACE FUNCTION validate_comment_parent(
    p_parent_type TEXT,
    p_parent_id TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    IF p_parent_type = 'stire' THEN
        RETURN EXISTS (
            SELECT 1 FROM stiri WHERE id = p_parent_id::BIGINT
        );
    ELSIF p_parent_type = 'synthesis' THEN
        RETURN EXISTS (
            SELECT 1 FROM daily_syntheses WHERE id = p_parent_id::UUID
        );
    ELSE
        RETURN FALSE;
    END IF;
END;
$$;

-- Funcție pentru obținerea statisticilor comentariilor
CREATE OR REPLACE FUNCTION get_comment_stats(
    p_parent_type TEXT,
    p_parent_id TEXT
) RETURNS TABLE(
    total_comments BIGINT,
    unique_users BIGINT,
    edited_comments BIGINT,
    latest_comment TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_comments,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) FILTER (WHERE is_edited = true) as edited_comments,
        MAX(created_at) as latest_comment
    FROM comments
    WHERE parent_type = p_parent_type 
      AND parent_id = p_parent_id;
END;
$$;

-- =====================================================
-- 7. COMENTARII PENTRU DOCUMENTAȚIE
-- =====================================================

COMMENT ON TABLE comments IS 'Comentarii ale utilizatorilor cu abonament activ la știri și sinteze';
COMMENT ON TABLE comment_edits IS 'Istoricul editărilor comentariilor pentru audit și transparență';

COMMENT ON COLUMN comments.parent_type IS 'Tipul părintelui: stire sau synthesis';
COMMENT ON COLUMN comments.parent_id IS 'ID-ul știrii sau sintezei la care se referă comentariul';
COMMENT ON COLUMN comments.content IS 'Conținutul comentariului (1-2000 caractere)';
COMMENT ON COLUMN comments.is_edited IS 'Indică dacă comentariul a fost editat';
COMMENT ON COLUMN comments.edited_at IS 'Data și ora ultimei editări';

COMMENT ON FUNCTION validate_comment_parent(TEXT, TEXT) IS 'Validează existența părintelui comentariului';
COMMENT ON FUNCTION get_comment_stats(TEXT, TEXT) IS 'Returnează statistici despre comentariile unui părinte';

-- =====================================================
-- 8. VERIFICĂRI DE SECURITATE
-- =====================================================

-- Verificare că RLS este activat
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE tablename = 'comments' 
        AND rowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS nu este activat pentru tabela comments';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE tablename = 'comment_edits' 
        AND rowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS nu este activat pentru tabela comment_edits';
    END IF;
END $$;

-- =====================================================
-- 9. DATE DE TEST (OPȚIONAL - DOAR PENTRU DEVELOPMENT)
-- =====================================================

-- Comentariile de test vor fi adăugate prin API-ul GraphQL
-- pentru a respecta politicile de securitate

-- =====================================================
-- COMPLETION MESSAGE
-- =====================================================

-- Migrația a fost completată cu succes
-- Sistemul de comentarii este acum disponibil pentru utilizatorii cu abonament activ
