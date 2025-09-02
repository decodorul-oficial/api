-- =====================================================
-- MIGRAȚIA 029: SISTEM ROBUST DE REZOLVARE A IDENTIFICATORILOR LEGISLATIVI
-- =====================================================
-- Implementează un sistem robust de rezolvare a identificatorilor de acte normative
-- bazat pe tip, număr și an pentru a preveni potrivirile greșite

-- 1. Funcția pentru normalizarea identificatorilor legislative
CREATE OR REPLACE FUNCTION public.normalize_legislative_identifier(
    p_text TEXT
) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
    v_result JSONB;
    v_normalized_text TEXT;
    v_type TEXT;
    v_number TEXT;
    v_year TEXT;
    v_pattern TEXT;
BEGIN
    -- Normalizează textul
    v_normalized_text := lower(trim(p_text));
    
    -- Pattern-uri pentru diferite tipuri de acte normative
    -- Lege
    IF v_normalized_text ~ 'legea?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})' THEN
        v_pattern := 'legea?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})';
        v_type := 'lege';
        v_number := regexp_replace(v_normalized_text, v_pattern, '\1', 'g');
        v_year := regexp_replace(v_normalized_text, v_pattern, '\2', 'g');
    
    -- Ordonanță de urgență
    ELSIF v_normalized_text ~ 'ordonan[țt]a?\s+de?\s+urgen[țt][ăa]?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})' THEN
        v_pattern := 'ordonan[țt]a?\s+de?\s+urgen[țt][ăa]?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})';
        v_type := 'ordonanta_urgenta';
        v_number := regexp_replace(v_normalized_text, v_pattern, '\1', 'g');
        v_year := regexp_replace(v_normalized_text, v_pattern, '\2', 'g');
    
    -- Ordonanță
    ELSIF v_normalized_text ~ 'ordonan[țt]a?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})' THEN
        v_pattern := 'ordonan[țt]a?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})';
        v_type := 'ordonanta';
        v_number := regexp_replace(v_normalized_text, v_pattern, '\1', 'g');
        v_year := regexp_replace(v_normalized_text, v_pattern, '\2', 'g');
    
    -- Hotărâre
    ELSIF v_normalized_text ~ 'hotarare\s+nr\.?\s*(\d+)\s*/\s*(\d{4})' THEN
        v_pattern := 'hotarare\s+nr\.?\s*(\d+)\s*/\s*(\d{4})';
        v_type := 'hotarare';
        v_number := regexp_replace(v_normalized_text, v_pattern, '\1', 'g');
        v_year := regexp_replace(v_normalized_text, v_pattern, '\2', 'g');
    
    -- Decret
    ELSIF v_normalized_text ~ 'decret\s+nr\.?\s*(\d+)\s*/\s*(\d{4})' THEN
        v_pattern := 'decret\s+nr\.?\s*(\d+)\s*/\s*(\d{4})';
        v_type := 'decret';
        v_number := regexp_replace(v_normalized_text, v_pattern, '\1', 'g');
        v_year := regexp_replace(v_normalized_text, v_pattern, '\2', 'g');
    
    -- Decizie
    ELSIF v_normalized_text ~ 'decizie\s+nr\.?\s*(\d+)\s*/\s*(\d{4})' THEN
        v_pattern := 'decizie\s+nr\.?\s*(\d+)\s*/\s*(\d{4})';
        v_type := 'decizie';
        v_number := regexp_replace(v_normalized_text, v_pattern, '\1', 'g');
        v_year := regexp_replace(v_normalized_text, v_pattern, '\2', 'g');
    
    -- Cod (Codul fiscal, Codul penal, etc.)
    ELSIF v_normalized_text ~ 'codul\s+([a-zăâîșț]+)' THEN
        v_pattern := 'codul\s+([a-zăâîșț]+)';
        v_type := 'cod';
        v_number := regexp_replace(v_normalized_text, v_pattern, '\1', 'g');
        v_year := NULL;
    
    ELSE
        -- Nu s-a găsit un pattern cunoscut
        v_type := NULL;
        v_number := NULL;
        v_year := NULL;
    END IF;
    
    -- Construiește rezultatul
    v_result := jsonb_build_object(
        'type', v_type,
        'number', v_number,
        'year', v_year,
        'normalized_text', v_normalized_text,
        'confidence', CASE 
            WHEN v_type IS NOT NULL THEN 0.9
            ELSE 0.3
        END
    );
    
    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.normalize_legislative_identifier(TEXT) IS 'Normalizează identificatorii legislative în tip, număr și an pentru rezolvare precisă';

-- 2. Funcția pentru rezolvarea precisă a identificatorilor legislative
CREATE OR REPLACE FUNCTION public.resolve_legislative_identifier(
    p_text TEXT
) RETURNS TABLE(
    document_id BIGINT,
    title TEXT,
    match_confidence FLOAT,
    match_method TEXT
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    v_identifier JSONB;
    v_type TEXT;
    v_number TEXT;
    v_year TEXT;
    v_normalized_text TEXT;
    v_confidence FLOAT;
    v_best_match RECORD;
    v_exact_match BOOLEAN := FALSE;
BEGIN
    -- Normalizează identificatorul
    v_identifier := public.normalize_legislative_identifier(p_text);
    v_type := v_identifier->>'type';
    v_number := v_identifier->>'number';
    v_year := v_identifier->>'year';
    v_normalized_text := v_identifier->>'normalized_text';
    v_confidence := (v_identifier->>'confidence')::FLOAT;
    
    -- Dacă nu s-a găsit un pattern cunoscut, returnează căutări fuzzy
    IF v_type IS NULL THEN
        RETURN QUERY
        SELECT 
            s.id,
            s.title,
            0.3::FLOAT as match_confidence,
            'fuzzy_title_match' as match_method
        FROM public.stiri s
        WHERE s.title ILIKE '%' || p_text || '%'
        ORDER BY 
            CASE 
                WHEN s.title ILIKE p_text THEN 1
                WHEN s.title ILIKE '%' || p_text || '%' THEN 2
                ELSE 3
            END,
            s.publication_date DESC
        LIMIT 3;
        RETURN;
    END IF;
    
    -- Căutare exactă după tip, număr și an
    IF v_type = 'cod' THEN
        -- Pentru coduri, caută după nume
        SELECT s.id, s.title, 0.95::FLOAT as confidence
        INTO v_best_match
        FROM public.stiri s
        WHERE s.title ILIKE '%codul ' || v_number || '%'
        ORDER BY s.publication_date DESC
        LIMIT 1;
        
        IF FOUND THEN
            v_exact_match := TRUE;
        END IF;
    ELSE
        -- Pentru acte cu număr și an
        SELECT s.id, s.title, 0.95::FLOAT as confidence
        INTO v_best_match
        FROM public.stiri s
        WHERE s.title ILIKE '%' || v_type || '%'
          AND s.title ~ ('\m' || v_number || '\M')
          AND s.title ~ ('\m' || v_year || '\M')
        ORDER BY s.publication_date DESC
        LIMIT 1;
        
        IF FOUND THEN
            v_exact_match := TRUE;
        END IF;
    END IF;
    
    -- Dacă s-a găsit o potrivire exactă, returnează-o
    IF v_exact_match THEN
        RETURN QUERY
        SELECT 
            v_best_match.id,
            v_best_match.title,
            v_best_match.confidence,
            'exact_identifier_match' as match_method;
        RETURN;
    END IF;
    
    -- Căutare parțială cu prioritate
    RETURN QUERY
    SELECT 
        s.id,
        s.title,
        CASE 
            WHEN s.title ILIKE '%' || v_type || '%' AND v_number IS NOT NULL AND s.title ~ ('\m' || v_number || '\M') THEN 0.8::FLOAT
            WHEN s.title ILIKE '%' || v_type || '%' THEN 0.6::FLOAT
            WHEN s.title ILIKE '%' || p_text || '%' THEN 0.4::FLOAT
            ELSE 0.2::FLOAT
        END as match_confidence,
        CASE 
            WHEN s.title ILIKE '%' || v_type || '%' AND v_number IS NOT NULL AND s.title ~ ('\m' || v_number || '\M') THEN 'partial_identifier_match'
            WHEN s.title ILIKE '%' || v_type || '%' THEN 'type_match'
            WHEN s.title ILIKE '%' || p_text || '%' THEN 'text_match'
            ELSE 'fallback_match'
        END as match_method
    FROM public.stiri s
    WHERE s.title ILIKE '%' || v_type || '%'
       OR s.title ILIKE '%' || p_text || '%'
    ORDER BY 
        CASE 
            WHEN s.title ILIKE '%' || v_type || '%' AND v_number IS NOT NULL AND s.title ~ ('\m' || v_number || '\M') THEN 1
            WHEN s.title ILIKE '%' || v_type || '%' THEN 2
            WHEN s.title ILIKE '%' || p_text || '%' THEN 3
            ELSE 4
        END,
        s.publication_date DESC
    LIMIT 5;
END;
$$;

COMMENT ON FUNCTION public.resolve_legislative_identifier(TEXT) IS 'Rezolvă identificatorii legislative în documente cu metoda de potrivire și încrederea potrivirii';

-- 3. Actualizează funcția extract_legislative_connections pentru a folosi noul sistem
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
BEGIN
    -- Verifică dacă știrea există
    IF NOT EXISTS (SELECT 1 FROM public.stiri WHERE id = p_stire_id) THEN
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
        -- Folosește noul sistem robust de rezolvare precisă
        SELECT * INTO v_resolved_document
        FROM public.resolve_legislative_identifier(v_entity.value->>'text')
        WHERE match_confidence >= 0.6  -- Doar potriviri cu încredere mare
        ORDER BY match_confidence DESC, document_id DESC
        LIMIT 1;
        
        -- Dacă găsește un document cu încredere mare
        IF v_resolved_document.document_id IS NOT NULL AND v_resolved_document.document_id != p_stire_id THEN
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

COMMENT ON FUNCTION public.extract_legislative_connections(BIGINT, TEXT, JSONB) IS 'Extrage automat conexiunile legislative folosind sistemul robust de rezolvare a identificatorilor';
