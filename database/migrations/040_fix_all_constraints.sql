-- =====================================================
-- MIGRAȚIA 040: CORECTAREA TUTUROR CONSTRÂNGERILOR
-- =====================================================
-- Corectează toate constrângerile pentru a permite documente externe și erori

-- 1. Șterge constrângerile existente
ALTER TABLE public.legislative_connections 
DROP CONSTRAINT IF EXISTS check_target_document_null,
DROP CONSTRAINT IF EXISTS legislative_connections_relationship_type_check,
DROP CONSTRAINT IF EXISTS legislative_connections_extraction_method_check,
DROP CONSTRAINT IF EXISTS legislative_connections_target_document_id_fkey;

-- 2. Adaugă constrângerile corectate
-- Permite target_document_id NULL pentru documente externe și erori
ALTER TABLE public.legislative_connections 
ADD CONSTRAINT check_target_document_null 
CHECK (
    (target_document_id IS NOT NULL) OR 
    (target_document_id IS NULL AND relationship_type IN ('face referire la (extern)', 'eroare_extragere'))
);

-- Permite tipuri de relații pentru documente externe și erori
ALTER TABLE public.legislative_connections 
ADD CONSTRAINT legislative_connections_relationship_type_check
CHECK (
    relationship_type IN (
        'modifică', 'completează', 'abrogă', 'face referire la', 'derogă', 'suspendă',
        'face referire la (extern)', 'eroare_extragere'
    )
);

-- Permite metode de extragere pentru erori
ALTER TABLE public.legislative_connections 
ADD CONSTRAINT legislative_connections_extraction_method_check
CHECK (
    extraction_method IN ('automatic', 'manual', 'ai_enhanced', 'external_reference', 'error_handling')
);

-- 3. Adaugă foreign key condițional (doar când target_document_id nu este NULL)
-- Aceasta se face prin trigger în loc de constrângere directă

-- 4. Creează trigger-ul pentru validarea foreign key-ului
CREATE OR REPLACE FUNCTION public.validate_target_document_fk()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Verifică foreign key doar când target_document_id nu este NULL
    IF NEW.target_document_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.stiri WHERE id = NEW.target_document_id) THEN
            RAISE EXCEPTION 'target_document_id % nu există în tabela stiri', NEW.target_document_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Creează trigger-ul
DROP TRIGGER IF EXISTS validate_target_document_fk_trigger ON public.legislative_connections;
CREATE TRIGGER validate_target_document_fk_trigger
    BEFORE INSERT OR UPDATE ON public.legislative_connections
    FOR EACH ROW EXECUTE FUNCTION public.validate_target_document_fk();

COMMENT ON FUNCTION public.validate_target_document_fk() IS 'Validează foreign key-ul pentru target_document_id doar când nu este NULL';
