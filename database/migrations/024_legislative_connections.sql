-- =====================================================
-- MIGRAȚIA 024: TABELA PENTRU CONEXIUNILE LEGISLATIVE
-- =====================================================
-- Creează tabela principală pentru stocarea conexiunilor legislative

-- 1. Tabela principală pentru conexiuni legislative
CREATE TABLE IF NOT EXISTS public.legislative_connections (
    id BIGSERIAL PRIMARY KEY,
    source_document_id BIGINT NOT NULL REFERENCES public.stiri(id) ON DELETE CASCADE,
    target_document_id BIGINT NOT NULL REFERENCES public.stiri(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL CHECK (relationship_type IN ('modifică', 'completează', 'abrogă', 'face referire la', 'derogă', 'suspendă')),
    confidence_score FLOAT DEFAULT 0.8 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    extraction_method TEXT DEFAULT 'automatic' CHECK (extraction_method IN ('automatic', 'manual', 'ai_enhanced')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(source_document_id, target_document_id, relationship_type)
);

-- 2. Indexuri pentru performanță
CREATE INDEX IF NOT EXISTS idx_legislative_connections_source ON public.legislative_connections(source_document_id);
CREATE INDEX IF NOT EXISTS idx_legislative_connections_target ON public.legislative_connections(target_document_id);
CREATE INDEX IF NOT EXISTS idx_legislative_connections_type ON public.legislative_connections(relationship_type);
CREATE INDEX IF NOT EXISTS idx_legislative_connections_confidence ON public.legislative_connections(confidence_score);
CREATE INDEX IF NOT EXISTS idx_legislative_connections_composite ON public.legislative_connections(source_document_id, target_document_id, relationship_type);

-- 3. Funcția pentru actualizarea timestamp-ului updated_at
CREATE OR REPLACE FUNCTION public.update_legislative_connections_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 4. Trigger pentru actualizarea automată a updated_at
CREATE TRIGGER update_legislative_connections_updated_at
    BEFORE UPDATE ON public.legislative_connections
    FOR EACH ROW EXECUTE FUNCTION public.update_legislative_connections_updated_at();

-- 5. Funcția principală pentru extragerea conexiunilor legislative
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
    
    -- Parcurge entitățile extrase din știre
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

-- 6. Funcția pentru obținerea graficului de conexiuni legislative
CREATE OR REPLACE FUNCTION public.get_legislative_graph(
    p_document_id BIGINT,
    p_depth INT DEFAULT 1
) RETURNS TABLE(
    nodes JSONB,
    links JSONB
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_nodes JSONB;
    v_links JSONB;
    v_visited_nodes BIGINT[] := ARRAY[p_document_id];
    v_current_depth INT := 0;
    v_nodes_at_depth BIGINT[] := ARRAY[p_document_id];
    v_next_level_nodes BIGINT[] := ARRAY[]::BIGINT[];
BEGIN
    -- Verifică dacă documentul există
    IF NOT EXISTS (SELECT 1 FROM public.stiri WHERE id = p_document_id) THEN
        RETURN;
    END IF;
    
    -- Construiește graficul nivel cu nivel
    WHILE v_current_depth < p_depth AND array_length(v_nodes_at_depth, 1) > 0 LOOP
        -- Găsește toate conexiunile pentru nodurile de la nivelul curent
        SELECT array_agg(DISTINCT lc.target_document_id) INTO v_next_level_nodes
        FROM public.legislative_connections lc
        WHERE lc.source_document_id = ANY(v_nodes_at_depth)
          AND lc.target_document_id != ALL(v_visited_nodes);
        
        -- Dacă nu mai sunt noduri noi, oprește
        IF v_next_level_nodes IS NULL OR array_length(v_next_level_nodes, 1) = 0 THEN
            EXIT;
        END IF;
        
        -- Adaugă noile noduri la lista vizitată
        v_visited_nodes := array_cat(v_visited_nodes, v_next_level_nodes);
        v_nodes_at_depth := v_next_level_nodes;
        v_current_depth := v_current_depth + 1;
    END LOOP;
    
    -- Construiește lista de noduri
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', s.id,
            'title', s.title,
            'publicationDate', s.publication_date,
            'type', 'legislation'
        )
    ) INTO v_nodes
    FROM public.stiri s
    WHERE s.id = ANY(v_visited_nodes);
    
    -- Construiește lista de conexiuni
    SELECT jsonb_agg(
        jsonb_build_object(
            'source', lc.source_document_id,
            'target', lc.target_document_id,
            'type', lc.relationship_type,
            'confidence', lc.confidence_score
        )
    ) INTO v_links
    FROM public.legislative_connections lc
    WHERE lc.source_document_id = ANY(v_visited_nodes)
      AND lc.target_document_id = ANY(v_visited_nodes);
    
    -- Returnează rezultatul
    RETURN QUERY SELECT v_nodes, v_links;
END;
$$;

-- 7. Funcția pentru obținerea statisticilor despre conexiuni
CREATE OR REPLACE FUNCTION public.get_legislative_connections_stats() RETURNS TABLE(
    total_connections INTEGER,
    connections_by_type JSONB,
    top_source_documents JSONB,
    top_target_documents JSONB,
    average_confidence FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_connections,
        jsonb_object_agg(
            lc.relationship_type,
            COUNT(*)
        ) as connections_by_type,
        jsonb_agg(
            jsonb_build_object(
                'document_id', s.id,
                'title', s.title,
                'connection_count', COUNT(*)
            )
        ) FILTER (WHERE s.id IS NOT NULL) as top_source_documents,
        jsonb_agg(
            jsonb_build_object(
                'document_id', s2.id,
                'title', s2.title,
                'connection_count', COUNT(*)
            )
        ) FILTER (WHERE s2.id IS NOT NULL) as top_target_documents,
        AVG(lc.confidence_score) as average_confidence
    FROM public.legislative_connections lc
    LEFT JOIN public.stiri s ON lc.source_document_id = s.id
    LEFT JOIN public.stiri s2 ON lc.target_document_id = s2.id
    GROUP BY lc.relationship_type;
END;
$$;

-- 8. RLS (Row Level Security) pentru tabela
ALTER TABLE public.legislative_connections ENABLE ROW LEVEL SECURITY;

-- 9. Politici RLS
CREATE POLICY "Allow authenticated users to read legislative_connections" 
    ON public.legislative_connections FOR SELECT TO authenticated USING (true);

CREATE POLICY "Block all modifications on legislative_connections" 
    ON public.legislative_connections FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- 10. Comentarii pentru documentație
COMMENT ON TABLE public.legislative_connections IS 'Conexiuni legislative între documente pentru analiza de rețea';
COMMENT ON FUNCTION public.extract_legislative_connections(BIGINT, TEXT, JSONB) IS 'Extrage automat conexiunile legislative din conținutul unei știri';
COMMENT ON FUNCTION public.get_legislative_graph(BIGINT, INT) IS 'Returnează graficul de conexiuni legislative pentru un document dat';
COMMENT ON FUNCTION public.get_legislative_connections_stats() IS 'Obține statistici despre conexiunile legislative';
