-- =====================================================
-- MIGRAȚIE 009: Index pentru căutarea după content.keywords
-- =====================================================

-- Creează un index GIN pe câmpul JSONB content->'keywords' pentru interogări rapide cu @>
CREATE INDEX IF NOT EXISTS idx_stiri_content_keywords_gin
ON public.stiri
USING GIN ((content->'keywords'));

COMMENT ON INDEX idx_stiri_content_keywords_gin
IS 'Index GIN pentru filtrări de tip content @> {"keywords": [..]}';


