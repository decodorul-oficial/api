-- =====================================================
-- MIGRAȚIA 036: CORECTAREA FUNCȚIEI PENTRU DOCUMENTE EXTERNE
-- =====================================================
-- Corectează erorile din funcția update_external_document_mention

CREATE OR REPLACE FUNCTION public.update_external_document_mention(
    p_identifier TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_normalized JSONB;
BEGIN
    -- Normalizează identificatorul
    v_normalized := public.normalize_legislative_identifier(p_identifier);
    
    UPDATE public.external_legislative_documents
    SET 
        last_mentioned_at = NOW(),
        mention_count = mention_count + 1,
        updated_at = NOW()
    WHERE identifier = p_identifier;
    
    -- Dacă nu există, inserează un nou document extern
    IF NOT FOUND THEN
        INSERT INTO public.external_legislative_documents (
            identifier,
            normalized_identifier,
            document_type,
            document_number,
            document_year
        ) VALUES (
            p_identifier,
            v_normalized,
            (v_normalized->>'type'),
            (v_normalized->>'number'),
            (v_normalized->>'year')
        );
    END IF;
END;
$$;

COMMENT ON FUNCTION public.update_external_document_mention(TEXT) IS 'Actualizează sau creează documentul extern cu tracking-ul mențiunilor';
