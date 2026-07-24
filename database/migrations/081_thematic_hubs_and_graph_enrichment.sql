-- =====================================================
-- MIGRAȚIA 081: Thematic hubs (data-driven) + enrich LEGAL_REF
-- + external citation nodes + related stories PROGRAM
-- Non-breaking on stiri schema (no ALTER TABLE stiri columns)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.thematic_hub_dictionary (
  text_norm TEXT PRIMARY KEY,
  display_text TEXT NOT NULL,
  df INTEGER NOT NULL,
  df_editorial INTEGER NOT NULL,
  support_ratio DOUBLE PRECISION NOT NULL,
  program_share DOUBLE PRECISION NOT NULL,
  score DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thematic_hub_dictionary_score
  ON public.thematic_hub_dictionary (score DESC);

COMMENT ON TABLE public.thematic_hub_dictionary IS
  'Hub-uri tematice eligibile, regenerate din statistici live (DF + support editorial)';

-- Refresh dictionary from live corpus stats (no word denylist)
CREATE OR REPLACE FUNCTION public.refresh_thematic_hub_dictionary()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_n BIGINT;
  v_df_min INT;
  v_df_max INT;
  v_p90 DOUBLE PRECISION;
  v_inserted INT;
BEGIN
  SELECT COUNT(*) INTO v_n FROM public.stiri;
  IF v_n IS NULL OR v_n = 0 THEN
    DELETE FROM public.thematic_hub_dictionary;
    RETURN 0;
  END IF;

  SELECT COALESCE(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY story_cnt), 2)
  INTO v_p90
  FROM (
    SELECT COUNT(DISTINCT s.id) AS story_cnt
    FROM public.stiri s,
         jsonb_array_elements(COALESCE(s.content->'ner', s.entities)) e
    WHERE e->>'label' = 'PROGRAM'
      AND length(trim(COALESCE(e->>'text', ''))) >= 3
    GROUP BY lower(trim(e->>'text'))
  ) t;

  v_df_min := GREATEST(3, CEIL(v_p90)::INT);
  v_df_max := LEAST(FLOOR(0.03 * v_n)::INT, GREATEST(v_df_min + 5, 150));

  DELETE FROM public.thematic_hub_dictionary;

  WITH program_texts AS (
    SELECT DISTINCT lower(trim(e->>'text')) AS text_norm
    FROM public.stiri s,
         jsonb_array_elements(COALESCE(s.content->'ner', s.entities)) e
    WHERE e->>'label' = 'PROGRAM'
      AND length(trim(COALESCE(e->>'text', ''))) >= 3
  ),
  mentions AS (
    SELECT
      lower(trim(e->>'text')) AS text_norm,
      s.id AS story_id,
      e->>'label' AS label,
      trim(e->>'text') AS raw_text
    FROM public.stiri s,
         jsonb_array_elements(COALESCE(s.content->'ner', s.entities)) e
    WHERE length(trim(COALESCE(e->>'text', ''))) >= 3
      AND lower(trim(e->>'text')) IN (SELECT text_norm FROM program_texts)
  ),
  agg AS (
    SELECT
      m.text_norm,
      MAX(m.raw_text) AS display_text,
      COUNT(DISTINCT m.story_id) AS df,
      COUNT(*) FILTER (WHERE m.label = 'PROGRAM')::FLOAT
        / NULLIF(COUNT(*), 0) AS program_share
    FROM mentions m
    GROUP BY m.text_norm
  ),
  editorial AS (
    SELECT
      a.text_norm,
      (
        SELECT COUNT(DISTINCT s.id)
        FROM public.stiri s
        WHERE lower(s.title) LIKE '%' || a.text_norm || '%'
           OR lower(COALESCE(s.content->>'keywords', '')) LIKE '%' || a.text_norm || '%'
      ) AS df_editorial
    FROM agg a
  ),
  scored AS (
    SELECT
      a.text_norm,
      a.display_text,
      a.df,
      e.df_editorial,
      (e.df_editorial::FLOAT / NULLIF(a.df, 0)) AS support_ratio,
      a.program_share,
      (LN(1 + a.df) * GREATEST((e.df_editorial::FLOAT / NULLIF(a.df, 0)), 0.05)) AS score
    FROM agg a
    JOIN editorial e ON e.text_norm = a.text_norm
    WHERE a.df >= v_df_min
      AND a.df <= v_df_max
      AND a.program_share >= 0.25
      AND (e.df_editorial >= 2 OR (e.df_editorial::FLOAT / NULLIF(a.df, 0)) >= 0.2)
  )
  INSERT INTO public.thematic_hub_dictionary (
    text_norm, display_text, df, df_editorial, support_ratio, program_share, score, updated_at
  )
  SELECT
    text_norm,
    display_text,
    df,
    df_editorial,
    support_ratio,
    program_share,
    score,
    NOW()
  FROM scored;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$fn$;

COMMENT ON FUNCTION public.refresh_thematic_hub_dictionary() IS
  'Regenerează thematic_hub_dictionary din DF + support editorial (fără denylist)';

-- Heuristic LEGAL_REF enrichment from title/body (no Gemini)
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
    '(?i)((?:Ordonanța de urgență(?: a Guvernului)?|OUG|Ordonanța(?: Guvernului)?|OG|Hotărârea(?: Guvernului)?|HG|Legea|Legii|Lege|Ordinul(?: ministrului[^,]{0,40})?|Ordin|Decretul|Decret|Decizia|Decizie)\s*(?:nr\.?|numărul)?\s*[\d.]+\s*/\s*\d{4})',
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
  'Adaugă LEGAL_REF lipsă în content.ner din title/body via regex + normalize';

-- Batch enrich + extract for stories missing LEGAL_REF / connections
CREATE OR REPLACE FUNCTION public.enrich_and_reextract_batch(p_limit INT DEFAULT 40, p_offset INT DEFAULT 0)
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
    WHERE s.publication_date > CURRENT_DATE - INTERVAL '24 months'
      AND (
        NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(s.content->'ner', '[]'::jsonb)) e
          WHERE e->>'label' = 'LEGAL_REF'
        )
        OR NOT EXISTS (
          SELECT 1 FROM public.legislative_connections lc WHERE lc.source_document_id = s.id
        )
      )
    ORDER BY s.id
    LIMIT p_limit OFFSET p_offset
  LOOP
    BEGIN
      PERFORM public.enrich_legal_refs_from_text(v_rec.id);

      SELECT
        CASE
          WHEN jsonb_typeof(s.content->'ner') = 'array' AND jsonb_array_length(s.content->'ner') > 0
            THEN s.content->'ner'
          ELSE COALESCE(s.entities, '[]'::jsonb)
        END,
        COALESCE(s.content->>'body', s.content->>'text', s.title)
      INTO v_entities, v_body
      FROM public.stiri s
      WHERE s.id = v_rec.id;

      IF jsonb_typeof(v_entities) = 'array'
         AND jsonb_array_length(v_entities) > 0
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(v_entities) e
           WHERE e->>'label' IN ('LEGAL_REF', 'WORK_OF_ART', 'LAW', 'LEGISLATION')
         )
      THEN
        PERFORM public.extract_legislative_connections(v_rec.id, v_body, v_entities);
      END IF;

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'enrich_and_reextract error id=%: %', v_rec.id, SQLERRM;
    END;
  END LOOP;
  RETURN v_count;
END;
$fn$;

COMMENT ON FUNCTION public.enrich_and_reextract_batch(INT, INT) IS
  'Enrich LEGAL_REF + re-extract pe un batch mic de știri fără LEGAL_REF/conexiuni';

-- =====================================================
-- get_legislative_graph: internal BFS + external nodes + hubs
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_legislative_graph(
    p_document_id BIGINT,
    p_depth INT DEFAULT 1,
    p_min_confidence FLOAT DEFAULT 0.6,
    p_max_nodes INT DEFAULT 40,
    p_max_links INT DEFAULT 20
) RETURNS TABLE(
    nodes JSONB,
    links JSONB
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_nodes JSONB;
    v_links JSONB;
    v_visited_nodes BIGINT[] := ARRAY[p_document_id];
    v_current_depth INT := 0;
    v_nodes_at_depth BIGINT[] := ARRAY[p_document_id];
    v_next_level_nodes BIGINT[] := ARRAY[]::BIGINT[];
    v_max_depth INT := 3;
    v_forward_nodes BIGINT[];
    v_backward_nodes BIGINT[];
    v_all_found_nodes BIGINT[];
    v_filtered_nodes BIGINT[];
    v_connected_nodes_ids BIGINT[];
    v_external_nodes JSONB := '[]'::jsonb;
    v_external_links JSONB := '[]'::jsonb;
    v_hub_nodes JSONB := '[]'::jsonb;
    v_hub_links JSONB := '[]'::jsonb;
    v_ext_budget INT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.stiri WHERE id = p_document_id) THEN
        RETURN;
    END IF;

    IF p_depth > v_max_depth THEN
        RAISE EXCEPTION 'Adâncimea maximă permisă este %', v_max_depth;
    END IF;

    -- 1. BFS pe muchii interne (target NOT NULL)
    WHILE v_current_depth < p_depth AND array_length(v_nodes_at_depth, 1) > 0 LOOP
        SELECT array_agg(DISTINCT lc.target_document_id) INTO v_forward_nodes
        FROM public.legislative_connections lc
        WHERE lc.source_document_id = ANY(v_nodes_at_depth)
          AND lc.target_document_id IS NOT NULL
          AND lc.target_document_id != ALL(v_visited_nodes)
          AND lc.confidence_score >= p_min_confidence;

        SELECT array_agg(DISTINCT lc.source_document_id) INTO v_backward_nodes
        FROM public.legislative_connections lc
        WHERE lc.target_document_id = ANY(v_nodes_at_depth)
          AND lc.source_document_id != ALL(v_visited_nodes)
          AND lc.confidence_score >= p_min_confidence;

        v_next_level_nodes := ARRAY[]::BIGINT[];

        IF v_forward_nodes IS NOT NULL THEN
            v_next_level_nodes := array_cat(v_next_level_nodes, v_forward_nodes);
        END IF;
        IF v_backward_nodes IS NOT NULL THEN
            v_next_level_nodes := array_cat(v_next_level_nodes, v_backward_nodes);
        END IF;

        IF array_length(v_next_level_nodes, 1) > 0 THEN
            SELECT array_agg(DISTINCT unnest_val) INTO v_next_level_nodes
            FROM unnest(v_next_level_nodes) AS unnest_val;
        END IF;

        IF v_next_level_nodes IS NULL OR array_length(v_next_level_nodes, 1) = 0 THEN
            EXIT;
        END IF;

        v_visited_nodes := array_cat(v_visited_nodes, v_next_level_nodes);
        v_nodes_at_depth := v_next_level_nodes;
        v_current_depth := v_current_depth + 1;

        IF array_length(v_visited_nodes, 1) > (p_max_nodes * 2) THEN
            EXIT;
        END IF;
    END LOOP;

    v_all_found_nodes := v_visited_nodes;

    SELECT array_agg(n_id) INTO v_filtered_nodes
    FROM (
        SELECT unnest(v_all_found_nodes) as n_id
        LIMIT p_max_nodes
    ) sub;

    WITH prioritized_links AS (
        SELECT
            jsonb_build_object(
                'source', lc.source_document_id::TEXT,
                'target', lc.target_document_id::TEXT,
                'type', lc.relationship_type,
                'typeLabel', lc.relationship_type,
                'confidence', lc.confidence_score,
                'confidenceLabel', CASE
                    WHEN lc.confidence_score >= 0.9 THEN 'Ridicat'
                    WHEN lc.confidence_score >= 0.7 THEN 'Mediu'
                    ELSE 'Scăzut'
                END,
                'confidenceLevel', CASE
                    WHEN lc.confidence_score >= 0.9 THEN 'HIGH'
                    WHEN lc.confidence_score >= 0.7 THEN 'MEDIUM'
                    ELSE 'LOW'
                END,
                'description', NULL
            ) as link_obj,
            lc.source_document_id,
            lc.target_document_id
        FROM public.legislative_connections lc
        WHERE (lc.source_document_id = ANY(v_filtered_nodes)
               AND lc.target_document_id = ANY(v_filtered_nodes))
          AND lc.target_document_id IS NOT NULL
          AND lc.confidence_score >= p_min_confidence
        ORDER BY lc.confidence_score DESC
        LIMIT p_max_links
    )
    SELECT
        jsonb_agg(link_obj),
        array_agg(DISTINCT id)
    INTO v_links, v_connected_nodes_ids
    FROM (
        SELECT link_obj, unnest(ARRAY[source_document_id, target_document_id]) as id
        FROM prioritized_links
    ) sub;

    IF v_connected_nodes_ids IS NULL THEN
        v_connected_nodes_ids := ARRAY[p_document_id];
    ELSIF NOT (p_document_id = ANY(v_connected_nodes_ids)) THEN
        v_connected_nodes_ids := array_append(v_connected_nodes_ids, p_document_id);
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', s.id::TEXT,
            'title', s.title,
            'shortTitle', s.title,
            'actNumber', 'N/A',
            'actType', 'N/A',
            'publicationDate', s.publication_date,
            'type', 'legislation'
        )
    ) INTO v_nodes
    FROM public.stiri s
    WHERE s.id = ANY(v_connected_nodes_ids);

    v_nodes := COALESCE(v_nodes, '[]'::jsonb);
    v_links := COALESCE(v_links, '[]'::jsonb);

    -- 2. Noduri externe de citare (target NULL) — din documentul curent
    -- Incluse indiferent de p_min_confidence (confidence tipic 0.3)
    v_ext_budget := GREATEST(3, LEAST(8, p_max_nodes / 4));

    WITH ext AS (
        SELECT
            lc.id AS lc_id,
            COALESCE(
              NULLIF(trim(lc.metadata->>'external_identifier'), ''),
              NULLIF(trim(lc.metadata->'source_entity'->>'text'), ''),
              'Act extern'
            ) AS ext_label,
            COALESCE(lc.metadata->'normalized_identifier', '{}'::jsonb) AS norm,
            lc.confidence_score,
            lc.relationship_type,
            COALESCE(
              NULLIF(lower(trim(lc.metadata->'normalized_identifier'->>'type')), '') || ':' ||
              NULLIF(lower(trim(lc.metadata->'normalized_identifier'->>'number')), '') || '/' ||
              NULLIF(lower(trim(lc.metadata->'normalized_identifier'->>'year')), ''),
              lower(trim(COALESCE(
                NULLIF(trim(lc.metadata->>'external_identifier'), ''),
                NULLIF(trim(lc.metadata->'source_entity'->>'text'), ''),
                'act-extern'
              )))
            ) AS dedupe_key
        FROM public.legislative_connections lc
        WHERE lc.source_document_id = p_document_id
          AND lc.target_document_id IS NULL
          AND lc.relationship_type = 'face referire la (extern)'
        ORDER BY lc.confidence_score DESC, lc.id
        LIMIT v_ext_budget * 3
    ),
    ext_dedup AS (
        SELECT DISTINCT ON (dedupe_key)
            lc_id, ext_label, norm, confidence_score, relationship_type, dedupe_key
        FROM ext
        ORDER BY dedupe_key, lc_id
        LIMIT v_ext_budget
    ),
    ext_nodes AS (
        SELECT
            'ext-' || md5(dedupe_key) AS node_id,
            ext_label,
            COALESCE(norm->>'number', NULL) AS act_number,
            COALESCE(norm->>'type', 'Extern') AS act_type,
            dedupe_key
        FROM ext_dedup
    ),
    ext_links AS (
        SELECT
            jsonb_build_object(
                'source', p_document_id::TEXT,
                'target', 'ext-' || md5(e.dedupe_key),
                'type', e.relationship_type,
                'typeLabel', 'Face referire la (act extern)',
                'confidence', GREATEST(e.confidence_score, 0.35),
                'confidenceLabel', 'Extern',
                'confidenceLevel', 'LOW',
                'description', NULL
            ) AS link_obj
        FROM ext_dedup e
    )
    SELECT
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', n.node_id,
              'title', n.ext_label,
              'shortTitle', n.ext_label,
              'actNumber', COALESCE(n.act_number, 'N/A'),
              'actType', COALESCE(n.act_type, 'Extern'),
              'publicationDate', NULL,
              'type', 'external'
            )
          ) FROM ext_nodes n
        ), '[]'::jsonb),
        COALESCE((SELECT jsonb_agg(link_obj) FROM ext_links), '[]'::jsonb)
    INTO v_external_nodes, v_external_links;

    -- 3. Hub-uri tematice din dicționar (max 3), cu ≥1 altă știre co-mention
    -- Matching: NER/entities + title/keywords (fără body — prea zgomotos)
    WITH story_mentions AS (
        SELECT DISTINCT lower(trim(e->>'text')) AS text_norm
        FROM public.stiri s,
             jsonb_array_elements(COALESCE(s.content->'ner', s.entities, '[]'::jsonb)) e
        WHERE s.id = p_document_id
          AND length(trim(COALESCE(e->>'text', ''))) >= 3
        UNION
        SELECT d.text_norm
        FROM public.thematic_hub_dictionary d
        WHERE EXISTS (
          SELECT 1 FROM public.stiri s
          WHERE s.id = p_document_id
            AND (
              lower(s.title) LIKE '%' || d.text_norm || '%'
              OR lower(COALESCE(s.content->>'keywords', '')) LIKE '%' || d.text_norm || '%'
            )
        )
    ),
    hub_candidates AS (
        SELECT
          d.text_norm,
          d.display_text,
          d.score,
          d.df
        FROM public.thematic_hub_dictionary d
        JOIN story_mentions m ON m.text_norm = d.text_norm
        WHERE EXISTS (
          SELECT 1
          FROM public.stiri s2,
               jsonb_array_elements(COALESCE(s2.content->'ner', s2.entities, '[]'::jsonb)) e2
          WHERE s2.id <> p_document_id
            AND lower(trim(e2->>'text')) = d.text_norm
        )
        ORDER BY d.score DESC
        LIMIT 3
    )
    SELECT
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', 'hub-' || md5(h.text_norm),
              'title', h.display_text,
              'shortTitle', h.display_text,
              'actNumber', NULL,
              'actType', 'Hub',
              'publicationDate', NULL,
              'type', 'program_comun'
            )
          ) FROM hub_candidates h
        ), '[]'::jsonb),
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'source', p_document_id::TEXT,
              'target', 'hub-' || md5(h.text_norm),
              'type', 'program_comun',
              'typeLabel', 'Program / temă comună',
              'confidence', LEAST(0.55 + (h.score / 10.0), 0.85),
              'confidenceLabel', 'Tematic',
              'confidenceLevel', 'MEDIUM',
              'description', NULL
            )
          ) FROM hub_candidates h
        ), '[]'::jsonb)
    INTO v_hub_nodes, v_hub_links;

    v_nodes := v_nodes || COALESCE(v_external_nodes, '[]'::jsonb) || COALESCE(v_hub_nodes, '[]'::jsonb);
    v_links := v_links || COALESCE(v_external_links, '[]'::jsonb) || COALESCE(v_hub_links, '[]'::jsonb);

    RETURN QUERY SELECT v_nodes, v_links;
END;
$$;

COMMENT ON FUNCTION public.get_legislative_graph(BIGINT, INT, FLOAT, INT, INT) IS
  'Graf legislative: citări interne + noduri externe + hub-uri tematice (program_comun)';

-- =====================================================
-- get_related_stories: PROGRAM scoring + case-insensitive keywords
-- =====================================================
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
    target_ner JSONB;
BEGIN
    SELECT
        s.topics,
        s.entities,
        s.content->>'keywords',
        s.content->>'category',
        COALESCE(s.content->'ner', s.entities, '[]'::jsonb)
    INTO
        target_topics,
        target_entities,
        target_keywords,
        target_category,
        target_ner
    FROM stiri s
    WHERE s.id = target_story_id;

    IF target_entities IS NULL THEN
        target_entities := '[]'::jsonb;
    END IF;
    IF target_ner IS NULL OR jsonb_typeof(target_ner) <> 'array' THEN
        target_ner := target_entities;
    END IF;

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
                    SELECT COUNT(*) * 8
                    FROM (
                        SELECT DISTINCT lower(trim(entity->>'text')) AS target_prog
                        FROM jsonb_array_elements(target_ner) AS entity
                        WHERE entity->>'label' = 'PROGRAM'
                          AND length(trim(COALESCE(entity->>'text', ''))) >= 3
                    ) tp
                    INNER JOIN (
                        SELECT DISTINCT lower(trim(entity->>'text')) AS story_prog
                        FROM jsonb_array_elements(COALESCE(s.content->'ner', s.entities, '[]'::jsonb)) AS entity
                        WHERE entity->>'label' = 'PROGRAM'
                          AND length(trim(COALESCE(entity->>'text', ''))) >= 3
                    ) sp ON tp.target_prog = sp.story_prog
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
                        SELECT DISTINCT lower(trim(both '"' from keyword::text)) AS target_keyword_text
                        FROM jsonb_array_elements(
                          CASE
                            WHEN target_keywords IS NULL OR target_keywords = '' THEN '[]'::jsonb
                            WHEN left(trim(target_keywords::text), 1) = '[' THEN target_keywords::jsonb
                            ELSE '[]'::jsonb
                          END
                        ) AS keyword
                    ) target_kw
                    INNER JOIN (
                        SELECT DISTINCT lower(trim(both '"' from keyword::text)) AS story_keyword_text
                        FROM jsonb_array_elements(
                          CASE
                            WHEN s.content->>'keywords' IS NULL OR s.content->>'keywords' = '' THEN '[]'::jsonb
                            WHEN left(trim(s.content->>'keywords'), 1) = '[' THEN (s.content->>'keywords')::jsonb
                            ELSE '[]'::jsonb
                          END
                        ) AS keyword
                    ) story_kw ON target_kw.target_keyword_text = story_kw.story_keyword_text
                    WHERE length(target_kw.target_keyword_text) >= 3
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
                'common_programs', (
                    SELECT jsonb_agg(DISTINCT tp.target_prog)
                    FROM (
                        SELECT DISTINCT lower(trim(entity->>'text')) AS target_prog
                        FROM jsonb_array_elements(target_ner) AS entity
                        WHERE entity->>'label' = 'PROGRAM'
                          AND length(trim(COALESCE(entity->>'text', ''))) >= 3
                    ) tp
                    INNER JOIN (
                        SELECT DISTINCT lower(trim(entity->>'text')) AS story_prog
                        FROM jsonb_array_elements(COALESCE(s.content->'ner', s.entities, '[]'::jsonb)) AS entity
                        WHERE entity->>'label' = 'PROGRAM'
                          AND length(trim(COALESCE(entity->>'text', ''))) >= 3
                    ) sp ON tp.target_prog = sp.story_prog
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
                    SELECT jsonb_agg(DISTINCT target_kw.target_keyword_text)
                    FROM (
                        SELECT DISTINCT lower(trim(both '"' from keyword::text)) AS target_keyword_text
                        FROM jsonb_array_elements(
                          CASE
                            WHEN target_keywords IS NULL OR target_keywords = '' THEN '[]'::jsonb
                            WHEN left(trim(target_keywords::text), 1) = '[' THEN target_keywords::jsonb
                            ELSE '[]'::jsonb
                          END
                        ) AS keyword
                    ) target_kw
                    INNER JOIN (
                        SELECT DISTINCT lower(trim(both '"' from keyword::text)) AS story_keyword_text
                        FROM jsonb_array_elements(
                          CASE
                            WHEN s.content->>'keywords' IS NULL OR s.content->>'keywords' = '' THEN '[]'::jsonb
                            WHEN left(trim(s.content->>'keywords'), 1) = '[' THEN (s.content->>'keywords')::jsonb
                            ELSE '[]'::jsonb
                          END
                        ) AS keyword
                    ) story_kw ON target_kw.target_keyword_text = story_kw.story_keyword_text
                    WHERE length(target_kw.target_keyword_text) >= 3
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
  'Știri relevante; scor include LEGAL_REF, PROGRAM și keywords case-insensitive';
CREATE OR REPLACE FUNCTION public.safe_keywords_jsonb(p_raw TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  v JSONB;
BEGIN
  IF p_raw IS NULL OR btrim(p_raw) = '' THEN
    RETURN '[]'::jsonb;
  END IF;
  IF left(btrim(p_raw), 1) = '[' THEN
    BEGIN
      v := btrim(p_raw)::jsonb;
      IF jsonb_typeof(v) = 'array' THEN
        RETURN v;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RETURN '[]'::jsonb;
    END;
  END IF;
  RETURN '[]'::jsonb;
END;
$fn$;

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
    target_ner JSONB;
BEGIN
    SELECT
        COALESCE(s.topics, '[]'::jsonb),
        COALESCE(s.entities, '[]'::jsonb),
        public.safe_keywords_jsonb(s.content->>'keywords'),
        s.content->>'category',
        CASE
          WHEN jsonb_typeof(s.content->'ner') = 'array' THEN s.content->'ner'
          ELSE COALESCE(s.entities, '[]'::jsonb)
        END
    INTO
        target_topics,
        target_entities,
        target_keywords,
        target_category,
        target_ner
    FROM stiri s
    WHERE s.id = target_story_id;

    IF target_topics IS NULL OR jsonb_typeof(target_topics) <> 'array' THEN
        target_topics := '[]'::jsonb;
    END IF;
    IF target_entities IS NULL OR jsonb_typeof(target_entities) <> 'array' THEN
        target_entities := '[]'::jsonb;
    END IF;
    IF target_ner IS NULL OR jsonb_typeof(target_ner) <> 'array' THEN
        target_ner := target_entities;
    END IF;

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
                        FROM jsonb_array_elements(COALESCE(s.entities, '[]'::jsonb)) AS entity
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
                    SELECT COUNT(*) * 8
                    FROM (
                        SELECT DISTINCT lower(trim(entity->>'text')) AS target_prog
                        FROM jsonb_array_elements(target_ner) AS entity
                        WHERE entity->>'label' = 'PROGRAM'
                          AND length(trim(COALESCE(entity->>'text', ''))) >= 3
                    ) tp
                    INNER JOIN (
                        SELECT DISTINCT lower(trim(entity->>'text')) AS story_prog
                        FROM jsonb_array_elements(
                          CASE WHEN jsonb_typeof(s.content->'ner')='array' THEN s.content->'ner'
                               ELSE COALESCE(s.entities, '[]'::jsonb) END
                        ) AS entity
                        WHERE entity->>'label' = 'PROGRAM'
                          AND length(trim(COALESCE(entity->>'text', ''))) >= 3
                    ) sp ON tp.target_prog = sp.story_prog
                ), 0)::NUMERIC +
                -- Hub dictionary overlap (any NER label / title) — covers Forexebug as ORGANIZATION
                COALESCE((
                    SELECT COUNT(*) * 8
                    FROM (
                        SELECT DISTINCT d.text_norm
                        FROM thematic_hub_dictionary d
                        WHERE EXISTS (
                          SELECT 1 FROM jsonb_array_elements(target_ner) e
                          WHERE lower(trim(e->>'text')) = d.text_norm
                        )
                        OR EXISTS (
                          SELECT 1 FROM stiri t WHERE t.id = target_story_id
                            AND (lower(t.title) LIKE '%'||d.text_norm||'%'
                              OR lower(COALESCE(t.content->>'keywords','')) LIKE '%'||d.text_norm||'%')
                        )
                    ) th
                    INNER JOIN (
                        SELECT DISTINCT d.text_norm
                        FROM thematic_hub_dictionary d
                        WHERE EXISTS (
                          SELECT 1 FROM jsonb_array_elements(
                            CASE WHEN jsonb_typeof(s.content->'ner')='array' THEN s.content->'ner'
                                 ELSE COALESCE(s.entities, '[]'::jsonb) END
                          ) e WHERE lower(trim(e->>'text')) = d.text_norm
                        )
                        OR lower(s.title) LIKE '%'||d.text_norm||'%'
                        OR lower(COALESCE(s.content->>'keywords','')) LIKE '%'||d.text_norm||'%'
                    ) sh ON th.text_norm = sh.text_norm
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
                        FROM jsonb_array_elements(COALESCE(s.entities, '[]'::jsonb)) AS entity
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
                        FROM jsonb_array_elements(COALESCE(s.topics, '[]'::jsonb)) AS topic
                    ) story_topic_labels
                      ON target_topic_labels.target_topic_label = story_topic_labels.story_topic_label
                ), 0)::NUMERIC +
                COALESCE((
                    SELECT COUNT(*) * 1
                    FROM (
                        SELECT DISTINCT lower(trim(both '"' from keyword::text)) AS target_keyword_text
                        FROM jsonb_array_elements(target_keywords) AS keyword
                    ) target_kw
                    INNER JOIN (
                        SELECT DISTINCT lower(trim(both '"' from keyword::text)) AS story_keyword_text
                        FROM jsonb_array_elements(public.safe_keywords_jsonb(s.content->>'keywords')) AS keyword
                    ) story_kw ON target_kw.target_keyword_text = story_kw.story_keyword_text
                    WHERE length(target_kw.target_keyword_text) >= 3
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
                        FROM jsonb_array_elements(COALESCE(s.entities, '[]'::jsonb)) AS entity
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
                'common_programs', (
                    SELECT jsonb_agg(DISTINCT tp.target_prog)
                    FROM (
                        SELECT DISTINCT lower(trim(entity->>'text')) AS target_prog
                        FROM jsonb_array_elements(target_ner) AS entity
                        WHERE entity->>'label' = 'PROGRAM'
                          AND length(trim(COALESCE(entity->>'text', ''))) >= 3
                    ) tp
                    INNER JOIN (
                        SELECT DISTINCT lower(trim(entity->>'text')) AS story_prog
                        FROM jsonb_array_elements(
                          CASE WHEN jsonb_typeof(s.content->'ner')='array' THEN s.content->'ner'
                               ELSE COALESCE(s.entities, '[]'::jsonb) END
                        ) AS entity
                        WHERE entity->>'label' = 'PROGRAM'
                          AND length(trim(COALESCE(entity->>'text', ''))) >= 3
                    ) sp ON tp.target_prog = sp.story_prog
                ),
                'common_hubs', (
                    SELECT jsonb_agg(DISTINCT th.text_norm)
                    FROM (
                        SELECT DISTINCT d.text_norm
                        FROM thematic_hub_dictionary d
                        WHERE EXISTS (
                          SELECT 1 FROM jsonb_array_elements(target_ner) e
                          WHERE lower(trim(e->>'text')) = d.text_norm
                        )
                        OR EXISTS (
                          SELECT 1 FROM stiri t WHERE t.id = target_story_id
                            AND (lower(t.title) LIKE '%'||d.text_norm||'%'
                              OR lower(COALESCE(t.content->>'keywords','')) LIKE '%'||d.text_norm||'%')
                        )
                    ) th
                    INNER JOIN (
                        SELECT DISTINCT d.text_norm
                        FROM thematic_hub_dictionary d
                        WHERE EXISTS (
                          SELECT 1 FROM jsonb_array_elements(
                            CASE WHEN jsonb_typeof(s.content->'ner')='array' THEN s.content->'ner'
                                 ELSE COALESCE(s.entities, '[]'::jsonb) END
                          ) e WHERE lower(trim(e->>'text')) = d.text_norm
                        )
                        OR lower(s.title) LIKE '%'||d.text_norm||'%'
                        OR lower(COALESCE(s.content->>'keywords','')) LIKE '%'||d.text_norm||'%'
                    ) sh ON th.text_norm = sh.text_norm
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
                        FROM jsonb_array_elements(COALESCE(s.entities, '[]'::jsonb)) AS entity
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
                        FROM jsonb_array_elements(COALESCE(s.topics, '[]'::jsonb)) AS topic
                    ) story_topic_labels
                      ON target_topic_labels.target_topic_label = story_topic_labels.story_topic_label
                ),
                'common_keywords', (
                    SELECT jsonb_agg(DISTINCT target_kw.target_keyword_text)
                    FROM (
                        SELECT DISTINCT lower(trim(both '"' from keyword::text)) AS target_keyword_text
                        FROM jsonb_array_elements(target_keywords) AS keyword
                    ) target_kw
                    INNER JOIN (
                        SELECT DISTINCT lower(trim(both '"' from keyword::text)) AS story_keyword_text
                        FROM jsonb_array_elements(public.safe_keywords_jsonb(s.content->>'keywords')) AS keyword
                    ) story_kw ON target_kw.target_keyword_text = story_kw.story_keyword_text
                    WHERE length(target_kw.target_keyword_text) >= 3
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
    target_ner JSONB;
    target_hubs TEXT[] := ARRAY[]::TEXT[];
    target_programs TEXT[] := ARRAY[]::TEXT[];
BEGIN
    SELECT
        COALESCE(s.topics, '[]'::jsonb),
        COALESCE(s.entities, '[]'::jsonb),
        public.safe_keywords_jsonb(s.content->>'keywords'),
        s.content->>'category',
        CASE
          WHEN jsonb_typeof(s.content->'ner') = 'array' THEN s.content->'ner'
          ELSE COALESCE(s.entities, '[]'::jsonb)
        END
    INTO
        target_topics,
        target_entities,
        target_keywords,
        target_category,
        target_ner
    FROM stiri s
    WHERE s.id = target_story_id;

    IF target_topics IS NULL OR jsonb_typeof(target_topics) <> 'array' THEN
        target_topics := '[]'::jsonb;
    END IF;
    IF target_entities IS NULL OR jsonb_typeof(target_entities) <> 'array' THEN
        target_entities := '[]'::jsonb;
    END IF;
    IF target_ner IS NULL OR jsonb_typeof(target_ner) <> 'array' THEN
        target_ner := target_entities;
    END IF;

    SELECT COALESCE(array_agg(DISTINCT lower(trim(e->>'text'))), ARRAY[]::TEXT[])
    INTO target_programs
    FROM jsonb_array_elements(target_ner) e
    WHERE e->>'label' = 'PROGRAM'
      AND length(trim(COALESCE(e->>'text', ''))) >= 3;

    SELECT COALESCE(array_agg(DISTINCT d.text_norm), ARRAY[]::TEXT[])
    INTO target_hubs
    FROM thematic_hub_dictionary d
    WHERE EXISTS (
            SELECT 1 FROM jsonb_array_elements(target_ner) e
            WHERE lower(trim(e->>'text')) = d.text_norm
          )
       OR EXISTS (
            SELECT 1 FROM stiri t
            WHERE t.id = target_story_id
              AND (
                lower(t.title) LIKE '%' || d.text_norm || '%'
                OR lower(COALESCE(t.content->>'keywords', '')) LIKE '%' || d.text_norm || '%'
              )
          );

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
                        FROM jsonb_array_elements(COALESCE(s.entities, '[]'::jsonb)) AS entity
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
                    SELECT COUNT(*) * 8
                    FROM unnest(target_programs) tp(prog)
                    WHERE EXISTS (
                      SELECT 1 FROM jsonb_array_elements(
                        CASE WHEN jsonb_typeof(s.content->'ner')='array' THEN s.content->'ner'
                             ELSE COALESCE(s.entities, '[]'::jsonb) END
                      ) e
                      WHERE e->>'label' = 'PROGRAM'
                        AND lower(trim(e->>'text')) = tp.prog
                    )
                ), 0)::NUMERIC +
                COALESCE((
                    SELECT COUNT(*) * 8
                    FROM unnest(target_hubs) th(hub)
                    WHERE EXISTS (
                      SELECT 1 FROM jsonb_array_elements(
                        CASE WHEN jsonb_typeof(s.content->'ner')='array' THEN s.content->'ner'
                             ELSE COALESCE(s.entities, '[]'::jsonb) END
                      ) e WHERE lower(trim(e->>'text')) = th.hub
                    )
                    OR lower(s.title) LIKE '%' || th.hub || '%'
                    OR lower(COALESCE(s.content->>'keywords','')) LIKE '%' || th.hub || '%'
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
                        FROM jsonb_array_elements(COALESCE(s.entities, '[]'::jsonb)) AS entity
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
                        FROM jsonb_array_elements(COALESCE(s.topics, '[]'::jsonb)) AS topic
                    ) story_topic_labels
                      ON target_topic_labels.target_topic_label = story_topic_labels.story_topic_label
                ), 0)::NUMERIC +
                COALESCE((
                    SELECT COUNT(*) * 1
                    FROM (
                        SELECT DISTINCT lower(trim(both '"' from keyword::text)) AS target_keyword_text
                        FROM jsonb_array_elements(target_keywords) AS keyword
                    ) target_kw
                    INNER JOIN (
                        SELECT DISTINCT lower(trim(both '"' from keyword::text)) AS story_keyword_text
                        FROM jsonb_array_elements(public.safe_keywords_jsonb(s.content->>'keywords')) AS keyword
                    ) story_kw ON target_kw.target_keyword_text = story_kw.story_keyword_text
                    WHERE length(target_kw.target_keyword_text) >= 3
                ), 0)::NUMERIC +
                CASE WHEN s.content->>'category' = target_category THEN 2 ELSE 0 END::NUMERIC
            ) AS relevance_score,
            jsonb_build_object(
                'common_programs', (
                    SELECT jsonb_agg(tp.prog)
                    FROM unnest(target_programs) tp(prog)
                    WHERE EXISTS (
                      SELECT 1 FROM jsonb_array_elements(
                        CASE WHEN jsonb_typeof(s.content->'ner')='array' THEN s.content->'ner'
                             ELSE COALESCE(s.entities, '[]'::jsonb) END
                      ) e
                      WHERE e->>'label' = 'PROGRAM' AND lower(trim(e->>'text')) = tp.prog
                    )
                ),
                'common_hubs', (
                    SELECT jsonb_agg(th.hub)
                    FROM unnest(target_hubs) th(hub)
                    WHERE EXISTS (
                      SELECT 1 FROM jsonb_array_elements(
                        CASE WHEN jsonb_typeof(s.content->'ner')='array' THEN s.content->'ner'
                             ELSE COALESCE(s.entities, '[]'::jsonb) END
                      ) e WHERE lower(trim(e->>'text')) = th.hub
                    )
                    OR lower(s.title) LIKE '%' || th.hub || '%'
                    OR lower(COALESCE(s.content->>'keywords','')) LIKE '%' || th.hub || '%'
                ),
                'same_category', s.content->>'category' = target_category
            ) AS relevance_reasons
        FROM stiri s
        WHERE s.id != target_story_id
          AND s.publication_date > CURRENT_DATE - INTERVAL '36 months'
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
CREATE OR REPLACE FUNCTION public.get_legislative_graph(
    p_document_id BIGINT,
    p_depth INT DEFAULT 1,
    p_min_confidence FLOAT DEFAULT 0.6,
    p_max_nodes INT DEFAULT 40,
    p_max_links INT DEFAULT 20
) RETURNS TABLE(
    nodes JSONB,
    links JSONB
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_nodes JSONB;
    v_links JSONB;
    v_visited_nodes BIGINT[] := ARRAY[p_document_id];
    v_current_depth INT := 0;
    v_nodes_at_depth BIGINT[] := ARRAY[p_document_id];
    v_next_level_nodes BIGINT[] := ARRAY[]::BIGINT[];
    v_max_depth INT := 3;
    v_forward_nodes BIGINT[];
    v_backward_nodes BIGINT[];
    v_all_found_nodes BIGINT[];
    v_filtered_nodes BIGINT[];
    v_connected_nodes_ids BIGINT[];
    v_external_nodes JSONB := '[]'::jsonb;
    v_external_links JSONB := '[]'::jsonb;
    v_hub_nodes JSONB := '[]'::jsonb;
    v_hub_links JSONB := '[]'::jsonb;
    v_ext_budget INT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.stiri WHERE id = p_document_id) THEN
        RETURN;
    END IF;

    IF p_depth > v_max_depth THEN
        RAISE EXCEPTION 'Adâncimea maximă permisă este %', v_max_depth;
    END IF;

    WHILE v_current_depth < p_depth AND array_length(v_nodes_at_depth, 1) > 0 LOOP
        SELECT array_agg(DISTINCT lc.target_document_id) INTO v_forward_nodes
        FROM public.legislative_connections lc
        WHERE lc.source_document_id = ANY(v_nodes_at_depth)
          AND lc.target_document_id IS NOT NULL
          AND lc.target_document_id != ALL(v_visited_nodes)
          AND lc.confidence_score >= p_min_confidence;

        SELECT array_agg(DISTINCT lc.source_document_id) INTO v_backward_nodes
        FROM public.legislative_connections lc
        WHERE lc.target_document_id = ANY(v_nodes_at_depth)
          AND lc.source_document_id != ALL(v_visited_nodes)
          AND lc.confidence_score >= p_min_confidence;

        v_next_level_nodes := ARRAY[]::BIGINT[];
        IF v_forward_nodes IS NOT NULL THEN
            v_next_level_nodes := array_cat(v_next_level_nodes, v_forward_nodes);
        END IF;
        IF v_backward_nodes IS NOT NULL THEN
            v_next_level_nodes := array_cat(v_next_level_nodes, v_backward_nodes);
        END IF;

        IF array_length(v_next_level_nodes, 1) > 0 THEN
            SELECT array_agg(DISTINCT unnest_val) INTO v_next_level_nodes
            FROM unnest(v_next_level_nodes) AS unnest_val;
        END IF;

        IF v_next_level_nodes IS NULL OR array_length(v_next_level_nodes, 1) = 0 THEN
            EXIT;
        END IF;

        v_visited_nodes := array_cat(v_visited_nodes, v_next_level_nodes);
        v_nodes_at_depth := v_next_level_nodes;
        v_current_depth := v_current_depth + 1;

        IF array_length(v_visited_nodes, 1) > (p_max_nodes * 2) THEN
            EXIT;
        END IF;
    END LOOP;

    v_all_found_nodes := v_visited_nodes;

    SELECT array_agg(n_id) INTO v_filtered_nodes
    FROM (
        SELECT unnest(v_all_found_nodes) as n_id
        LIMIT p_max_nodes
    ) sub;

    WITH prioritized_links AS (
        SELECT
            jsonb_build_object(
                'source', lc.source_document_id::TEXT,
                'target', lc.target_document_id::TEXT,
                'type', lc.relationship_type,
                'typeLabel', lc.relationship_type,
                'confidence', lc.confidence_score,
                'confidenceLabel', CASE
                    WHEN lc.confidence_score >= 0.9 THEN 'Ridicat'
                    WHEN lc.confidence_score >= 0.7 THEN 'Mediu'
                    ELSE 'Scăzut'
                END,
                'confidenceLevel', CASE
                    WHEN lc.confidence_score >= 0.9 THEN 'HIGH'
                    WHEN lc.confidence_score >= 0.7 THEN 'MEDIUM'
                    ELSE 'LOW'
                END,
                'description', ''
            ) as link_obj,
            lc.source_document_id,
            lc.target_document_id
        FROM public.legislative_connections lc
        WHERE (lc.source_document_id = ANY(v_filtered_nodes)
               AND lc.target_document_id = ANY(v_filtered_nodes))
          AND lc.target_document_id IS NOT NULL
          AND lc.confidence_score >= p_min_confidence
        ORDER BY lc.confidence_score DESC
        LIMIT p_max_links
    )
    SELECT
        jsonb_agg(link_obj),
        array_agg(DISTINCT id)
    INTO v_links, v_connected_nodes_ids
    FROM (
        SELECT link_obj, unnest(ARRAY[source_document_id, target_document_id]) as id
        FROM prioritized_links
    ) sub;

    IF v_connected_nodes_ids IS NULL THEN
        v_connected_nodes_ids := ARRAY[p_document_id];
    ELSIF NOT (p_document_id = ANY(v_connected_nodes_ids)) THEN
        v_connected_nodes_ids := array_append(v_connected_nodes_ids, p_document_id);
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', s.id::TEXT,
            'title', s.title,
            'shortTitle', s.title,
            'actNumber', 'N/A',
            'actType', 'N/A',
            'publicationDate', s.publication_date,
            'type', 'legislation'
        )
    ) INTO v_nodes
    FROM public.stiri s
    WHERE s.id = ANY(v_connected_nodes_ids);

    v_nodes := COALESCE(v_nodes, '[]'::jsonb);
    v_links := COALESCE(v_links, '[]'::jsonb);

    v_ext_budget := GREATEST(3, LEAST(8, p_max_nodes / 4));

    WITH ext AS (
        SELECT
            lc.id AS lc_id,
            COALESCE(
              NULLIF(trim(lc.metadata->>'external_identifier'), ''),
              NULLIF(trim(lc.metadata->'source_entity'->>'text'), ''),
              'Act extern'
            ) AS ext_label,
            COALESCE(lc.metadata->'normalized_identifier', '{}'::jsonb) AS norm,
            lc.confidence_score,
            lc.relationship_type,
            COALESCE(
              NULLIF(lower(trim(lc.metadata->'normalized_identifier'->>'type')), '') || '-' ||
              NULLIF(lower(trim(lc.metadata->'normalized_identifier'->>'number')), '') || '-' ||
              NULLIF(lower(trim(lc.metadata->'normalized_identifier'->>'year')), ''),
              lower(trim(COALESCE(
                NULLIF(trim(lc.metadata->>'external_identifier'), ''),
                NULLIF(trim(lc.metadata->'source_entity'->>'text'), ''),
                'act-extern'
              )))
            ) AS dedupe_key
        FROM public.legislative_connections lc
        WHERE lc.source_document_id = p_document_id
          AND lc.target_document_id IS NULL
          AND lc.relationship_type = 'face referire la (extern)'
        ORDER BY lc.confidence_score DESC, lc.id
        LIMIT v_ext_budget * 3
    ),
    ext_dedup AS (
        SELECT DISTINCT ON (dedupe_key)
            lc_id, ext_label, norm, confidence_score, relationship_type, dedupe_key
        FROM ext
        ORDER BY dedupe_key, lc_id
        LIMIT v_ext_budget
    ),
    ext_nodes AS (
        SELECT
            'ext-' || md5(dedupe_key) AS node_id,
            ext_label,
            COALESCE(norm->>'number', NULL) AS act_number,
            COALESCE(norm->>'type', 'Extern') AS act_type,
            dedupe_key
        FROM ext_dedup
    ),
    ext_links AS (
        SELECT
            jsonb_build_object(
                'source', p_document_id::TEXT,
                'target', 'ext-' || md5(e.dedupe_key),
                'type', e.relationship_type,
                'typeLabel', 'Face referire la (act extern)',
                'confidence', GREATEST(e.confidence_score, 0.35),
                'confidenceLabel', 'Extern',
                'confidenceLevel', 'LOW',
                'description', ''
            ) AS link_obj
        FROM ext_dedup e
    )
    SELECT
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', n.node_id,
              'title', n.ext_label,
              'shortTitle', n.ext_label,
              'actNumber', COALESCE(n.act_number, 'N/A'),
              'actType', COALESCE(n.act_type, 'Extern'),
              'publicationDate', '',
              'type', 'external'
            )
          ) FROM ext_nodes n
        ), '[]'::jsonb),
        COALESCE((SELECT jsonb_agg(link_obj) FROM ext_links), '[]'::jsonb)
    INTO v_external_nodes, v_external_links;

    WITH story_mentions AS (
        SELECT DISTINCT lower(trim(e->>'text')) AS text_norm
        FROM public.stiri s,
             jsonb_array_elements(COALESCE(s.content->'ner', s.entities, '[]'::jsonb)) e
        WHERE s.id = p_document_id
          AND length(trim(COALESCE(e->>'text', ''))) >= 3
        UNION
        SELECT d.text_norm
        FROM public.thematic_hub_dictionary d
        WHERE EXISTS (
          SELECT 1 FROM public.stiri s
          WHERE s.id = p_document_id
            AND (
              lower(s.title) LIKE '%' || d.text_norm || '%'
              OR lower(COALESCE(s.content->>'keywords', '')) LIKE '%' || d.text_norm || '%'
            )
        )
    ),
    hub_candidates AS (
        SELECT
          d.text_norm,
          d.display_text,
          d.score,
          d.df
        FROM public.thematic_hub_dictionary d
        JOIN story_mentions m ON m.text_norm = d.text_norm
        WHERE EXISTS (
          SELECT 1
          FROM public.stiri s2,
               jsonb_array_elements(COALESCE(s2.content->'ner', s2.entities, '[]'::jsonb)) e2
          WHERE s2.id <> p_document_id
            AND lower(trim(e2->>'text')) = d.text_norm
        )
        ORDER BY d.score DESC
        LIMIT 3
    )
    SELECT
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', 'hub-' || md5(h.text_norm),
              'title', h.display_text,
              'shortTitle', h.display_text,
              'actNumber', NULL,
              'actType', 'Hub',
              'publicationDate', '',
              'type', 'program_comun'
            )
          ) FROM hub_candidates h
        ), '[]'::jsonb),
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'source', p_document_id::TEXT,
              'target', 'hub-' || md5(h.text_norm),
              'type', 'program_comun',
              'typeLabel', 'Program / temă comună',
              'confidence', LEAST(0.55 + (h.score / 10.0), 0.85),
              'confidenceLabel', 'Tematic',
              'confidenceLevel', 'MEDIUM',
              'description', ''
            )
          ) FROM hub_candidates h
        ), '[]'::jsonb)
    INTO v_hub_nodes, v_hub_links;

    v_nodes := v_nodes || COALESCE(v_external_nodes, '[]'::jsonb) || COALESCE(v_hub_nodes, '[]'::jsonb);
    v_links := v_links || COALESCE(v_external_links, '[]'::jsonb) || COALESCE(v_hub_links, '[]'::jsonb);

    RETURN QUERY SELECT v_nodes, v_links;
END;
$$;
