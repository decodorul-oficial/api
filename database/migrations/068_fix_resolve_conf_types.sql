-- =====================================================
-- MIGRAȚIA 068: FIX TIPURI MATCH_CONFIDENCE (double precision)
-- =====================================================

CREATE OR REPLACE FUNCTION public.resolve_legislative_identifier(
    p_text TEXT
) RETURNS TABLE(
    document_id BIGINT,
    title TEXT,
    match_confidence DOUBLE PRECISION,
    match_method TEXT
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    v_id JSONB;
    v_type TEXT; v_num TEXT; v_year TEXT; v_norm TEXT; v_conf DOUBLE PRECISION;
BEGIN
    v_id := public.normalize_legislative_identifier(p_text);
    v_type := v_id->>'type'; v_num := v_id->>'number'; v_year := v_id->>'year'; v_norm := v_id->>'normalized_text'; v_conf := (v_id->>'confidence')::DOUBLE PRECISION;

    IF v_type IS NOT NULL AND v_num IS NOT NULL AND v_year IS NOT NULL THEN
        RETURN QUERY
        SELECT s.id, s.title, 0.96::DOUBLE PRECISION, 'exact_identifier_match'
        FROM public.stiri s
        WHERE s.title ILIKE '%' || v_type || '%'
          AND s.title ~ ('\\m' || v_num || '\\M')
          AND s.title ~ ('\\m' || v_year || '\\M')
        ORDER BY s.publication_date DESC
        LIMIT 1;
        IF FOUND THEN RETURN; END IF;
    END IF;

    RETURN QUERY
    SELECT s.id, s.title,
           CASE 
             WHEN v_type IS NOT NULL AND v_num IS NOT NULL AND (s.title ~ ('\\m' || v_num || '\\M')) THEN 0.8::DOUBLE PRECISION
             WHEN v_type IS NOT NULL THEN 0.65::DOUBLE PRECISION
             WHEN s.title ILIKE '%' || p_text || '%' THEN 0.45::DOUBLE PRECISION
             ELSE 0.35::DOUBLE PRECISION
           END as match_confidence,
           CASE 
             WHEN v_type IS NOT NULL AND v_num IS NOT NULL AND (s.title ~ ('\\m' || v_num || '\\M')) THEN 'partial_identifier_match'
             WHEN v_type IS NOT NULL THEN 'type_match'
             WHEN s.title ILIKE '%' || p_text || '%' THEN 'text_match'
             ELSE 'fallback_match'
           END as match_method
    FROM public.stiri s
    WHERE (v_type IS NOT NULL AND s.title ILIKE '%' || v_type || '%')
       OR s.title ILIKE '%' || p_text || '%'
    ORDER BY 
      CASE 
        WHEN v_type IS NOT NULL AND v_num IS NOT NULL AND (s.title ~ ('\\m' || v_num || '\\M')) THEN 1
        WHEN v_type IS NOT NULL THEN 2
        WHEN s.title ILIKE '%' || p_text || '%' THEN 3
        ELSE 4
      END,
      s.publication_date DESC
    LIMIT 5;
END;
$$;

COMMENT ON FUNCTION public.resolve_legislative_identifier(TEXT) IS 'Fix typuri: match_confidence double precision, constante castate';


