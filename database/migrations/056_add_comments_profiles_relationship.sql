-- =====================================================
-- MIGRAȚIE 056: ADĂUGAREA RELAȚIEI EXPLICITE ÎNTRE COMMENTS ȘI PROFILES
-- =====================================================
-- Scop: Adăugarea unei relații explicite între comments și profiles pentru a permite join-uri în Supabase

-- Adăugarea unei coloane de referință explicită la profiles
ALTER TABLE comments 
ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;

-- Popularea coloanei profile_id cu valorile existente
UPDATE comments 
SET profile_id = user_id 
WHERE profile_id IS NULL;

-- Adăugarea unui index pentru performanță
CREATE INDEX IF NOT EXISTS idx_comments_profile_id ON comments(profile_id);

-- Comentariu pentru documentație
COMMENT ON COLUMN comments.profile_id IS 'Referință explicită la tabela profiles pentru join-uri Supabase';
