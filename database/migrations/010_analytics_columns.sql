-- ==============================================
-- 010 - Adăugare coloane analytics pe `stiri`
-- - topics: JSONB[] de obiecte (lista topicuri cu scoruri)
-- - entities: JSONB[] de obiecte (entități NER extrase)
-- + indexuri GIN pentru performanță la interogări
-- ==============================================

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.stiri
      ADD COLUMN IF NOT EXISTS topics JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS entities JSONB NOT NULL DEFAULT '[]'::jsonb;
  EXCEPTION WHEN undefined_table THEN
    -- În unele medii, schema poate fi aplicată din `schema.sql` direct
    NULL;
  END;
END $$;

-- Indexuri GIN pentru câmpurile JSONB
CREATE INDEX IF NOT EXISTS idx_stiri_topics_gin ON public.stiri USING GIN (topics);
CREATE INDEX IF NOT EXISTS idx_stiri_entities_gin ON public.stiri USING GIN (entities);

COMMENT ON COLUMN public.stiri.topics IS 'Lista de topicuri detectate pentru știre, ex: [{"topic_id": 12, "label": "Legislație Mediu", "score": 0.72}]';
COMMENT ON COLUMN public.stiri.entities IS 'Lista de entități NER extrase din text, ex: [{"text": "Ministerul Finanțelor", "label": "ORG", "start": 10, "end": 34}]';


