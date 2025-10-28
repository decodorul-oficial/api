-- =====================================================
-- MIGRAȚIA 070: NEXT STEPS - ROMAN NUMERALS, BODY SEARCH, RECENT JOB, STATS
-- =====================================================

-- 1) Funcție: convert roman numerals (I, II, III, IV, V, VI, VII, VIII, IX, X) to arabic
CREATE OR REPLACE FUNCTION public.roman_to_arabic(p_text TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE v TEXT := lower(coalesce(p_text, '')); BEGIN
  v := regexp_replace(v, '\\bix\\b', '9', 'g');
  v := regexp_replace(v, '\\biv\\b', '4', 'g');
  v := regexp_replace(v, '\\bviii\\b', '8', 'g');
  v := regexp_replace(v, '\\bvii\\b', '7', 'g');
  v := regexp_replace(v, '\\bvi\\b', '6', 'g');
  v := regexp_replace(v, '\\bx\\b', '10', 'g');
  v := regexp_replace(v, '\\bv\\b', '5', 'g');
  v := regexp_replace(v, '\\biii\\b', '3', 'g');
  v := regexp_replace(v, '\\bii\\b', '2', 'g');
  v := regexp_replace(v, '\\bi\\b', '1', 'g');
  RETURN v; END; $$;

COMMENT ON FUNCTION public.roman_to_arabic(TEXT) IS 'Înlocuiește cifre romane simple cu cifre arabe (1-10)';

-- 2) Extinde normalize_legislative_identifier să aplice roman_to_arabic și sinonime suplimentare
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
    v_normalized_text := public.roman_to_arabic(lower(trim(p_text)));
    v_normalized_text := translate(v_normalized_text, 'ăâîșțÁÂÎȘȚàáâãäåæçèéêëìíîïñòóôõöùúûüýÿ', 'aaistAAISTaaaaaaaceeeeiiiinooooouuuuyy');
    v_normalized_text := regexp_replace(v_normalized_text, '\\s+', ' ', 'g');

    -- HG synonyms: hg, h.g., hotararea guvernului
    IF v_normalized_text ~ '(\\bhg\\b|h\\.g\\\.|hotar(\\w*)? guvern(\\w*)?)\\s*(nr\\.|numarul)?\\s*(\\d+)\\s*[/\\.-]\\s*(\\d{4})' THEN
        v_type := 'hg';
        v_number := regexp_replace(v_normalized_text, '.*?(\\d+)\\s*[/\\.-]\\s*(\\d{4}).*', '\\1');
        v_year := regexp_replace(v_normalized_text, '.*?(\\d+)\\s*[/\\.-]\\s*(\\d{4}).*', '\\2');
    ELSIF v_normalized_text ~ '(\\boug\\b|ordonanta de urgenta)\\s*(nr\\.|numarul)?\\s*(\\d+)\\s*[/\\.-]\\s*(\\d{4})' THEN
        v_type := 'oug';
        v_number := regexp_replace(v_normalized_text, '.*?(\\d+)\\s*[/\\.-]\\s*(\\d{4}).*', '\\1');
        v_year := regexp_replace(v_normalized_text, '.*?(\\d+)\\s*[/\\.-]\\s*(\\d{4}).*', '\\2');
    ELSIF v_normalized_text ~ '(\\bog\\b|ordonanta)\\s*(nr\\.|numarul)?\\s*(\\d+)\\s*[/\\.-]\\s*(\\d{4})' THEN
        v_type := 'og';
        v_number := regexp_replace(v_normalized_text, '.*?(\\d+)\\s*[/\\.-]\\s*(\\d{4}).*', '\\1');
        v_year := regexp_replace(v_normalized_text, '.*?(\\d+)\\s*[/\\.-]\\s*(\\d{4}).*', '\\2');
    ELSIF v_normalized_text ~ '(\\blegea?\\b|\\blege\\b)\\s*(nr\\.|numarul)?\\s*(\\d+)\\s*[/\\.-]\\s*(\\d{4})' THEN
        v_type := 'lege';
        v_number := regexp_replace(v_normalized_text, '.*?(\\d+)\\s*[/\\.-]\\s*(\\d{4}).*', '\\1');
        v_year := regexp_replace(v_normalized_text, '.*?(\\d+)\\s*[/\\.-]\\s*(\\d{4}).*', '\\2');
    ELSIF v_normalized_text ~ '(\\bdecizie\\b)\\s*(nr\\.|numarul)?\\s*(\\d+)\\s*[/\\.-]\\s*(\\d{4})' THEN
        v_type := 'decizie';
        v_number := regexp_replace(v_normalized_text, '.*?(\\d+)\\s*[/\\.-]\\s*(\\d{4}).*', '\\1');
        v_year := regexp_replace(v_normalized_text, '.*?(\\d+)\\s*[/\\.-]\\s*(\\d{4}).*', '\\2');
    ELSIF v_normalized_text ~ '(\\bdecret\\b)\\s*(nr\\.|numarul)?\\s*(\\d+)\\s*[/\\.-]\\s*(\\d{4})' THEN
        v_type := 'decret';
        v_number := regexp_replace(v_normalized_text, '.*?(\\d+)\\s*[/\\.-]\\s*(\\d{4}).*', '\\1');
        v_year := regexp_replace(v_normalized_text, '.*?(\\d+)\\s*[/\\.-]\\s*(\\d{4}).*', '\\2');
    ELSIF v_normalized_text ~ '\\bcodul\\s+([a-z]+)' THEN
        v_type := 'cod';
        v_number := regexp_replace(v_normalized_text, '.*?codul\\s+([a-z]+).*', '\\1');
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

-- 3) Extinde resolve_legislative_identifier să caute și în body pentru scorare
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
    v_type TEXT; v_num TEXT; v_year TEXT; v_norm TEXT;
BEGIN
    v_id := public.normalize_legislative_identifier(p_text);
    v_type := v_id->>'type'; v_num := v_id->>'number'; v_year := v_id->>'year'; v_norm := v_id->>'normalized_text';

    -- Exact title match (highest)
    IF v_type IS NOT NULL AND v_num IS NOT NULL AND v_year IS NOT NULL THEN
        RETURN QUERY
        SELECT s.id, s.title, 0.965::DOUBLE PRECISION, 'exact_identifier_match'
        FROM public.stiri s
        WHERE s.title ILIKE '%' || v_type || '%'
          AND s.title ~ ('\\m' || v_num || '\\M')
          AND s.title ~ ('\\m' || v_year || '\\M')
        ORDER BY s.publication_date DESC
        LIMIT 1;
        IF FOUND THEN RETURN; END IF;
    END IF;

    -- Partial title/body scoring
    RETURN QUERY
    SELECT s.id, s.title,
           (
             CASE 
               WHEN v_type IS NOT NULL AND v_num IS NOT NULL AND (s.title ~ ('\\m' || v_num || '\\M')) THEN 0.82
               WHEN v_type IS NOT NULL AND (s.content->>'body') ILIKE '%' || v_type || '%' THEN 0.7
               WHEN s.title ILIKE '%' || p_text || '%' THEN 0.48
               WHEN (s.content->>'body') ILIKE '%' || p_text || '%' THEN 0.42
               ELSE 0.36
             END
           )::DOUBLE PRECISION AS match_confidence,
           (
             CASE 
               WHEN v_type IS NOT NULL AND v_num IS NOT NULL AND (s.title ~ ('\\m' || v_num || '\\M')) THEN 'partial_identifier_match'
               WHEN v_type IS NOT NULL AND (s.content->>'body') ILIKE '%' || v_type || '%' THEN 'type_in_body_match'
               WHEN s.title ILIKE '%' || p_text || '%' THEN 'text_title_match'
               WHEN (s.content->>'body') ILIKE '%' || p_text || '%' THEN 'text_body_match'
               ELSE 'fallback_match'
             END
           ) AS match_method
    FROM public.stiri s
    WHERE (v_type IS NOT NULL AND (s.title ILIKE '%' || v_type || '%' OR (s.content->>'body') ILIKE '%' || v_type || '%'))
       OR s.title ILIKE '%' || p_text || '%'
       OR (s.content->>'body') ILIKE '%' || p_text || '%'
    ORDER BY 
      CASE 
        WHEN v_type IS NOT NULL AND v_num IS NOT NULL AND (s.title ~ ('\\m' || v_num || '\\M')) THEN 1
        WHEN v_type IS NOT NULL AND (s.content->>'body') ILIKE '%' || v_type || '%' THEN 2
        WHEN s.title ILIKE '%' || p_text || '%' THEN 3
        WHEN (s.content->>'body') ILIKE '%' || p_text || '%' THEN 4
        ELSE 5
      END,
      s.publication_date DESC
    LIMIT 5;
END;
$$;

-- 4) Job variantă recent-only (ultimele N zile)
CREATE OR REPLACE FUNCTION public.resolve_external_legislative_references_recent(
    p_days INT DEFAULT 30,
    p_limit INT DEFAULT 2000
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INT := 0;
BEGIN
    WITH cte AS (
      SELECT lc.id
      FROM public.legislative_connections lc
      JOIN public.stiri s ON s.id = lc.source_document_id
      WHERE lc.target_document_id IS NULL
        AND (lc.relationship_type ILIKE 'face referire la%')
        AND s.publication_date >= (CURRENT_DATE - (p_days || ' days')::INTERVAL)
      ORDER BY lc.id DESC
      LIMIT p_limit
    )
    SELECT public.resolve_external_legislative_references(p_limit) INTO v_count;
    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.resolve_external_legislative_references_recent(INT, INT) IS 'Rulează rezoluția pe conexiuni din ultimele N zile';

-- 5) Statistici rezoluție
CREATE OR REPLACE FUNCTION public.get_resolution_stats() RETURNS TABLE(
  total_connections BIGINT,
  unresolved BIGINT,
  resolved BIGINT,
  resolved_last_7d BIGINT,
  resolved_last_30d BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM public.legislative_connections) AS total_connections,
    (SELECT COUNT(*) FROM public.legislative_connections WHERE target_document_id IS NULL) AS unresolved,
    (SELECT COUNT(*) FROM public.legislative_connections WHERE target_document_id IS NOT NULL) AS resolved,
    (SELECT COUNT(*) FROM public.legislative_connections WHERE target_document_id IS NOT NULL AND updated_at > NOW() - INTERVAL '7 days') AS resolved_last_7d,
    (SELECT COUNT(*) FROM public.legislative_connections WHERE target_document_id IS NOT NULL AND updated_at > NOW() - INTERVAL '30 days') AS resolved_last_30d;
END;
$$;

COMMENT ON FUNCTION public.get_resolution_stats() IS 'Statistici de rezoluție a conexiunilor externe';


