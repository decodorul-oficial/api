-- =====================================================
-- MIGRAȚIA 027: CORECTAREA REFERINȚEI LA CÂMPUL ENTITY
-- =====================================================
-- Corectează funcția extract_legislative_connections să folosească 'label' în loc de 'type'

CREATE OR REPLACE FUNCTION public.extract_legislative_connections(
    p_stire_id BIGINT,
    p_content TEXT,
    p_entities JSONB
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_entity RECORD;
    v_target_id BIGINT;
    v_relationship_type TEXT;
    v_confidence_score FLOAT;
    v_content_lower TEXT;
BEGIN
    -- Verifică dacă știrea există
    IF NOT EXISTS (SELECT 1 FROM public.stiri WHERE id = p_stire_id) THEN
        RETURN;
    END IF;
    
    v_content_lower := lower(p_content);
    
    -- Parcurge entitățile extrase din știre (CORECTAT: folosește 'label' în loc de 'type')
    FOR v_entity IN 
        SELECT * FROM jsonb_array_elements(p_entities)
        WHERE value->>'label' = 'WORK_OF_ART' 
           OR value->>'label' = 'LAW'
           OR value->>'label' = 'LEGISLATION'
           OR value->>'label' = 'ORGANIZATION'
    LOOP
        -- Caută documentul țintă în baza de date
        SELECT s.id INTO v_target_id
        FROM public.stiri s
        WHERE s.title ILIKE '%' || (v_entity.value->>'text') || '%'
           OR s.content->>'title' ILIKE '%' || (v_entity.value->>'text') || '%'
        ORDER BY s.publication_date DESC
        LIMIT 1;
        
        -- Dacă găsește un document țintă
        IF v_target_id IS NOT NULL AND v_target_id != p_stire_id THEN
            -- Determină tipul relației pe baza contextului
            v_relationship_type := 'face referire la';
            v_confidence_score := 0.6;
            
            -- Verifică cuvintele cheie pentru tipul relației
            IF v_content_lower LIKE '%modifică%' OR v_content_lower LIKE '%modificări%' THEN
                v_relationship_type := 'modifică';
                v_confidence_score := 0.8;
            ELSIF v_content_lower LIKE '%completează%' OR v_content_lower LIKE '%completări%' THEN
                v_relationship_type := 'completează';
                v_confidence_score := 0.8;
            ELSIF v_content_lower LIKE '%abrogă%' OR v_content_lower LIKE '%abrogări%' THEN
                v_relationship_type := 'abrogă';
                v_confidence_score := 0.8;
            ELSIF v_content_lower LIKE '%derogă%' OR v_content_lower LIKE '%derogări%' THEN
                v_relationship_type := 'derogă';
                v_confidence_score := 0.8;
            ELSIF v_content_lower LIKE '%suspendă%' OR v_content_lower LIKE '%suspendări%' THEN
                v_relationship_type := 'suspendă';
                v_confidence_score := 0.8;
            END IF;
            
            -- Inserează conexiunea
            INSERT INTO public.legislative_connections (
                source_document_id,
                target_document_id,
                relationship_type,
                confidence_score,
                extraction_method,
                metadata
            ) VALUES (
                p_stire_id,
                v_target_id,
                v_relationship_type,
                v_confidence_score,
                'automatic',
                jsonb_build_object(
                    'source_entity', v_entity.value,
                    'extraction_context', substring(p_content from greatest(1, position(v_entity.value->>'text' in p_content) - 100) for 200)
                )
            )
            ON CONFLICT (source_document_id, target_document_id, relationship_type) 
            DO UPDATE SET
                confidence_score = EXCLUDED.confidence_score,
                metadata = EXCLUDED.metadata,
                updated_at = NOW();
        END IF;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION public.extract_legislative_connections(BIGINT, TEXT, JSONB) IS 'Extrage automat conexiunile legislative din conținutul unei știri (corectat pentru câmpul label)';
