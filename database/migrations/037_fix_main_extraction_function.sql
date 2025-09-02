-- =====================================================
-- MIGRAȚIA 037: CORECTAREA FUNCȚIEI PRINCIPALE DE EXTRAGERE
-- =====================================================
-- Corectează erorile din funcția extract_legislative_connections

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
    v_resolved_document RECORD;
    v_external_identifier TEXT;
    v_connection_exists BOOLEAN;
    v_error_count INTEGER := 0;
    v_success_count INTEGER := 0;
    v_external_count INTEGER := 0;
BEGIN
    -- Verifică dacă știrea există
    IF NOT EXISTS (SELECT 1 FROM public.stiri WHERE id = p_stire_id) THEN
        RAISE NOTICE 'Știrea cu ID % nu există', p_stire_id;
        RETURN;
    END IF;
    
    v_content_lower := lower(p_content);
    
    -- Parcurge entitățile extrase din știre
    FOR v_entity IN 
        SELECT * FROM jsonb_array_elements(p_entities)
        WHERE value->>'label' = 'WORK_OF_ART' 
           OR value->>'label' = 'LAW'
           OR value->>'label' = 'LEGISLATION'
           OR value->>'label' = 'ORGANIZATION'
    LOOP
        BEGIN
            -- Folosește sistemul robust de rezolvare precisă
            SELECT * INTO v_resolved_document
            FROM public.resolve_legislative_identifier(v_entity.value->>'text')
            WHERE match_confidence >= 0.6  -- Doar potriviri cu încredere mare
            ORDER BY match_confidence DESC, document_id DESC
            LIMIT 1;
            
            -- Dacă găsește un document cu încredere mare
            IF v_resolved_document.document_id IS NOT NULL AND v_resolved_document.document_id != p_stire_id THEN
                -- Verifică dacă conexiunea există deja (IDEMPOTENȚA)
                SELECT EXISTS(
                    SELECT 1 FROM public.legislative_connections 
                    WHERE source_document_id = p_stire_id 
                      AND target_document_id = v_resolved_document.document_id
                ) INTO v_connection_exists;
                
                -- Dacă conexiunea nu există, o creează
                IF NOT v_connection_exists THEN
                    -- Determină tipul relației pe baza contextului
                    v_relationship_type := 'face referire la';
                    v_confidence_score := v_resolved_document.match_confidence;
                    
                    -- Verifică cuvintele cheie pentru tipul relației
                    IF v_content_lower LIKE '%modifică%' OR v_content_lower LIKE '%modificări%' THEN
                        v_relationship_type := 'modifică';
                        v_confidence_score := LEAST(v_confidence_score + 0.1, 0.95);
                    ELSIF v_content_lower LIKE '%completează%' OR v_content_lower LIKE '%completări%' THEN
                        v_relationship_type := 'completează';
                        v_confidence_score := LEAST(v_confidence_score + 0.1, 0.95);
                    ELSIF v_content_lower LIKE '%abrogă%' OR v_content_lower LIKE '%abrogări%' THEN
                        v_relationship_type := 'abrogă';
                        v_confidence_score := LEAST(v_confidence_score + 0.1, 0.95);
                    ELSIF v_content_lower LIKE '%derogă%' OR v_content_lower LIKE '%derogări%' THEN
                        v_relationship_type := 'derogă';
                        v_confidence_score := LEAST(v_confidence_score + 0.1, 0.95);
                    ELSIF v_content_lower LIKE '%suspendă%' OR v_content_lower LIKE '%suspendări%' THEN
                        v_relationship_type := 'suspendă';
                        v_confidence_score := LEAST(v_confidence_score + 0.1, 0.95);
                    END IF;
                    
                    -- Inserează conexiunea cu metadate îmbunătățite
                    INSERT INTO public.legislative_connections (
                        source_document_id,
                        target_document_id,
                        relationship_type,
                        confidence_score,
                        extraction_method,
                        metadata
                    ) VALUES (
                        p_stire_id,
                        v_resolved_document.document_id,
                        v_relationship_type,
                        v_confidence_score,
                        'ai_enhanced',
                        jsonb_build_object(
                            'source_entity', v_entity.value,
                            'resolved_identifier', public.normalize_legislative_identifier(v_entity.value->>'text'),
                            'match_method', v_resolved_document.match_method,
                            'match_confidence', v_resolved_document.match_confidence,
                            'extraction_context', substring(p_content from greatest(1, position(v_entity.value->>'text' in p_content) - 100) for 200),
                            'extraction_timestamp', NOW(),
                            'extraction_version', '2.0'
                        )
                    );
                    
                    v_success_count := v_success_count + 1;
                ELSE
                    -- Conexiunea există deja - actualizează metadatele dacă este necesar
                    UPDATE public.legislative_connections
                    SET 
                        metadata = metadata || jsonb_build_object(
                            'last_mention', NOW(),
                            'mention_count', COALESCE((metadata->>'mention_count')::INTEGER, 0) + 1
                        ),
                        updated_at = NOW()
                    WHERE source_document_id = p_stire_id 
                      AND target_document_id = v_resolved_document.document_id;
                END IF;
            ELSE
                -- Documentul nu a fost găsit - marchează-l ca extern
                v_external_identifier := v_entity.value->>'text';
                
                -- Actualizează sau creează documentul extern
                PERFORM public.update_external_document_mention(v_external_identifier);
                
                v_external_count := v_external_count + 1;
                
                -- Opțional: Creează o conexiune externă (dacă vrei să păstrezi și aceste referințe)
                -- Aceasta poate fi utilă pentru analiza completă a rețelei
                INSERT INTO public.legislative_connections (
                    source_document_id,
                    target_document_id,
                    relationship_type,
                    confidence_score,
                    extraction_method,
                    metadata
                ) VALUES (
                    p_stire_id,
                    NULL, -- NULL pentru documente externe
                    'face referire la (extern)',
                    0.3, -- Scor scăzut pentru documente externe
                    'external_reference',
                    jsonb_build_object(
                        'source_entity', v_entity.value,
                        'external_identifier', v_external_identifier,
                        'normalized_identifier', public.normalize_legislative_identifier(v_external_identifier),
                        'extraction_context', substring(p_content from greatest(1, position(v_external_identifier in p_content) - 100) for 200),
                        'is_external', true,
                        'extraction_timestamp', NOW()
                    )
                )
                ON CONFLICT (source_document_id, target_document_id, relationship_type) 
                DO UPDATE SET
                    metadata = EXCLUDED.metadata,
                    updated_at = NOW();
            END IF;
            
        EXCEPTION
            WHEN OTHERS THEN
                -- Loghează eroarea și continuă cu următoarea entitate
                v_error_count := v_error_count + 1;
                RAISE NOTICE 'Eroare la procesarea entității %: %', v_entity.value->>'text', SQLERRM;
                
                -- Inserează o conexiune de eroare pentru debugging
                INSERT INTO public.legislative_connections (
                    source_document_id,
                    target_document_id,
                    relationship_type,
                    confidence_score,
                    extraction_method,
                    metadata
                ) VALUES (
                    p_stire_id,
                    NULL,
                    'eroare_extragere',
                    0.0,
                    'error_handling',
                    jsonb_build_object(
                        'source_entity', v_entity.value,
                        'error_message', SQLERRM,
                        'error_context', substring(p_content from greatest(1, position(v_entity.value->>'text' in p_content) - 100) for 200),
                        'error_timestamp', NOW(),
                        'error_count', v_error_count
                    )
                )
                ON CONFLICT (source_document_id, target_document_id, relationship_type) 
                DO UPDATE SET
                    metadata = EXCLUDED.metadata,
                    updated_at = NOW();
        END;
    END LOOP;
    
    -- Loghează rezultatul final
    RAISE NOTICE 'Extragerea completă pentru știrea %: % conexiuni noi, % externe, % erori', 
        p_stire_id, v_success_count, v_external_count, v_error_count;
END;
$$;

COMMENT ON FUNCTION public.extract_legislative_connections(BIGINT, TEXT, JSONB) IS 'Extrage automat conexiunile legislative cu gestionarea erorilor și idempotența (corectat)';
