-- =====================================================
-- MIGRAȚIE 004: Adăugare coloană filename la stiri
-- =====================================================

ALTER TABLE public.stiri
  ADD COLUMN IF NOT EXISTS filename TEXT;

COMMENT ON COLUMN public.stiri.filename IS 'Numele fișierului sursă, dacă este disponibil';


