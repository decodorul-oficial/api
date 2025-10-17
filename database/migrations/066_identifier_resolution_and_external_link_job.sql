-- =====================================================
-- MIGRAȚIA 066: EXTINDERE NORM/REZOLVARE IDENTIFICATORI + JOB REZOLUȚIE EXTERNĂ
-- =====================================================

-- 1) Extindere normalize_legislative_identifier: suport abrevieri, diacritice variate, spațiere flexibilă, delimitatori .-/
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
BEGIN
    v_normalized_text := lower(trim(p_text));
    -- înlocuiește diacritice comune
    v_normalized_text := translate(v_normalized_text, 'ăâîșțÁÂÎȘȚàáâãäåæçèéêëìíîïñòóôõöùúûüýÿ', 'aaistAAISTaaaaaaaceeeeiiiinooooouuuuyy');
    -- comprimă multiple spații
    v_normalized_text := regexp_replace(v_normalized_text, '\s+', ' ', 'g');

    -- HG / Hotărârea Guvernului
    IF v_normalized_text ~ '(\bhg\b|hotar(\w*)? guvern(\w*)?)\s*(nr\.|numarul)?\s*(\d+)\s*[/\.-]\s*(\d{4})' THEN
        v_type := 'hg';
        v_number := regexp_replace(v_normalized_text, '.*?(\d+)\s*[/\.-]\s*(\d{4}).*', '\1');
        v_year := regexp_replace(v_normalized_text, '.*?(\d+)\s*[/\.-]\s*(\d{4}).*', '\2');

    -- OUG / Ordonanța de urgență
    ELSIF v_normalized_text ~ '(\boug\b|ordonanta de urgenta)\s*(nr\.|numarul)?\s*(\d+)\s*[/\.-]\s*(\d{4})' THEN
        v_type := 'oug';
        v_number := regexp_replace(v_normalized_text, '.*?(\d+)\s*[/\.-]\s*(\d{4}).*', '\1');
        v_year := regexp_replace(v_normalized_text, '.*?(\d+)\s*[/\.-]\s*(\d{4}).*', '\2');

    -- OG / Ordonanța
    ELSIF v_normalized_text ~ '(\bog\b|ordonanta)\s*(nr\.|numarul)?\s*(\d+)\s*[/\.-]\s*(\d{4})' THEN
        v_type := 'og';
        v_number := regexp_replace(v_normalized_text, '.*?(\d+)\s*[/\.-]\s*(\d{4}).*', '\1');
        v_year := regexp_replace(v_normalized_text, '.*?(\d+)\s*[/\.-]\s*(\d{4}).*', '\2');

    -- Legea
    ELSIF v_normalized_text ~ '(\blegea?\b|\blege\b)\s*(nr\.|numarul)?\s*(\d+)\s*[/\.-]\s*(\d{4})' THEN
        v_type := 'lege';
        v_number := regexp_replace(v_normalized_text, '.*?(\d+)\s*[/\.-]\s*(\d{4}).*', '\1');
        v_year := regexp_replace(v_normalized_text, '.*?(\d+)\s*[/\.-]\s*(\d{4}).*', '\2');

    -- Decizie
    ELSIF v_normalized_text ~ '(\bdecizie\b)\s*(nr\.|numarul)?\s*(\d+)\s*[/\.-]\s*(\d{4})' THEN
        v_type := 'decizie';
        v_number := regexp_replace(v_normalized_text, '.*?(\d+)\s*[/\.-]\s*(\d{4}).*', '\1');
        v_year := regexp_replace(v_normalized_text, '.*?(\d+)\s*[/\.-]\s*(\d{4}).*', '\2');

    -- Decret
    ELSIF v_normalized_text ~ '(\bdecret\b)\s*(nr\.|numarul)?\s*(\d+)\s*[/\.-]\s*(\d{4})' THEN
        v_type := 'decret';
        v_number := regexp_replace(v_normalized_text, '.*?(\d+)\s*[/\.-]\s*(\d{4}).*', '\1');
        v_year := regexp_replace(v_normalized_text, '.*?(\d+)\s*[/\.-]\s*(\d{4}).*', '\2');

    -- Codul <nume>
    ELSIF v_normalized_text ~ '\bcodul\s+([a-z]+)' THEN
        v_type := 'cod';
        v_number := regexp_replace(v_normalized_text, '.*?codul\s+([a-z]+).*', '\1');
        v_year := NULL;
    ELSE
        v_type := NULL; v_number := NULL; v_year := NULL;
    END IF;

    v_result := jsonb_build_object(
        'type', v_type,
        'number', v_number,
        'year', v_year,
        'normalized_text', v_normalized_text,
        'confidence', CASE WHEN v_type IS NOT NULL THEN 0.9 ELSE 0.3 END
    );
    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.normalize_legislative_identifier(TEXT) IS 'Extins: abrevieri (HG/OUG/OG), diacritice, delimitatori flexibili, Codul <nume>';

-- 2) Îmbunătățire resolve_legislative_identifier: fallback pe content.title, scoruri mai bune, mai multe căi
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
    v_id JSONB;
    v_type TEXT; v_num TEXT; v_year TEXT; v_norm TEXT; v_conf FLOAT;
BEGIN
    v_id := public.normalize_legislative_identifier(p_text);
    v_type := v_id->>'type'; v_num := v_id->>'number'; v_year := v_id->>'year'; v_norm := v_id->>'normalized_text'; v_conf := (v_id->>'confidence')::FLOAT;

    -- 2.1 potrivire exactă după tip/număr/an în title
    IF v_type IS NOT NULL AND v_num IS NOT NULL AND v_year IS NOT NULL THEN
        RETURN QUERY
        SELECT s.id, s.title, 0.96::FLOAT, 'exact_identifier_match'
        FROM public.stiri s
        WHERE s.title ILIKE '%' || v_type || '%'
          AND s.title ~ ('\\m' || v_num || '\\M')
          AND s.title ~ ('\\m' || v_year || '\\M')
        ORDER BY s.publication_date DESC
        LIMIT 1;
        IF FOUND THEN RETURN; END IF;
    END IF;

    -- 2.2 potrivire parțială: tip + număr în title sau content.title
    RETURN QUERY
    SELECT s.id, s.title,
           CASE 
             WHEN v_type IS NOT NULL AND v_num IS NOT NULL AND (s.title ~ ('\\m' || v_num || '\\M')) THEN 0.8
             WHEN v_type IS NOT NULL THEN 0.65
             WHEN s.title ILIKE '%' || p_text || '%' THEN 0.45
             ELSE 0.35
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

COMMENT ON FUNCTION public.resolve_legislative_identifier(TEXT) IS 'Îmbunătățit: potriviri exacte și parțiale pe title, scoruri calibrate';

-- 3) Job periodic: rezolvă referințe externe către ținte interne
CREATE OR REPLACE FUNCTION public.resolve_external_legislative_references(
    p_limit INT DEFAULT 1000
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_row RECORD;
    v_res RECORD;
    v_updated INT := 0;
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
        -- Alege textul cel mai promițător pentru rezolvare
        PERFORM NULL;
        SELECT * INTO v_res
        FROM public.resolve_legislative_identifier(
            COALESCE(
                v_row.metadata->'normalized_identifier'->>'type' || ' ' ||
                v_row.metadata->'normalized_identifier'->>'number' || '/' ||
                v_row.metadata->'normalized_identifier'->>'year',
                v_row.metadata->>'external_identifier'
            )
        )
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
                    'resolved_at', NOW()
                ), true),
                updated_at = NOW()
            WHERE id = v_row.id;
            v_updated := v_updated + 1;
        END IF;
    END LOOP;

    RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION public.resolve_external_legislative_references(INT) IS 'Leagă conexiunile externe de ținte interne când actele apar în stiri';


