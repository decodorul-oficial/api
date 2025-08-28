-- =====================================================
-- MIGRAȚIE 019: Index pe content->>'category' pentru filtrare performantă
-- =====================================================

-- Asigură extensia unaccent (deja adăugată în 007), dar nu strică să fie idempotent
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Index funcțional pe expresia JSONB content->>'category' pentru egalitate și ILIKE
-- 1) Index BTree pe lower(immutable_unaccent(content->>'category')) pentru where ILIKE/equality normalizată
CREATE INDEX IF NOT EXISTS idx_stiri_category_unaccent_lower
ON public.stiri (
  public.immutable_unaccent(lower((content ->> 'category')))
);

-- 2) Index trigram pentru potriviri partiale (dacă se folosesc în viitor)
CREATE INDEX IF NOT EXISTS idx_stiri_category_unaccent_trgm
ON public.stiri USING GIN (
  public.immutable_unaccent(lower((content ->> 'category'))) gin_trgm_ops
);

COMMENT ON INDEX public.idx_stiri_category_unaccent_lower IS 'Index pentru filtrarea pe content->>category insensibil la diacritice/caz';
COMMENT ON INDEX public.idx_stiri_category_unaccent_trgm IS 'Index trigram pentru match-uri partiale pe category';


