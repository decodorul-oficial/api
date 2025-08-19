-- ==============================================
-- 012 - Adăugare coloană predicted_views pe `stiri`
-- ==============================================

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.stiri
      ADD COLUMN IF NOT EXISTS predicted_views BIGINT;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
END $$;

CREATE INDEX IF NOT EXISTS idx_stiri_predicted_views ON public.stiri(predicted_views DESC NULLS LAST);

COMMENT ON COLUMN public.stiri.predicted_views IS 'Predicție pentru numărul total de vizualizări în primele 7 zile (ML)';


