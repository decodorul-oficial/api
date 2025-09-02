-- =====================================================
-- MIGRAȚIA 035: GESTIONAREA DOCUMENTELOR EXTERNE ȘI IDEMPOTENȚA
-- =====================================================
-- Implementează gestionarea documentelor externe și idempotența procesului

-- 1. Tabela pentru documentele externe (inexistente în baza de date)
CREATE TABLE IF NOT EXISTS public.external_legislative_documents (
    id BIGSERIAL PRIMARY KEY,
    identifier TEXT NOT NULL,
    normalized_identifier JSONB NOT NULL,
    document_type TEXT,
    document_number TEXT,
    document_year TEXT,
    first_mentioned_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_mentioned_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    mention_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(identifier)
);

-- Indexuri pentru performanță
CREATE INDEX IF NOT EXISTS idx_external_documents_identifier ON public.external_legislative_documents(identifier);
CREATE INDEX IF NOT EXISTS idx_external_documents_type ON public.external_legislative_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_external_documents_year ON public.external_legislative_documents(document_year);

-- 2. Funcția pentru actualizarea timestamp-ului și numărului de mențiuni
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

-- 3. Funcția îmbunătățită pentru extragerea conexiunilor cu gestionarea erorilor
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

-- 4. Funcția pentru curățarea conexiunilor de eroare (opțional)
CREATE OR REPLACE FUNCTION public.cleanup_error_connections() RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM public.legislative_connections
    WHERE relationship_type = 'eroare_extragere'
      AND created_at < NOW() - INTERVAL '7 days'; -- Păstrează erorile din ultima săptămână
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RAISE NOTICE 'Au fost șterse % conexiuni de eroare vechi', v_deleted_count;
    
    RETURN v_deleted_count;
END;
$$;

-- 5. Funcția pentru obținerea statisticilor despre documentele externe
CREATE OR REPLACE FUNCTION public.get_external_documents_stats() RETURNS TABLE(
    total_external_documents INTEGER,
    documents_by_type JSONB,
    most_mentioned_external JSONB,
    recent_external_mentions JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_total INTEGER;
    v_by_type JSONB;
    v_most_mentioned JSONB;
    v_recent JSONB;
    v_type TEXT;
    v_count INTEGER;
BEGIN
    -- Total documente externe
    SELECT COUNT(*) INTO v_total FROM public.external_legislative_documents;
    
    -- Documente grupate pe tip (fără aggregate nested)
    v_by_type := '{}'::jsonb;
    FOR v_type, v_count IN 
        SELECT COALESCE(document_type, 'necunoscut'), COUNT(*)
        FROM public.external_legislative_documents
        GROUP BY document_type
    LOOP
        v_by_type := v_by_type || jsonb_build_object(v_type, v_count);
    END LOOP;
    
    -- Cele mai menționate documente externe (fără ORDER BY în aggregate)
    SELECT jsonb_agg(
        jsonb_build_object(
            'identifier', identifier,
            'mention_count', mention_count,
            'last_mentioned', last_mentioned_at
        )
    ) INTO v_most_mentioned
    FROM (
        SELECT identifier, mention_count, last_mentioned_at
        FROM public.external_legislative_documents
        WHERE mention_count > 1
        ORDER BY mention_count DESC
    ) subq;
    
    -- Mențiuni recente (ultimele 30 de zile)
    SELECT jsonb_agg(
        jsonb_build_object(
            'identifier', identifier,
            'last_mentioned', last_mentioned_at
        )
    ) INTO v_recent
    FROM (
        SELECT identifier, last_mentioned_at
        FROM public.external_legislative_documents
        WHERE last_mentioned_at > NOW() - INTERVAL '30 days'
        ORDER BY last_mentioned_at DESC
    ) subq;
    
    -- Returnează rezultatul
    RETURN QUERY SELECT 
        v_total,
        v_by_type,
        COALESCE(v_most_mentioned, '[]'::jsonb),
        COALESCE(v_recent, '[]'::jsonb);
END;
$$;

-- 6. RLS pentru tabela de documente externe
ALTER TABLE public.external_legislative_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated users to read external documents" ON public.external_legislative_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Block all modifications on external documents" ON public.external_legislative_documents FOR ALL TO authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.external_legislative_documents IS 'Documente legislative externe (inexistente în baza de date) menționate în știri';
COMMENT ON FUNCTION public.extract_legislative_connections(BIGINT, TEXT, JSONB) IS 'Extrage automat conexiunile legislative cu gestionarea erorilor și idempotența';
COMMENT ON FUNCTION public.cleanup_error_connections() IS 'Curăță conexiunile de eroare vechi pentru mentenanță';
COMMENT ON FUNCTION public.get_external_documents_stats() IS 'Obține statistici despre documentele externe menționate';
