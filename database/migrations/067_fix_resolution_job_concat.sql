-- =====================================================
-- MIGRAȚIA 067: FIX CONCAT ÎN JOBUL DE REZOLUȚIE EXTERNĂ
-- =====================================================

CREATE OR REPLACE FUNCTION public.resolve_external_legislative_references(
    p_limit INT DEFAULT 1000
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_row RECORD;
    v_res RECORD;
    v_updated INT := 0;
    v_t TEXT;
    v_n TEXT;
    v_y TEXT;
    v_candidate TEXT;
BEGIN
    FOR v_row IN 
        SELECT id, source_document_id, target_document_id, relationship_type, metadata
        FROM public.legislative_connections
        WHERE target_document_id IS NULL
          AND (relationship_type ILIKE 'face referire la%')
          AND (metadata->>'external_identifier' IS NOT NULL OR metadata->'normalized_identifier' IS NOT NULL)
        ORDER BY id DESC
        LIMIT p_limit
    LOOP
        v_t := (v_row.metadata->'normalized_identifier')::jsonb->> 'type';
        v_n := (v_row.metadata->'normalized_identifier')::jsonb->> 'number';
        v_y := (v_row.metadata->'normalized_identifier')::jsonb->> 'year';
        IF v_t IS NOT NULL AND v_n IS NOT NULL AND v_y IS NOT NULL THEN
          v_candidate := v_t || ' ' || v_n || '/' || v_y;
        ELSE
          v_candidate := v_row.metadata->> 'external_identifier';
        END IF;

        SELECT * INTO v_res
        FROM public.resolve_legislative_identifier(v_candidate)
        WHERE match_confidence >= 0.75
        ORDER BY match_confidence DESC
        LIMIT 1;

        IF v_res.document_id IS NOT NULL THEN
            UPDATE public.legislative_connections
            SET target_document_id = v_res.document_id,
                extraction_method = 'ai_enhanced',
                metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{resolution}', jsonb_build_object(
                    'method', v_res.match_method,
                    'confidence', v_res.match_confidence,
                    'resolved_at', NOW(),
                    'candidate', v_candidate
                ), true),
                updated_at = NOW()
            WHERE id = v_row.id;
            v_updated := v_updated + 1;
        END IF;
    END LOOP;

    RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION public.resolve_external_legislative_references(INT) IS 'Fix concat; rezolvă conexiunile externe către ținte interne.';


