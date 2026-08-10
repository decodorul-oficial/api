-- =====================================================
-- MIGRAȚIA 093: Citation identity (multi-slash, issuer gap,
-- nr.? after strip, self-subject skip, re-extract batch)
-- Non-breaking: CREATE OR REPLACE FUNCTION only
-- =====================================================

-- 1) normalize — compound multi-slash, din-year, issuer gap
CREATE OR REPLACE FUNCTION public.normalize_legislative_identifier(
    p_text TEXT
) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
AS $fn$
DECLARE
    v_result JSONB;
    v_normalized_text TEXT;
    v_work TEXT;
    v_type TEXT;
    v_number TEXT;
    v_year TEXT;
    v_issuer TEXT;
    v_num_raw TEXT;
    v_match TEXT[];
    v_blob TEXT;
    v_parts TEXT[];
    v_last TEXT;
    -- Capture number blob (may include trailing /year); year split below
    v_num_blob_re TEXT :=
      '((?:[\d.]+(?:\s*/\s*[\d.]+)*)(?:\s+din\s+(?:\d{1,2}\s+[a-z]+\s+)?\d{4})?)';
    v_issuer_gap TEXT :=
      '(?:\s+(?:[a-z]{1,12}|mf|mt|mai|ms|mti|mmss|mmftss)[,\s]*)*';
    v_nr_opt TEXT := '\s*(?:nr\.?|numarul)?\s*';
BEGIN
    v_normalized_text := public.roman_to_arabic(lower(trim(coalesce(p_text, ''))));
    v_normalized_text := translate(
        v_normalized_text,
        'ăâîșțÁÂÎȘȚàáâãäåæçèéêëìíîïñòóôõöùúûüýÿ',
        'aaistAAISTaaaaaaaceeeeiiiinooooouuuuyy'
    );
    v_normalized_text := regexp_replace(v_normalized_text, '\s+', ' ', 'g');

    v_work := v_normalized_text;

    -- Peel "Art. … din <act>" / "Anexa … la <act>" / "alin. … din <act>"
    IF v_work ~ '(^|\s)(art\.?|articolul|alin\.?|alineatul|anexa|anexei|anexele)\M'
       AND v_work ~ '\s(din|la)\s+(legea?|legii|hg|h\.g\.|oug|og|hotar|ordonanta|ordinul|ordin|decretul|decret|decizia|decizie)'
    THEN
        v_work := regexp_replace(
            v_work,
            '^.*\s(din|la)\s+((legea?|legii|hg|h\.g\.|oug|og|hotar[^ ]*|ordonanta[^ ]*|ordinul|ordin|decretul|decret|decizia|decizie).*)$',
            '\2'
        );
    END IF;

    v_type := NULL;
    v_num_raw := NULL;
    v_year := NULL;
    v_issuer := NULL;
    v_blob := NULL;

    -- HG
    IF v_work ~ ('(\mhg\M|h\.g\.|hotar\w*\s+guvern\w*)' || v_issuer_gap || v_nr_opt || v_num_blob_re) THEN
        v_type := 'hg';
        v_match := regexp_match(
            v_work,
            '(\mhg\M|h\.g\.|hotar\w*\s+guvern\w*)' || v_issuer_gap || v_nr_opt || v_num_blob_re
        );
        v_blob := v_match[array_length(v_match, 1)];
    -- OUG (before OG)
    ELSIF v_work ~ ('(\moug\M|ordonanta\s+de\s+urgenta(?:\s+a\s+guvernului)?)' || v_issuer_gap || v_nr_opt || v_num_blob_re) THEN
        v_type := 'oug';
        v_match := regexp_match(
            v_work,
            '(\moug\M|ordonanta\s+de\s+urgenta(?:\s+a\s+guvernului)?)' || v_issuer_gap || v_nr_opt || v_num_blob_re
        );
        v_blob := v_match[array_length(v_match, 1)];
    -- OG
    ELSIF v_work ~ ('(\mog\M|ordonanta(?:\s+guvernului)?)' || v_issuer_gap || v_nr_opt || v_num_blob_re) THEN
        v_type := 'og';
        v_match := regexp_match(
            v_work,
            '(\mog\M|ordonanta(?:\s+guvernului)?)' || v_issuer_gap || v_nr_opt || v_num_blob_re
        );
        v_blob := v_match[array_length(v_match, 1)];
    -- Lege
    ELSIF v_work ~ ('(\mlegea\M|\mlegii\M|\mlege\M)' || v_issuer_gap || v_nr_opt || v_num_blob_re) THEN
        v_type := 'lege';
        v_match := regexp_match(
            v_work,
            '(\mlegea\M|\mlegii\M|\mlege\M)' || v_issuer_gap || v_nr_opt || v_num_blob_re
        );
        v_blob := v_match[array_length(v_match, 1)];
    -- Ordin (incl. comun / MS / MT, MF …)
    ELSIF v_work ~ ('(\mordinul\M|\mordin\M)' || v_issuer_gap || v_nr_opt || v_num_blob_re) THEN
        v_type := 'ordin';
        v_match := regexp_match(
            v_work,
            '(\mordinul\M|\mordin\M)((?:\s+(?:[a-z]{1,12}|mf|mt|mai|ms|mti|mmss|mmftss)[,\s]*)*)' || v_nr_opt || v_num_blob_re
        );
        v_issuer := nullif(trim(both ' ,' from coalesce(v_match[2], '')), '');
        v_blob := v_match[3];
    -- Decizie
    ELSIF v_work ~ ('(\mdecizia\M|\mdecizie\M)' || v_issuer_gap || v_nr_opt || v_num_blob_re) THEN
        v_type := 'decizie';
        v_match := regexp_match(
            v_work,
            '(\mdecizia\M|\mdecizie\M)((?:\s+(?:[a-z]{1,12}|ccr|senatului)[,\s]*)*)' || v_nr_opt || v_num_blob_re
        );
        v_issuer := nullif(trim(both ' ,' from coalesce(v_match[2], '')), '');
        v_blob := v_match[3];
    -- Decret
    ELSIF v_work ~ ('(\mdecretul\M|\mdecret\M)' || v_issuer_gap || v_nr_opt || v_num_blob_re) THEN
        v_type := 'decret';
        v_match := regexp_match(
            v_work,
            '(\mdecretul\M|\mdecret\M)' || v_issuer_gap || v_nr_opt || v_num_blob_re
        );
        v_blob := v_match[array_length(v_match, 1)];
    -- Codul <nume compus>
    ELSIF v_work ~ '\mcodul\s+((de\s+)?[a-z]+(\s+[a-z]+){0,3})' THEN
        v_type := 'cod';
        v_num_raw := (regexp_match(v_work, '\mcodul\s+((de\s+)?[a-z]+(\s+[a-z]+){0,3})'))[1];
        v_num_raw := regexp_replace(trim(v_num_raw), '\s+(privind|din|si|sau|pentru)\M.*$', '');
        IF v_num_raw IN ('de', 'al', 'a', 'din') OR length(v_num_raw) < 4 THEN
            v_type := NULL;
            v_num_raw := NULL;
            v_year := NULL;
        ELSE
            v_year := NULL;
        END IF;
    END IF;

    -- Split blob into number(+compound) and year (last /YYYY or "din … YYYY")
    IF v_blob IS NOT NULL THEN
        IF v_blob ~ '\sdin\s+' THEN
            v_year := (regexp_match(v_blob, 'din\s+(?:\d{1,2}\s+[a-z]+\s+)?(\d{4})'))[1];
            v_num_raw := trim(regexp_replace(v_blob, '\s+din\s+.*$', ''));
        ELSE
            v_parts := string_to_array(regexp_replace(v_blob, '\s*/\s*', '/', 'g'), '/');
            IF array_length(v_parts, 1) >= 2 THEN
                v_last := v_parts[array_length(v_parts, 1)];
                IF v_last ~ '^\d{4}$' THEN
                    v_year := v_last;
                    v_num_raw := array_to_string(v_parts[1:array_length(v_parts, 1) - 1], '/');
                ELSE
                    v_type := NULL;
                    v_num_raw := NULL;
                    v_year := NULL;
                END IF;
            ELSE
                v_type := NULL;
                v_num_raw := NULL;
                v_year := NULL;
            END IF;
        END IF;
    END IF;

    IF v_num_raw IS NOT NULL AND v_type IS DISTINCT FROM 'cod' THEN
        -- strip thousand-dots inside each segment; keep / separators for compound
        v_number := (
            SELECT string_agg(regexp_replace(trim(seg), '\.', '', 'g'), '/')
            FROM unnest(string_to_array(regexp_replace(v_num_raw, '\s*/\s*', '/', 'g'), '/')) AS seg
            WHERE trim(seg) <> ''
        );
    ELSIF v_type = 'cod' AND v_num_raw IS NOT NULL THEN
        v_number := v_num_raw;
    ELSE
        v_number := NULL;
    END IF;

    v_result := jsonb_build_object(
        'type', v_type,
        'number', v_number,
        'year', v_year,
        'issuer', v_issuer,
        'normalized_text', v_normalized_text,
        'confidence', CASE WHEN v_type IS NOT NULL THEN 0.9 ELSE 0.3 END
    );
    RETURN v_result;
END;
$fn$;

COMMENT ON FUNCTION public.normalize_legislative_identifier(TEXT) IS
  'Normalizează identificatori (v5: multi-slash, din-year, issuer gap, Art./Anexa peel)';

-- 2) resolve — nr.? after strip, issuer gap, compound exact, no year-less numbered match
CREATE OR REPLACE FUNCTION public.resolve_legislative_identifier(
    p_text TEXT
) RETURNS TABLE(
    document_id BIGINT,
    title TEXT,
    match_confidence DOUBLE PRECISION,
    match_method TEXT
)
LANGUAGE plpgsql STABLE
AS $fn$
DECLARE
    v_id JSONB;
    v_type TEXT;
    v_num TEXT;
    v_year TEXT;
    v_id_pattern TEXT;
    v_pipe_pattern TEXT;
    v_num_re TEXT;
    v_gap TEXT := '(?:\s+[a-z]{1,12}|\s*,)*\s*';
    v_nr TEXT := '(?:nr\.?|numarul)?\s*';
BEGIN
    v_id := public.normalize_legislative_identifier(p_text);
    v_type := v_id->>'type';
    v_num := v_id->>'number';
    v_year := v_id->>'year';

    IF v_type IS NULL THEN
        RETURN;
    END IF;

    IF v_type = 'cod' THEN
        IF v_num IS NULL OR length(v_num) < 4 THEN
            RETURN;
        END IF;
        v_id_pattern := 'codul\s+' || replace(v_num, ' ', '\s+');
        v_pipe_pattern := v_id_pattern;

        RETURN QUERY
        SELECT s.id, s.title, 0.965::DOUBLE PRECISION, 'exact_identifier_match'::TEXT
        FROM public.stiri s
        WHERE regexp_replace(lower(coalesce(split_part(s.title, '|', 2), s.title)), '\.', '', 'g')
              ~* v_pipe_pattern
        ORDER BY s.publication_date DESC
        LIMIT 1;
        IF FOUND THEN
            RETURN;
        END IF;

        RETURN QUERY
        SELECT s.id, s.title, 0.92::DOUBLE PRECISION, 'exact_identifier_match'::TEXT
        FROM public.stiri s
        WHERE regexp_replace(lower(s.title), '\.', '', 'g') ~* v_id_pattern
        ORDER BY s.publication_date DESC
        LIMIT 1;
        RETURN;
    END IF;

    -- Numbered acts require year (avoids cross-type / false friends)
    IF v_num IS NULL OR v_year IS NULL THEN
        RETURN;
    END IF;

    -- Escape compound number for regex: 589/993/902 → 589\s*/\s*993\s*/\s*902
    v_num_re := replace(v_num, '/', '\s*/\s*');

    v_id_pattern := CASE v_type
        WHEN 'hg' THEN
            '(hg|h\.g\.|hotar\w*\s+guvern\w*)' || v_gap || v_nr || v_num_re || '\s*[/.-]\s*' || v_year
        WHEN 'oug' THEN
            '(oug|ordonanta\s+de\s+urgenta(?:\s+a\s+guvernului)?)' || v_gap || v_nr || v_num_re || '\s*[/.-]\s*' || v_year
        WHEN 'og' THEN
            '(og|ordonanta(?:\s+guvernului)?)' || v_gap || v_nr || v_num_re || '\s*[/.-]\s*' || v_year
        WHEN 'lege' THEN
            '(legea|legii|lege|\ml\M)' || v_gap || v_nr || v_num_re || '\s*[/.-]\s*' || v_year
        WHEN 'ordin' THEN
            '(ordinul|ordin)' || v_gap || v_nr || v_num_re || '\s*[/.-]\s*' || v_year
        WHEN 'decizie' THEN
            '(decizia|decizie)' || v_gap || v_nr || v_num_re || '\s*[/.-]\s*' || v_year
        WHEN 'decret' THEN
            '(decretul|decret)' || v_gap || v_nr || v_num_re || '\s*[/.-]\s*' || v_year
        ELSE
            v_type || v_gap || v_nr || v_num_re || '\s*[/.-]\s*' || v_year
    END;
    v_pipe_pattern := v_id_pattern;

    RETURN QUERY
    SELECT s.id, s.title, 0.965::DOUBLE PRECISION, 'exact_identifier_match'::TEXT
    FROM public.stiri s
    WHERE regexp_replace(lower(coalesce(split_part(s.title, '|', 2), s.title)), '\.', '', 'g')
          ~* v_pipe_pattern
    ORDER BY s.publication_date DESC
    LIMIT 1;
    IF FOUND THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT s.id, s.title, 0.92::DOUBLE PRECISION, 'exact_identifier_match'::TEXT
    FROM public.stiri s
    WHERE regexp_replace(lower(s.title), '\.', '', 'g') ~* v_id_pattern
    ORDER BY s.publication_date DESC
    LIMIT 1;

    RETURN;
END;
$fn$;

COMMENT ON FUNCTION public.resolve_legislative_identifier(TEXT) IS
  'Rezolvă tip+nr[/compound]/an pe titlu (v5: nr.?, issuer gap; fără match fără an)';

-- 3) extract — skip self-subject externals; extraction_version 5.0
CREATE OR REPLACE FUNCTION public.extract_legislative_connections(
    p_stire_id BIGINT,
    p_content TEXT,
    p_entities JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
    v_entity RECORD;
    v_relationship_type TEXT;
    v_confidence_score FLOAT;
    v_window TEXT;
    v_resolved_document RECORD;
    v_external_identifier TEXT;
    v_error_count INTEGER := 0;
    v_success_count INTEGER := 0;
    v_external_count INTEGER := 0;
    v_skipped_self INTEGER := 0;
    v_min_match CONSTANT FLOAT := 0.55;
    v_entity_text TEXT;
    v_source_title TEXT;
    v_pipe_key TEXT;
    v_norm JSONB;
    v_is_self_subject BOOLEAN;
    v_num_re TEXT;
BEGIN
    SELECT s.title INTO v_source_title
    FROM public.stiri s
    WHERE s.id = p_stire_id;

    IF v_source_title IS NULL THEN
        RAISE NOTICE 'Știrea cu ID % nu există', p_stire_id;
        RETURN;
    END IF;

    IF p_entities IS NULL OR jsonb_typeof(p_entities) <> 'array' OR jsonb_array_length(p_entities) = 0 THEN
        RETURN;
    END IF;

    v_pipe_key := trim(split_part(v_source_title, '|', 2));
    IF v_pipe_key = '' THEN
        v_pipe_key := v_source_title;
    END IF;

    DELETE FROM public.legislative_connections
    WHERE source_document_id = p_stire_id
      AND extraction_method IN ('automatic', 'ai_enhanced', 'external_reference', 'error_handling');

    FOR v_entity IN
        SELECT * FROM jsonb_array_elements(p_entities)
        WHERE value->>'label' IN ('LEGAL_REF', 'WORK_OF_ART', 'LAW', 'LEGISLATION')
    LOOP
        BEGIN
            v_entity_text := trim(coalesce(v_entity.value->>'text', ''));
            IF v_entity_text = '' THEN
                CONTINUE;
            END IF;

            v_norm := public.normalize_legislative_identifier(v_entity_text);

            -- Self-subject: citation is the story's own act (title / pipe key)
            v_is_self_subject := (
                position(lower(v_entity_text) IN lower(v_source_title)) > 0
            );
            IF NOT v_is_self_subject
               AND v_norm->>'number' IS NOT NULL
               AND v_norm->>'year' IS NOT NULL
            THEN
                v_num_re := replace(v_norm->>'number', '/', '\s*/\s*');
                v_is_self_subject := regexp_replace(lower(v_pipe_key), '\.', '', 'g')
                    ~ (v_num_re || '\s*[/.-]\s*' || (v_norm->>'year'));
            END IF;

            SELECT * INTO v_resolved_document
            FROM public.resolve_legislative_identifier(v_entity_text)
            WHERE match_confidence >= v_min_match
            ORDER BY match_confidence DESC, document_id DESC
            LIMIT 1;

            v_window := public.extract_entity_context_window(
                coalesce(p_content, ''),
                v_entity_text,
                220
            );
            v_relationship_type := public.classify_relationship_from_window(v_window);

            IF v_resolved_document.document_id IS NOT NULL
               AND v_resolved_document.document_id <> p_stire_id
               AND v_resolved_document.match_confidence >= v_min_match
            THEN
                v_confidence_score := LEAST(v_resolved_document.match_confidence::FLOAT, 0.97::FLOAT);
                IF v_relationship_type <> 'face referire la' THEN
                    v_confidence_score := LEAST(v_confidence_score + 0.05, 0.97);
                END IF;

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
                        'resolved_identifier', v_norm,
                        'match_method', v_resolved_document.match_method,
                        'match_confidence', v_resolved_document.match_confidence,
                        'local_window', v_window,
                        'extraction_context', substring(
                            p_content FROM greatest(1, position(v_entity_text IN p_content) - 100) FOR 200
                        ),
                        'extraction_timestamp', NOW(),
                        'extraction_version', '5.0'
                    )
                )
                ON CONFLICT (source_document_id, target_document_id, relationship_type)
                DO UPDATE SET
                    confidence_score = GREATEST(
                        public.legislative_connections.confidence_score,
                        EXCLUDED.confidence_score
                    ),
                    metadata = public.legislative_connections.metadata || EXCLUDED.metadata,
                    updated_at = NOW();

                v_success_count := v_success_count + 1;
            ELSIF v_is_self_subject THEN
                -- Own act in title: do not emit ACT EXTERN noise
                v_skipped_self := v_skipped_self + 1;
            ELSE
                v_external_identifier := v_entity_text;

                PERFORM public.update_external_document_mention(v_external_identifier);
                v_external_count := v_external_count + 1;

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
                    'face referire la (extern)',
                    0.3,
                    'external_reference',
                    jsonb_build_object(
                        'source_entity', v_entity.value,
                        'external_identifier', v_external_identifier,
                        'normalized_identifier', v_norm,
                        'local_window', v_window,
                        'extraction_context', substring(
                            p_content FROM greatest(1, position(v_external_identifier IN p_content) - 100) FOR 200
                        ),
                        'is_external', true,
                        'extraction_timestamp', NOW(),
                        'extraction_version', '5.0'
                    )
                )
                ON CONFLICT (source_document_id, target_document_id, relationship_type)
                DO UPDATE SET
                    metadata = public.legislative_connections.metadata || EXCLUDED.metadata,
                    updated_at = NOW();
            END IF;

        EXCEPTION
            WHEN OTHERS THEN
                v_error_count := v_error_count + 1;
                RAISE NOTICE 'Eroare la procesarea entității %: %', v_entity.value->>'text', SQLERRM;
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
                        'error_timestamp', NOW()
                    )
                )
                ON CONFLICT (source_document_id, target_document_id, relationship_type)
                DO UPDATE SET
                    metadata = EXCLUDED.metadata,
                    updated_at = NOW();
        END;
    END LOOP;

    RAISE NOTICE 'Extragere știre %: succes %, externe %, self-skip %, erori %',
        p_stire_id, v_success_count, v_external_count, v_skipped_self, v_error_count;
END;
$fn$;

COMMENT ON FUNCTION public.extract_legislative_connections(BIGINT, TEXT, JSONB) IS
  'Extrage conexiuni din LEGAL_REF/… (v5.0); skip self-subject externals';

-- 4) enrich — multi-slash + issuer abbreviations
CREATE OR REPLACE FUNCTION public.enrich_legal_refs_from_text(p_stire_id BIGINT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_title TEXT;
  v_body TEXT;
  v_haystack TEXT;
  v_ner JSONB;
  v_existing TEXT[];
  v_matches TEXT[];
  v_m TEXT;
  v_added INT := 0;
  v_new_ner JSONB;
BEGIN
  SELECT s.title, COALESCE(s.content->>'body', ''), COALESCE(s.content->'ner', '[]'::jsonb)
  INTO v_title, v_body, v_ner
  FROM public.stiri s
  WHERE s.id = p_stire_id;

  IF v_title IS NULL THEN
    RETURN 0;
  END IF;

  IF jsonb_typeof(v_ner) <> 'array' THEN
    v_ner := '[]'::jsonb;
  END IF;

  SELECT COALESCE(array_agg(lower(trim(e->>'text'))), ARRAY[]::TEXT[])
  INTO v_existing
  FROM jsonb_array_elements(v_ner) e
  WHERE e->>'label' = 'LEGAL_REF';

  v_haystack := v_title || ' ' || v_body;

  SELECT COALESCE(array_agg(DISTINCT m[1]), ARRAY[]::TEXT[])
  INTO v_matches
  FROM regexp_matches(
    v_haystack,
    '(?i)((?:Ordonanța de urgență(?: a Guvernului)?|OUG|Ordonanța(?: Guvernului)?|OG|Hotărârea(?: Guvernului)?|HG|Legea|Legii|Lege|Ordinul|Ordin|Decretul|Decret|Decizia|Decizie)'
      || '(?:\s+[A-Za-zĂÂÎȘȚăâîșț]{1,12}|\s*,)*\s*'
      || '(?:nr\.?|numărul|numarul)?\s*'
      || '[\d.]+(?:\s*/\s*[\d.]+)*\s*'
      || '(?:/\s*\d{4}|din\s+(?:\d{1,2}\s+\w+\s+)?\d{4}))',
    'gi'
  ) AS m;

  v_new_ner := v_ner;
  IF v_matches IS NOT NULL THEN
    FOREACH v_m IN ARRAY v_matches LOOP
      IF v_m IS NULL OR length(trim(v_m)) < 5 THEN
        CONTINUE;
      END IF;
      IF lower(trim(v_m)) = ANY (v_existing) THEN
        CONTINUE;
      END IF;
      IF (public.normalize_legislative_identifier(v_m)->>'type') IS NULL THEN
        CONTINUE;
      END IF;
      v_new_ner := v_new_ner || jsonb_build_array(jsonb_build_object('text', trim(v_m), 'label', 'LEGAL_REF'));
      v_existing := array_append(v_existing, lower(trim(v_m)));
      v_added := v_added + 1;
    END LOOP;
  END IF;

  IF v_added > 0 THEN
    UPDATE public.stiri
    SET content = jsonb_set(content, '{ner}', v_new_ner, true)
    WHERE id = p_stire_id;
  END IF;

  RETURN v_added;
END;
$fn$;

COMMENT ON FUNCTION public.enrich_legal_refs_from_text(BIGINT) IS
  'Adaugă LEGAL_REF lipsă din title/body (v5: multi-slash + issuer)';

-- 5) Backfill helper: re-extract all stories that already have legal entities
CREATE OR REPLACE FUNCTION public.reextract_legislative_connections_batch(
    p_limit INT DEFAULT 100,
    p_offset INT DEFAULT 0,
    p_months INT DEFAULT 24
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_rec RECORD;
  v_count INT := 0;
  v_entities JSONB;
  v_body TEXT;
BEGIN
  FOR v_rec IN
    SELECT s.id
    FROM public.stiri s
    WHERE s.publication_date > CURRENT_DATE - make_interval(months => greatest(p_months, 1))
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(s.entities) = 'array' THEN s.entities
            ELSE '[]'::jsonb
          END
        ) e
        WHERE e->>'label' IN ('LEGAL_REF', 'WORK_OF_ART', 'LAW', 'LEGISLATION')
      )
    ORDER BY s.id
    LIMIT p_limit OFFSET p_offset
  LOOP
    BEGIN
      SELECT
        COALESCE(s.entities, '[]'::jsonb),
        COALESCE(s.content->>'body', s.content->>'text', s.title)
      INTO v_entities, v_body
      FROM public.stiri s
      WHERE s.id = v_rec.id;

      IF jsonb_typeof(v_entities) = 'array'
         AND jsonb_array_length(v_entities) > 0
      THEN
        PERFORM public.extract_legislative_connections(v_rec.id, v_body, v_entities);
      END IF;

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'reextract error id=%: %', v_rec.id, SQLERRM;
    END;
  END LOOP;
  RETURN v_count;
END;
$fn$;

COMMENT ON FUNCTION public.reextract_legislative_connections_batch(INT, INT, INT) IS
  'Re-extract conexiuni pe știri cu LEGAL_REF/… (backfill după fix identity)';

-- 6) resolve_external: skip self-targets; no title/body fallback; handle unique conflicts
CREATE OR REPLACE FUNCTION public.resolve_external_legislative_references(
    p_limit integer DEFAULT 1000
)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    v_row RECORD;
    v_res RECORD;
    v_updated INT := 0;
    v_candidate TEXT;
    v_ctx TEXT;
    v_new_rel TEXT;
BEGIN
    FOR v_row IN
        SELECT lc.id, lc.source_document_id, lc.target_document_id, lc.relationship_type, lc.metadata,
               s.title AS source_title, s.content->>'body' AS source_body
        FROM public.legislative_connections lc
        LEFT JOIN public.stiri s ON s.id = lc.source_document_id
        WHERE lc.target_document_id IS NULL
          AND (lc.relationship_type ILIKE 'face referire la%')
          AND (
              lc.metadata->>'external_identifier' IS NOT NULL
              OR lc.metadata->'normalized_identifier' IS NOT NULL
              OR lc.metadata->>'extraction_context' IS NOT NULL
          )
        ORDER BY lc.id DESC
        LIMIT p_limit
    LOOP
        v_candidate := NULL;

        IF (v_row.metadata->'normalized_identifier'->>'type') IS NOT NULL
           AND (v_row.metadata->'normalized_identifier'->>'number') IS NOT NULL
           AND (v_row.metadata->'normalized_identifier'->>'year') IS NOT NULL THEN
          v_candidate := (v_row.metadata->'normalized_identifier'->>'type') || ' ' ||
                         (v_row.metadata->'normalized_identifier'->>'number') || '/' ||
                         (v_row.metadata->'normalized_identifier'->>'year');
        END IF;

        IF v_candidate IS NULL AND (v_row.metadata->>'external_identifier') IS NOT NULL THEN
          v_candidate := public.extract_first_identifier_from_text(v_row.metadata->>'external_identifier');
        END IF;

        IF v_candidate IS NULL AND (v_row.metadata->>'extraction_context') IS NOT NULL THEN
          v_ctx := public.sanitize_identifier_text(v_row.metadata->>'extraction_context');
          v_candidate := public.extract_first_identifier_from_text(v_ctx);
        END IF;

        -- Avoid title/body fallback: often resolves to the source story itself
        IF v_candidate IS NULL THEN
            CONTINUE;
        END IF;

        SELECT * INTO v_res
        FROM public.resolve_legislative_identifier(v_candidate)
        WHERE match_confidence >= 0.70
        ORDER BY match_confidence DESC
        LIMIT 1;

        IF v_res.document_id IS NULL
           OR v_res.document_id = v_row.source_document_id THEN
            CONTINUE;
        END IF;

        v_new_rel := CASE
            WHEN v_row.relationship_type = 'face referire la (extern)' THEN 'face referire la'
            ELSE v_row.relationship_type
        END;

        IF EXISTS (
            SELECT 1 FROM public.legislative_connections x
            WHERE x.source_document_id = v_row.source_document_id
              AND x.target_document_id = v_res.document_id
              AND x.relationship_type = v_new_rel
              AND x.id <> v_row.id
        ) THEN
            DELETE FROM public.legislative_connections WHERE id = v_row.id;
            v_updated := v_updated + 1;
            CONTINUE;
        END IF;

        BEGIN
            UPDATE public.legislative_connections
            SET target_document_id = v_res.document_id,
                relationship_type = v_new_rel,
                confidence_score = GREATEST(confidence_score, LEAST(v_res.match_confidence::FLOAT, 0.92)),
                extraction_method = 'ai_enhanced',
                metadata = jsonb_set(
                    COALESCE(metadata, '{}'::jsonb),
                    '{resolution}',
                    jsonb_build_object(
                        'method', v_res.match_method,
                        'confidence', v_res.match_confidence,
                        'resolved_at', NOW(),
                        'candidate', v_candidate
                    ),
                    true
                ),
                updated_at = NOW()
            WHERE id = v_row.id;
            v_updated := v_updated + 1;
        EXCEPTION WHEN unique_violation THEN
            DELETE FROM public.legislative_connections WHERE id = v_row.id;
        END;
    END LOOP;

    RETURN v_updated;
END;
$function$;

COMMENT ON FUNCTION public.resolve_external_legislative_references(INT) IS
  'Rezolvă externe→interne (v5: skip self, fără title/body fallback, unique-safe)';
