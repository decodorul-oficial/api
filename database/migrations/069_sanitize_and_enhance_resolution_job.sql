-- =====================================================
-- MIGRAȚIA 069: SANITIZARE IDENTIFICATOR + EXTRAGERE CANDIDAT DIN CONTEXT/TITLE/BODY
-- =====================================================

-- 1) Sanitizare text identificator
CREATE OR REPLACE FUNCTION public.sanitize_identifier_text(p_text TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v TEXT := COALESCE(p_text, '');
BEGIN
  -- elimină tag-uri HTML
  v := regexp_replace(v, '<[^>]+>', ' ', 'g');
  -- păstrează doar litere/cifre/spații și delimitatori utili
  v := regexp_replace(v, '[^a-zA-Z0-9\s\./-]', ' ', 'g');
  -- comprimă spațiile
  v := regexp_replace(v, '\s+', ' ', 'g');
  RETURN trim(v);
END;
$$;

COMMENT ON FUNCTION public.sanitize_identifier_text(TEXT) IS 'Înlătură HTML și caractere nerelevante, comprimă spațiile';

-- 2) Extrage primul identificator de forma <tip> nr <num>/<an> din text
CREATE OR REPLACE FUNCTION public.extract_first_identifier_from_text(p_text TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v TEXT := lower(public.sanitize_identifier_text(p_text));
  m TEXT[];
  t TEXT; n TEXT; y TEXT;
BEGIN
  -- pattern: (tip) (nr|numarul)? (num) (/|.|-) (yyyy)
  SELECT regexp_matches(v, '(legea?|lege|hg|h\.g\.|hot\S*|oug|o\.u\.g\.|og|ordin|decizie|decret)\s*(nr\.|numarul)?\s*(\d+)\s*[\./-]\s*(\d{4})', 'i')
  INTO m;
  IF m IS NULL THEN RETURN NULL; END IF;
  t := m[1]; n := m[3]; y := m[4];
  -- normalizează tipul pentru inputul către resolve()
  IF t ~* '^h' OR t ~* '^hg' THEN t := 'hg';
  ELSIF t ~* '^oug' THEN t := 'oug';
  ELSIF t ~* '^og' THEN t := 'og';
  ELSIF t ~* '^lege' THEN t := 'lege';
  ELSIF t ~* '^decizie' THEN t := 'decizie';
  ELSIF t ~* '^decret' THEN t := 'decret';
  ELSE t := t; END IF;
  RETURN t || ' ' || n || '/' || y;
END;
$$;

COMMENT ON FUNCTION public.extract_first_identifier_from_text(TEXT) IS 'Găsește primul identificator (tip număr/an) în text';

-- 3) Actualizează jobul: încearcă mai multe surse pentru candidat
CREATE OR REPLACE FUNCTION public.resolve_external_legislative_references(
    p_limit INT DEFAULT 1000
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_row RECORD;
    v_res RECORD;
    v_updated INT := 0;
    v_candidate TEXT;
    v_source_title TEXT;
    v_source_body TEXT;
    v_ctx TEXT;
BEGIN
    FOR v_row IN 
        SELECT lc.id, lc.source_document_id, lc.target_document_id, lc.relationship_type, lc.metadata,
               s.title as source_title, s.content->>'body' as source_body
        FROM public.legislative_connections lc
        LEFT JOIN public.stiri s ON s.id = lc.source_document_id
        WHERE lc.target_document_id IS NULL
          AND (lc.relationship_type ILIKE 'face referire la%')
          AND (lc.metadata->>'external_identifier' IS NOT NULL OR lc.metadata->'normalized_identifier' IS NOT NULL OR lc.metadata->>'extraction_context' IS NOT NULL)
        ORDER BY lc.id DESC
        LIMIT p_limit
    LOOP
        -- 3.1 Din normalized_identifier (dacă are toate componentele)
        v_candidate := NULL;
        IF (v_row.metadata->'normalized_identifier'->>'type') IS NOT NULL
           AND (v_row.metadata->'normalized_identifier'->>'number') IS NOT NULL
           AND (v_row.metadata->'normalized_identifier'->>'year') IS NOT NULL THEN
          v_candidate := (v_row.metadata->'normalized_identifier'->>'type') || ' ' ||
                         (v_row.metadata->'normalized_identifier'->>'number') || '/' ||
                         (v_row.metadata->'normalized_identifier'->>'year');
        END IF;

        -- 3.2 Altfel din external_identifier (sanitizat)
        IF v_candidate IS NULL AND (v_row.metadata->>'external_identifier') IS NOT NULL THEN
          v_candidate := public.extract_first_identifier_from_text(v_row.metadata->>'external_identifier');
        END IF;

        -- 3.3 Altfel din extraction_context
        IF v_candidate IS NULL AND (v_row.metadata->>'extraction_context') IS NOT NULL THEN
          v_ctx := public.sanitize_identifier_text(v_row.metadata->>'extraction_context');
          v_candidate := public.extract_first_identifier_from_text(v_ctx);
        END IF;

        -- 3.4 Altfel din titlul știrii sursă
        IF v_candidate IS NULL AND v_row.source_title IS NOT NULL THEN
          v_source_title := public.sanitize_identifier_text(v_row.source_title);
          v_candidate := public.extract_first_identifier_from_text(v_source_title);
        END IF;

        -- 3.5 Altfel din body știre
        IF v_candidate IS NULL AND v_row.source_body IS NOT NULL THEN
          v_source_body := public.sanitize_identifier_text(v_row.source_body);
          v_candidate := public.extract_first_identifier_from_text(v_source_body);
        END IF;

        -- Dacă încă nu avem candidat, sar peste
        IF v_candidate IS NULL THEN CONTINUE; END IF;

        -- Rezolvare
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

COMMENT ON FUNCTION public.resolve_external_legislative_references(INT) IS 'Îmbunătățit: candidate din normalized_identifier, external_identifier, context, titlu și body';


