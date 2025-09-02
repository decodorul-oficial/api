-- =====================================================
-- MIGRAȚIA 043: CORECTAREA FINALĂ A FUNCȚIEI DE STATISTICI
-- =====================================================
-- Corectează final funcția de statistici pentru documentele externe

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

COMMENT ON FUNCTION public.get_external_documents_stats() IS 'Obține statistici despre documentele externe menționate (corectat final)';
