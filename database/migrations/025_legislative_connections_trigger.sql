-- =====================================================
-- MIGRAȚIA 025: TRIGGER-URI AUTOMATE PENTRU CONEXIUNILE LEGISLATIVE
-- =====================================================
-- Implementează trigger-urile automate pentru extragerea conexiunilor legislative

-- 1. Funcția trigger pentru extragerea automată a conexiunilor
CREATE OR REPLACE FUNCTION public.trigger_extract_legislative_connections()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Extrage conexiunile legislative pentru noua știre
    IF NEW.entities IS NOT NULL AND NEW.content IS NOT NULL THEN
        PERFORM public.extract_legislative_connections(
            NEW.id,
            COALESCE(NEW.content->>'body', NEW.title),
            NEW.entities
        );
    END IF;
    
    RETURN NEW;
END;
$$;

-- 2. Trigger pentru inserarea de știri noi
CREATE TRIGGER extract_legislative_connections_on_insert
    AFTER INSERT ON public.stiri
    FOR EACH ROW EXECUTE FUNCTION public.trigger_extract_legislative_connections();

-- 3. Trigger pentru actualizarea știrilor existente
CREATE TRIGGER extract_legislative_connections_on_update
    AFTER UPDATE ON public.stiri
    FOR EACH ROW
    WHEN (OLD.entities IS DISTINCT FROM NEW.entities OR OLD.content IS DISTINCT FROM NEW.content)
    EXECUTE FUNCTION public.trigger_extract_legislative_connections();

-- 4. Funcția pentru procesarea în lot a știrilor existente
CREATE OR REPLACE FUNCTION public.process_existing_stiri_for_connections() RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_stire RECORD;
    v_processed_count INTEGER := 0;
    v_total_count INTEGER;
BEGIN
    -- Obține numărul total de știri cu entități
    SELECT COUNT(*) INTO v_total_count
    FROM public.stiri 
    WHERE entities IS NOT NULL AND entities != '[]'::jsonb;
    
    RAISE NOTICE 'Începe procesarea a % știri pentru conexiuni legislative', v_total_count;
    
    -- Procesează fiecare știre cu entități
    FOR v_stire IN 
        SELECT id, content, entities
        FROM public.stiri 
        WHERE entities IS NOT NULL AND entities != '[]'::jsonb
        ORDER BY publication_date DESC
    LOOP
        BEGIN
            -- Extrage conexiunile pentru această știre
            PERFORM public.extract_legislative_connections(
                v_stire.id,
                COALESCE(v_stire.content->>'body', ''),
                v_stire.entities
            );
            
            v_processed_count := v_processed_count + 1;
            
            -- Log progresul la fiecare 100 de știri
            IF v_processed_count % 100 = 0 THEN
                RAISE NOTICE 'Procesat % din % știri', v_processed_count, v_total_count;
            END IF;
            
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Eroare la procesarea știrii %: %', v_stire.id, SQLERRM;
                -- Continuă cu următoarea știre
        END;
    END LOOP;
    
    RAISE NOTICE 'Procesare completă: % știri procesate cu succes', v_processed_count;
    
    RETURN v_processed_count;
END;
$$;

-- 5. Funcția pentru curățarea conexiunilor orfane
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_connections() RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Șterge conexiunile care au sursa sau ținta șterse
    DELETE FROM public.legislative_connections
    WHERE source_document_id NOT IN (SELECT id FROM public.stiri)
       OR target_document_id NOT IN (SELECT id FROM public.stiri);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RAISE NOTICE 'Au fost șterse % conexiuni orfane', v_deleted_count;
    
    RETURN v_deleted_count;
END;
$$;

-- 6. Funcția pentru obținerea statisticilor despre conexiuni
CREATE OR REPLACE FUNCTION public.get_legislative_connections_stats() RETURNS TABLE(
    total_connections INTEGER,
    connections_by_type JSONB,
    top_source_documents JSONB,
    top_target_documents JSONB,
    average_confidence FLOAT,
    extraction_methods JSONB,
    recent_connections JSONB
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
        AVG(lc.confidence_score) as average_confidence,
        jsonb_object_agg(
            lc.extraction_method,
            COUNT(*)
        ) as extraction_methods,
        jsonb_agg(
            jsonb_build_object(
                'source_id', lc.source_document_id,
                'target_id', lc.target_document_id,
                'type', lc.relationship_type,
                'created_at', lc.created_at
            )
        ) FILTER (WHERE lc.created_at > NOW() - INTERVAL '7 days') as recent_connections
    FROM public.legislative_connections lc
    LEFT JOIN public.stiri s ON lc.source_document_id = s.id
    LEFT JOIN public.stiri s2 ON lc.target_document_id = s2.id;
END;
$$;

-- 7. Funcția pentru verificarea integrității conexiunilor
CREATE OR REPLACE FUNCTION public.verify_connections_integrity() RETURNS TABLE(
    issue_type TEXT,
    issue_description TEXT,
    affected_records INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Conexiuni cu sursa ștearsă
    RETURN QUERY
    SELECT 
        'source_deleted'::TEXT as issue_type,
        'Conexiuni cu source_document_id șters'::TEXT as issue_description,
        COUNT(*)::INTEGER as affected_records
    FROM public.legislative_connections lc
    WHERE NOT EXISTS (SELECT 1 FROM public.stiri WHERE id = lc.source_document_id);
    
    -- Conexiuni cu ținta ștearsă
    RETURN QUERY
    SELECT 
        'target_deleted'::TEXT as issue_type,
        'Conexiuni cu target_document_id șters'::TEXT as issue_description,
        COUNT(*)::INTEGER as affected_records
    FROM public.legislative_connections lc
    WHERE NOT EXISTS (SELECT 1 FROM public.stiri WHERE id = lc.target_document_id);
    
    -- Conexiuni cu sursa = ținta
    RETURN QUERY
    SELECT 
        'self_reference'::TEXT as issue_type,
        'Conexiuni cu sursa = ținta'::TEXT as issue_description,
        COUNT(*)::INTEGER as affected_records
    FROM public.legislative_connections lc
    WHERE lc.source_document_id = lc.target_document_id;
    
    -- Conexiuni duplicate
    RETURN QUERY
    SELECT 
        'duplicate_connections'::TEXT as issue_type,
        'Conexiuni duplicate'::TEXT as issue_description,
        COUNT(*)::INTEGER as affected_records
    FROM (
        SELECT source_document_id, target_document_id, relationship_type, COUNT(*)
        FROM public.legislative_connections
        GROUP BY source_document_id, target_document_id, relationship_type
        HAVING COUNT(*) > 1
    ) duplicates;
END;
$$;

-- 8. Comentarii pentru documentație
COMMENT ON FUNCTION public.trigger_extract_legislative_connections() IS 'Trigger pentru extragerea automată a conexiunilor legislative';
COMMENT ON FUNCTION public.process_existing_stiri_for_connections() IS 'Procesează în lot toate știrile existente pentru extragerea conexiunilor';
COMMENT ON FUNCTION public.cleanup_orphaned_connections() IS 'Curăță conexiunile orfane (cu sursa sau ținta șterse)';
COMMENT ON FUNCTION public.get_legislative_connections_stats() IS 'Obține statistici complete despre conexiunile legislative';
COMMENT ON FUNCTION public.verify_connections_integrity() IS 'Verifică integritatea conexiunilor legislative';

-- 9. Verificări finale
DO $$
BEGIN
    -- Verifică dacă trigger-urile au fost create cu succes
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'extract_legislative_connections_on_insert'
    ) THEN
        RAISE EXCEPTION 'Trigger-ul pentru INSERT nu a fost creat';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'extract_legislative_connections_on_update'
    ) THEN
        RAISE EXCEPTION 'Trigger-ul pentru UPDATE nu a fost creat';
    END IF;
    
    RAISE NOTICE 'Toate trigger-urile au fost create cu succes';
END $$;
