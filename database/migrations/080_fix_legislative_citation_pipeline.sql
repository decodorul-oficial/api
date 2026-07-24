-- =====================================================
-- MIGRAȚIA 080: Fix citation pipeline (LEGAL_REF + normalize/resolve)
-- Non-breaking: CREATE OR REPLACE FUNCTION only — no ALTER on stiri
-- =====================================================

-- 1) roman_to_arabic: PostgreSQL word boundaries are \m / \M (not \b)
CREATE OR REPLACE FUNCTION public.roman_to_arabic(p_text TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $fn$
DECLARE
  v TEXT := lower(coalesce(p_text, ''));
BEGIN
  v := regexp_replace(v, '\mix\M', '9', 'g');
  v := regexp_replace(v, '\miv\M', '4', 'g');
  v := regexp_replace(v, '\mviii\M', '8', 'g');
  v := regexp_replace(v, '\mvii\M', '7', 'g');
  v := regexp_replace(v, '\mvi\M', '6', 'g');
  v := regexp_replace(v, '\mx\M', '10', 'g');
  v := regexp_replace(v, '\mv\M', '5', 'g');
  v := regexp_replace(v, '\miii\M', '3', 'g');
  v := regexp_replace(v, '\mii\M', '2', 'g');
  v := regexp_replace(v, '\mi\M', '1', 'g');
  RETURN v;
END;
$fn$;

COMMENT ON FUNCTION public.roman_to_arabic(TEXT) IS
  'Înlocuiește cifre romane simple cu cifre arabe (1-10); folosește \m/\M';

-- 2) normalize_legislative_identifier — regex PG-corect, ordin, Art./Anexa peel, strip dots
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
    v_num_raw TEXT;
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

    -- HG
    IF v_work ~ '(\mhg\M|h\.g\.|hotar\w*\s+guvern\w*)\s*(nr\.|numarul)?\s*([\d.]+)\s*[/.-]\s*(\d{4})' THEN
        v_type := 'hg';
        v_num_raw := (regexp_match(v_work, '(\mhg\M|h\.g\.|hotar\w*\s+guvern\w*)\s*(nr\.|numarul)?\s*([\d.]+)\s*[/.-]\s*(\d{4})'))[3];
        v_year := (regexp_match(v_work, '(\mhg\M|h\.g\.|hotar\w*\s+guvern\w*)\s*(nr\.|numarul)?\s*([\d.]+)\s*[/.-]\s*(\d{4})'))[4];
    -- OUG (before OG — "ordonanta de urgenta" must win)
    ELSIF v_work ~ '(\moug\M|ordonanta\s+de\s+urgenta)\s*(nr\.|numarul)?\s*([\d.]+)\s*[/.-]\s*(\d{4})' THEN
        v_type := 'oug';
        v_num_raw := (regexp_match(v_work, '(\moug\M|ordonanta\s+de\s+urgenta)\s*(nr\.|numarul)?\s*([\d.]+)\s*[/.-]\s*(\d{4})'))[3];
        v_year := (regexp_match(v_work, '(\moug\M|ordonanta\s+de\s+urgenta)\s*(nr\.|numarul)?\s*([\d.]+)\s*[/.-]\s*(\d{4})'))[4];
    -- OG (no lookahead; OUG already handled above)
    ELSIF v_work ~ '(\mog\M|ordonanta)\s*(nr\.|numarul)?\s*([\d.]+)\s*[/.-]\s*(\d{4})' THEN
        v_type := 'og';
        v_num_raw := (regexp_match(v_work, '(\mog\M|ordonanta)\s*(nr\.|numarul)?\s*([\d.]+)\s*[/.-]\s*(\d{4})'))[3];
        v_year := (regexp_match(v_work, '(\mog\M|ordonanta)\s*(nr\.|numarul)?\s*([\d.]+)\s*[/.-]\s*(\d{4})'))[4];
    -- Lege
    ELSIF v_work ~ '(\mlegea\M|\mlegii\M|\mlege\M)\s*(nr\.|numarul)?\s*([\d.]+)\s*[/.-]\s*(\d{4})' THEN
        v_type := 'lege';
        v_num_raw := (regexp_match(v_work, '(\mlegea\M|\mlegii\M|\mlege\M)\s*(nr\.|numarul)?\s*([\d.]+)\s*[/.-]\s*(\d{4})'))[3];
        v_year := (regexp_match(v_work, '(\mlegea\M|\mlegii\M|\mlege\M)\s*(nr\.|numarul)?\s*([\d.]+)\s*[/.-]\s*(\d{4})'))[4];
    -- Ordin
    ELSIF v_work ~ '(\mordinul\M|\mordin\M)\s*(nr\.|numarul)?\s*([\d.]+)\s*[/.-]\s*(\d{4})' THEN
        v_type := 'ordin';
        v_num_raw := (regexp_match(v_work, '(\mordinul\M|\mordin\M)\s*(nr\.|numarul)?\s*([\d.]+)\s*[/.-]\s*(\d{4})'))[3];
        v_year := (regexp_match(v_work, '(\mordinul\M|\mordin\M)\s*(nr\.|numarul)?\s*([\d.]+)\s*[/.-]\s*(\d{4})'))[4];
    -- Decizie
    ELSIF v_work ~ '(\mdecizia\M|\mdecizie\M)\s*(nr\.|numarul)?\s*([\d.]+)\s*[/.-]\s*(\d{4})' THEN
        v_type := 'decizie';
        v_num_raw := (regexp_match(v_work, '(\mdecizia\M|\mdecizie\M)\s*(nr\.|numarul)?\s*([\d.]+)\s*[/.-]\s*(\d{4})'))[3];
        v_year := (regexp_match(v_work, '(\mdecizia\M|\mdecizie\M)\s*(nr\.|numarul)?\s*([\d.]+)\s*[/.-]\s*(\d{4})'))[4];
    -- Decret
    ELSIF v_work ~ '(\mdecretul\M|\mdecret\M)\s*(nr\.|numarul)?\s*([\d.]+)\s*[/.-]\s*(\d{4})' THEN
        v_type := 'decret';
        v_num_raw := (regexp_match(v_work, '(\mdecretul\M|\mdecret\M)\s*(nr\.|numarul)?\s*([\d.]+)\s*[/.-]\s*(\d{4})'))[3];
        v_year := (regexp_match(v_work, '(\mdecretul\M|\mdecret\M)\s*(nr\.|numarul)?\s*([\d.]+)\s*[/.-]\s*(\d{4})'))[4];
    -- Codul <nume compus> (ex: "codul de procedura civila", "codul penal")
    ELSIF v_work ~ '\mcodul\s+((de\s+)?[a-z]+(\s+[a-z]+){0,3})' THEN
        v_type := 'cod';
        v_num_raw := (regexp_match(v_work, '\mcodul\s+((de\s+)?[a-z]+(\s+[a-z]+){0,3})'))[1];
        -- Drop trailing junk words sometimes attached
        v_num_raw := regexp_replace(trim(v_num_raw), '\s+(privind|din|si|sau|pentru)\M.*$', '');
        IF v_num_raw IN ('de', 'al', 'a', 'din') OR length(v_num_raw) < 4 THEN
            v_type := NULL;
            v_num_raw := NULL;
            v_year := NULL;
        ELSE
            v_year := NULL;
        END IF;
    ELSE
        v_type := NULL;
        v_num_raw := NULL;
        v_year := NULL;
    END IF;

    IF v_num_raw IS NOT NULL THEN
        v_number := regexp_replace(v_num_raw, '\.', '', 'g');
    ELSE
        v_number := NULL;
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
$fn$;

COMMENT ON FUNCTION public.normalize_legislative_identifier(TEXT) IS
  'Normalizează identificatori legislativi (PG \\m/\\M, ordin, Art./Anexa peel, strip puncte număr)';

-- 3) resolve — only strong identifier matches when type is parseable (no fuzzy title noise)
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
BEGIN
    v_id := public.normalize_legislative_identifier(p_text);
    v_type := v_id->>'type';
    v_num := v_id->>'number';
    v_year := v_id->>'year';

    IF v_type IS NULL THEN
        RETURN;
    END IF;

    -- Compact identifier must appear near type+number[/year] (avoids Alegerea/Legii… + Decizia nr. X)
    IF v_type = 'cod' THEN
        IF v_num IS NULL OR length(v_num) < 4 THEN
            RETURN;
        END IF;
        v_id_pattern := 'codul\s+' || replace(v_num, ' ', '\s+');
        v_pipe_pattern := v_id_pattern;
    ELSIF v_num IS NOT NULL AND v_year IS NOT NULL THEN
        v_id_pattern := CASE v_type
            WHEN 'hg' THEN
                '(hg|h\.g\.|hotar\w*\s+guvern\w*)\s*(nr\.|numarul)?\s*' || v_num || '\s*[/.-]\s*' || v_year
            WHEN 'oug' THEN
                '(oug|ordonanta\s+de\s+urgenta)\s*(nr\.|numarul)?\s*' || v_num || '\s*[/.-]\s*' || v_year
            WHEN 'og' THEN
                '(og|ordonanta)\s*(nr\.|numarul)?\s*' || v_num || '\s*[/.-]\s*' || v_year
            WHEN 'lege' THEN
                '(legea|legii|lege|\ml\M)\s*(nr\.|numarul)?\s*' || v_num || '\s*[/.-]\s*' || v_year
            WHEN 'ordin' THEN
                '(ordinul|ordin)\s*(nr\.|numarul)?\s*' || v_num || '\s*[/.-]\s*' || v_year
            WHEN 'decizie' THEN
                '(decizia|decizie)\s*(nr\.|numarul)?\s*' || v_num || '\s*[/.-]\s*' || v_year
            WHEN 'decret' THEN
                '(decretul|decret)\s*(nr\.|numarul)?\s*' || v_num || '\s*[/.-]\s*' || v_year
            ELSE
                v_type || '\s*(nr\.|numarul)?\s*' || v_num || '\s*[/.-]\s*' || v_year
        END;
        v_pipe_pattern := v_id_pattern;
    ELSIF v_num IS NOT NULL THEN
        v_id_pattern := CASE v_type
            WHEN 'hg' THEN '(hg|h\.g\.)\s*(nr\.|numarul)?\s*' || v_num || '\M'
            WHEN 'oug' THEN '(oug|ordonanta\s+de\s+urgenta)\s*(nr\.|numarul)?\s*' || v_num || '\M'
            WHEN 'og' THEN '(og|ordonanta)\s*(nr\.|numarul)?\s*' || v_num || '\M'
            WHEN 'lege' THEN '(legea|legii|lege|\ml\M)\s*(nr\.|numarul)?\s*' || v_num || '\M'
            WHEN 'ordin' THEN '(ordinul|ordin)\s*(nr\.|numarul)?\s*' || v_num || '\M'
            WHEN 'decizie' THEN '(decizia|decizie)\s*(nr\.|numarul)?\s*' || v_num || '\M'
            WHEN 'decret' THEN '(decretul|decret)\s*(nr\.|numarul)?\s*' || v_num || '\M'
            ELSE v_type || '\s*(nr\.?)?\s*' || v_num || '\M'
        END;
        v_pipe_pattern := v_id_pattern;
    ELSE
        RETURN;
    END IF;

    -- Prefer identifier in the official key after "|"
    IF v_num IS NOT NULL AND v_year IS NOT NULL THEN
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
        IF FOUND THEN
            RETURN;
        END IF;
    END IF;

    IF v_num IS NOT NULL THEN
        RETURN QUERY
        SELECT s.id, s.title, 0.82::DOUBLE PRECISION, 'partial_identifier_match'::TEXT
        FROM public.stiri s
        WHERE regexp_replace(lower(coalesce(split_part(s.title, '|', 2), s.title)), '\.', '', 'g')
              ~* v_pipe_pattern
           OR regexp_replace(lower(s.title), '\.', '', 'g') ~* v_id_pattern
        ORDER BY
          CASE WHEN position('|' IN s.title) > 0
                AND regexp_replace(lower(split_part(s.title, '|', 2)), '\.', '', 'g') ~* v_pipe_pattern
               THEN 0 ELSE 1 END,
          s.publication_date DESC
        LIMIT 1;
    END IF;

    RETURN;
END;
$fn$;

COMMENT ON FUNCTION public.resolve_legislative_identifier(TEXT) IS
  'Rezolvă identificator legislativ pe pattern compact tip+nr/an (preferă cheia după |)';

-- 4) extract — LEGAL_REF in, ORGANIZATION out; do not boost weak confidence
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
    v_min_match CONSTANT FLOAT := 0.55;
    v_entity_text TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.stiri WHERE id = p_stire_id) THEN
        RAISE NOTICE 'Știrea cu ID % nu există', p_stire_id;
        RETURN;
    END IF;

    IF p_entities IS NULL OR jsonb_typeof(p_entities) <> 'array' OR jsonb_array_length(p_entities) = 0 THEN
        RETURN;
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
                        'resolved_identifier', public.normalize_legislative_identifier(v_entity_text),
                        'match_method', v_resolved_document.match_method,
                        'match_confidence', v_resolved_document.match_confidence,
                        'local_window', v_window,
                        'extraction_context', substring(
                            p_content FROM greatest(1, position(v_entity_text IN p_content) - 100) FOR 200
                        ),
                        'extraction_timestamp', NOW(),
                        'extraction_version', '4.0'
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
                        'normalized_identifier', public.normalize_legislative_identifier(v_external_identifier),
                        'local_window', v_window,
                        'extraction_context', substring(
                            p_content FROM greatest(1, position(v_external_identifier IN p_content) - 100) FOR 200
                        ),
                        'is_external', true,
                        'extraction_timestamp', NOW(),
                        'extraction_version', '4.0'
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

    RAISE NOTICE 'Extragere știre %: finalizată (succes approx %, externe %, erori %)',
        p_stire_id, v_success_count, v_external_count, v_error_count;
END;
$fn$;

COMMENT ON FUNCTION public.extract_legislative_connections(BIGINT, TEXT, JSONB) IS
  'Extrage conexiuni din LEGAL_REF/WORK_OF_ART/LAW/LEGISLATION (v4.0); fără ORGANIZATION';

-- 5) get_related_stories — additive LEGAL_REF in legal-act scoring
CREATE OR REPLACE FUNCTION public.get_related_stories(
    target_story_id BIGINT,
    limit_count INTEGER DEFAULT 5,
    min_score NUMERIC DEFAULT 1.0
)
RETURNS TABLE(
    id BIGINT,
    title TEXT,
    publication_date DATE,
    category TEXT,
    relevance_score NUMERIC,
    relevance_reasons JSONB
)
LANGUAGE plpgsql
AS $fn$
DECLARE
    target_topics JSONB;
    target_entities JSONB;
    target_keywords JSONB;
    target_category TEXT;
BEGIN
    SELECT
        s.topics,
        s.entities,
        s.content->>'keywords',
        s.content->>'category'
    INTO
        target_topics,
        target_entities,
        target_keywords,
        target_category
    FROM stiri s
    WHERE s.id = target_story_id;

    RETURN QUERY
    WITH scored_stories AS (
        SELECT
            s.id,
            s.title,
            s.publication_date,
            s.content->>'category' AS story_category,
            (
                COALESCE((
                    SELECT COUNT(*) * 10
                    FROM (
                        SELECT DISTINCT entity->>'text' AS target_entity_text
                        FROM jsonb_array_elements(target_entities) AS entity
                        WHERE entity->>'label' IN ('WORK_OF_ART', 'NUMERIC_VALUE', 'LEGAL_REF')
                        AND (
                            entity->>'label' = 'LEGAL_REF'
                            OR entity->>'text' ~ '^\d+/\d+$'
                            OR entity->>'text' ~ '^OG'
                            OR entity->>'text' ~ '^HG'
                            OR entity->>'text' ~ '^Legea'
                        )
                    ) target_acts
                    INNER JOIN (
                        SELECT DISTINCT entity->>'text' AS story_entity_text
                        FROM jsonb_array_elements(s.entities) AS entity
                        WHERE entity->>'label' IN ('WORK_OF_ART', 'NUMERIC_VALUE', 'LEGAL_REF')
                        AND (
                            entity->>'label' = 'LEGAL_REF'
                            OR entity->>'text' ~ '^\d+/\d+$'
                            OR entity->>'text' ~ '^OG'
                            OR entity->>'text' ~ '^HG'
                            OR entity->>'text' ~ '^Legea'
                        )
                    ) story_acts ON target_acts.target_entity_text = story_acts.story_entity_text
                ), 0)::NUMERIC +
                COALESCE((
                    SELECT COUNT(*) * 5
                    FROM (
                        SELECT DISTINCT entity->>'text' AS target_org_text
                        FROM jsonb_array_elements(target_entities) AS entity
                        WHERE entity->>'label' = 'ORGANIZATION'
                        AND length(entity->>'text') > 10
                    ) target_orgs
                    INNER JOIN (
                        SELECT DISTINCT entity->>'text' AS story_org_text
                        FROM jsonb_array_elements(s.entities) AS entity
                        WHERE entity->>'label' = 'ORGANIZATION'
                        AND length(entity->>'text') > 10
                    ) story_orgs ON target_orgs.target_org_text = story_orgs.story_org_text
                ), 0)::NUMERIC +
                COALESCE((
                    SELECT COUNT(*) * 3
                    FROM (
                        SELECT DISTINCT topic->>'label' AS target_topic_label
                        FROM jsonb_array_elements(target_topics) AS topic
                    ) target_topic_labels
                    INNER JOIN (
                        SELECT DISTINCT topic->>'label' AS story_topic_label
                        FROM jsonb_array_elements(s.topics) AS topic
                    ) story_topic_labels
                      ON target_topic_labels.target_topic_label = story_topic_labels.story_topic_label
                ), 0)::NUMERIC +
                COALESCE((
                    SELECT COUNT(*) * 1
                    FROM (
                        SELECT DISTINCT trim(both '"' from keyword::text) AS target_keyword_text
                        FROM jsonb_array_elements(target_keywords::jsonb) AS keyword
                    ) target_kw
                    INNER JOIN (
                        SELECT DISTINCT trim(both '"' from keyword::text) AS story_keyword_text
                        FROM jsonb_array_elements((s.content->>'keywords')::jsonb) AS keyword
                    ) story_kw ON target_kw.target_keyword_text = story_kw.story_keyword_text
                ), 0)::NUMERIC +
                CASE WHEN s.content->>'category' = target_category THEN 2 ELSE 0 END::NUMERIC
            ) AS relevance_score,
            jsonb_build_object(
                'common_legal_acts', (
                    SELECT jsonb_agg(DISTINCT target_entity_text)
                    FROM (
                        SELECT DISTINCT entity->>'text' AS target_entity_text
                        FROM jsonb_array_elements(target_entities) AS entity
                        WHERE entity->>'label' IN ('WORK_OF_ART', 'NUMERIC_VALUE', 'LEGAL_REF')
                        AND (
                            entity->>'label' = 'LEGAL_REF'
                            OR entity->>'text' ~ '^\d+/\d+$'
                            OR entity->>'text' ~ '^OG'
                            OR entity->>'text' ~ '^HG'
                            OR entity->>'text' ~ '^Legea'
                        )
                    ) target_acts
                    INNER JOIN (
                        SELECT DISTINCT entity->>'text' AS story_entity_text
                        FROM jsonb_array_elements(s.entities) AS entity
                        WHERE entity->>'label' IN ('WORK_OF_ART', 'NUMERIC_VALUE', 'LEGAL_REF')
                        AND (
                            entity->>'label' = 'LEGAL_REF'
                            OR entity->>'text' ~ '^\d+/\d+$'
                            OR entity->>'text' ~ '^OG'
                            OR entity->>'text' ~ '^HG'
                            OR entity->>'text' ~ '^Legea'
                        )
                    ) story_acts ON target_acts.target_entity_text = story_acts.story_entity_text
                ),
                'common_organizations', (
                    SELECT jsonb_agg(DISTINCT target_org_text)
                    FROM (
                        SELECT DISTINCT entity->>'text' AS target_org_text
                        FROM jsonb_array_elements(target_entities) AS entity
                        WHERE entity->>'label' = 'ORGANIZATION'
                        AND length(entity->>'text') > 10
                    ) target_orgs
                    INNER JOIN (
                        SELECT DISTINCT entity->>'text' AS story_org_text
                        FROM jsonb_array_elements(s.entities) AS entity
                        WHERE entity->>'label' = 'ORGANIZATION'
                        AND length(entity->>'text') > 10
                    ) story_orgs ON target_orgs.target_org_text = story_orgs.story_org_text
                ),
                'common_topics', (
                    SELECT jsonb_agg(DISTINCT target_topic_label)
                    FROM (
                        SELECT DISTINCT topic->>'label' AS target_topic_label
                        FROM jsonb_array_elements(target_topics) AS topic
                    ) target_topic_labels
                    INNER JOIN (
                        SELECT DISTINCT topic->>'label' AS story_topic_label
                        FROM jsonb_array_elements(s.topics) AS topic
                    ) story_topic_labels
                      ON target_topic_labels.target_topic_label = story_topic_labels.story_topic_label
                ),
                'common_keywords', (
                    SELECT jsonb_agg(DISTINCT target_keyword_text)
                    FROM (
                        SELECT DISTINCT trim(both '"' from keyword::text) AS target_keyword_text
                        FROM jsonb_array_elements(target_keywords::jsonb) AS keyword
                    ) target_kw
                    INNER JOIN (
                        SELECT DISTINCT trim(both '"' from keyword::text) AS story_keyword_text
                        FROM jsonb_array_elements((s.content->>'keywords')::jsonb) AS keyword
                    ) story_kw ON target_kw.target_keyword_text = story_kw.story_keyword_text
                ),
                'same_category', s.content->>'category' = target_category
            ) AS relevance_reasons
        FROM stiri s
        WHERE s.id != target_story_id
    )
    SELECT
        scored_stories.id,
        scored_stories.title,
        scored_stories.publication_date,
        scored_stories.story_category,
        scored_stories.relevance_score,
        scored_stories.relevance_reasons
    FROM scored_stories
    WHERE scored_stories.relevance_score >= min_score
    ORDER BY scored_stories.relevance_score DESC, scored_stories.publication_date DESC
    LIMIT limit_count;
END;
$fn$;

COMMENT ON FUNCTION public.get_related_stories(BIGINT, INTEGER, NUMERIC) IS
  'Știri relevante; scor acte include LEGAL_REF + WORK_OF_ART/NUMERIC_VALUE';

-- 6) Analytics: top mentioned laws include LEGAL_REF
CREATE OR REPLACE FUNCTION public.get_top_mentioned_laws(
  p_start_date DATE,
  p_end_date DATE,
  p_limit INT DEFAULT 10
)
RETURNS TABLE(
  label TEXT,
  value BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
BEGIN
  RETURN QUERY
  SELECT
    entity->>'text' AS label,
    COUNT(*)::BIGINT AS value
  FROM public.stiri s,
       jsonb_array_elements(s.entities) AS entity
  WHERE s.publication_date >= p_start_date
    AND s.publication_date <= p_end_date
    AND s.entities IS NOT NULL
    AND jsonb_typeof(s.entities) = 'array'
    AND entity->>'label' IN ('LEGAL_REF', 'WORK_OF_ART', 'LAW', 'LEGISLATION')
    AND entity->>'text' IS NOT NULL
    AND trim(entity->>'text') != ''
  GROUP BY entity->>'text'
  ORDER BY COUNT(*) DESC, entity->>'text' ASC
  LIMIT p_limit;
END;
$fn$;

COMMENT ON FUNCTION public.get_top_mentioned_laws(DATE, DATE, INT) IS
  'Top acte menționate (LEGAL_REF + WORK_OF_ART/LAW/LEGISLATION)';
