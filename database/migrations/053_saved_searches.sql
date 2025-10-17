-- =====================================================
-- MIGRAȚIE 053: Tabela pentru căutări salvate (saved searches)
-- =====================================================

-- Tabela pentru căutările salvate de utilizatori
CREATE TABLE IF NOT EXISTS saved_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    search_params JSONB NOT NULL,
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Constraint pentru numele unic per utilizator
    CONSTRAINT unique_search_name_per_user UNIQUE (user_id, name)
);

-- Indexuri pentru performanță
CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id ON saved_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_created_at ON saved_searches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_searches_is_favorite ON saved_searches(is_favorite) WHERE is_favorite = TRUE;

-- RLS (Row Level Security)
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

-- Policy: utilizatorii pot accesa doar propriile căutări salvate
CREATE POLICY "Users can access own saved searches" ON saved_searches
    FOR ALL TO authenticated USING (user_id = auth.uid());

-- Funcție pentru actualizarea automată a updated_at
CREATE OR REPLACE FUNCTION update_saved_search_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pentru actualizarea automată a updated_at
CREATE TRIGGER trigger_update_saved_search_updated_at
    BEFORE UPDATE ON saved_searches
    FOR EACH ROW
    EXECUTE FUNCTION update_saved_search_updated_at();

-- Comentarii
COMMENT ON TABLE saved_searches IS 'Căutări salvate de utilizatori cu abonament activ';
COMMENT ON COLUMN saved_searches.name IS 'Numele dat de utilizator căutării salvate';
COMMENT ON COLUMN saved_searches.description IS 'Descrierea opțională a căutării';
COMMENT ON COLUMN saved_searches.search_params IS 'Parametrii de căutare în format JSON (query, keywords, date, etc.)';
COMMENT ON COLUMN saved_searches.is_favorite IS 'Dacă căutarea este marcată ca favorită';
