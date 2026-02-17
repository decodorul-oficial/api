-- =====================================================
-- MIGRAȚIA 076: LIMITARE SMART A DIMENSIUNII GRAFICULUI (UPDATE)
-- =====================================================
-- Adaugă parametrii p_max_nodes și p_max_links pentru a controla dimensiunea
-- grafului returnat, prioritizând nodurile apropiate și conexiunile puternice.
-- MODIFICARE: Nodul central este întotdeauna inclus, chiar dacă nu are link-uri.

DROP FUNCTION IF EXISTS public.get_legislative_graph(BIGINT, INT, FLOAT, INT, INT);

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
AS $$
DECLARE
    v_nodes JSONB;
    v_links JSONB;
    v_visited_nodes BIGINT[] := ARRAY[p_document_id];
    v_current_depth INT := 0;
    v_nodes_at_depth BIGINT[] := ARRAY[p_document_id];
    v_next_level_nodes BIGINT[] := ARRAY[]::BIGINT[];
    v_max_depth INT := 3; -- LIMITARE STRICTĂ DE SECURITATE
    v_forward_nodes BIGINT[];
    v_backward_nodes BIGINT[];
    
    -- Variabile pentru filtrarea finală
    v_all_found_nodes BIGINT[];
    v_filtered_nodes BIGINT[];
    v_final_links JSONB;
    
    -- Variabilă temporară pentru agregarea link-urilor
    v_temp_links JSONB;
    v_connected_nodes_ids BIGINT[];
BEGIN
    -- Verifică dacă documentul există
    IF NOT EXISTS (SELECT 1 FROM public.stiri WHERE id = p_document_id) THEN
        RETURN;
    END IF;
    
    -- LIMITARE STRICTĂ DE SECURITATE: Adâncimea maximă este 3
    IF p_depth > v_max_depth THEN
        RAISE EXCEPTION 'Adâncimea maximă permisă este %', v_max_depth;
    END IF;
    
    -- 1. FAZA DE EXPLORARE (BFS)
    -- Colectăm candidații potențiali, nivel cu nivel
    
    WHILE v_current_depth < p_depth AND array_length(v_nodes_at_depth, 1) > 0 LOOP
        -- Găsește conexiunile FORWARD
        SELECT array_agg(DISTINCT lc.target_document_id) INTO v_forward_nodes
        FROM public.legislative_connections lc
        WHERE lc.source_document_id = ANY(v_nodes_at_depth)
          AND lc.target_document_id != ALL(v_visited_nodes)
          AND lc.confidence_score >= p_min_confidence;
        
        -- Găsește conexiunile BACKWARD
        SELECT array_agg(DISTINCT lc.source_document_id) INTO v_backward_nodes
        FROM public.legislative_connections lc
        WHERE lc.target_document_id = ANY(v_nodes_at_depth)
          AND lc.source_document_id != ALL(v_visited_nodes)
          AND lc.confidence_score >= p_min_confidence;
        
        -- Combină nodurile
        v_next_level_nodes := ARRAY[]::BIGINT[];
        
        IF v_forward_nodes IS NOT NULL THEN
            v_next_level_nodes := array_cat(v_next_level_nodes, v_forward_nodes);
        END IF;
        
        IF v_backward_nodes IS NOT NULL THEN
            v_next_level_nodes := array_cat(v_next_level_nodes, v_backward_nodes);
        END IF;
        
        -- Elimină duplicatele
        IF array_length(v_next_level_nodes, 1) > 0 THEN
            SELECT array_agg(DISTINCT unnest_val) INTO v_next_level_nodes
            FROM unnest(v_next_level_nodes) AS unnest_val;
        END IF;
        
        -- Stop dacă nu mai sunt noduri
        IF v_next_level_nodes IS NULL OR array_length(v_next_level_nodes, 1) = 0 THEN
            EXIT;
        END IF;
        
        -- Adaugă la vizitate
        v_visited_nodes := array_cat(v_visited_nodes, v_next_level_nodes);
        v_nodes_at_depth := v_next_level_nodes;
        v_current_depth := v_current_depth + 1;
        
        -- Optimizare: Dacă am depășit deja semnificativ limita de noduri, ne putem opri din explorare
        -- (dar păstrăm o marjă pentru a alege cele mai bune noduri ulterior)
        IF array_length(v_visited_nodes, 1) > (p_max_nodes * 2) THEN
            EXIT;
        END IF;
    END LOOP;
    
    v_all_found_nodes := v_visited_nodes;

    -- 2. FAZA DE SELECȚIE ȘI FILTRARE
    -- A. Selectăm nodurile candidate (limităm la max_nodes)
    SELECT array_agg(n_id) INTO v_filtered_nodes
    FROM (
        SELECT unnest(v_all_found_nodes) as n_id
        LIMIT p_max_nodes
    ) sub;
    
    -- B. Selectăm link-urile valide și identificăm nodurile conectate real
    WITH prioritized_links AS (
        SELECT 
            jsonb_build_object(
                'source', lc.source_document_id,
                'target', lc.target_document_id,
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
    
    -- C. Asigurăm că nodul central este inclus
    IF v_connected_nodes_ids IS NULL THEN
        v_connected_nodes_ids := ARRAY[p_document_id];
    ELSIF NOT (p_document_id = ANY(v_connected_nodes_ids)) THEN
        v_connected_nodes_ids := array_append(v_connected_nodes_ids, p_document_id);
    END IF;

    -- Construim lista finală de noduri
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', s.id,
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
    
    RETURN QUERY SELECT 
        COALESCE(v_nodes, '[]'::jsonb) as nodes,
        COALESCE(v_links, '[]'::jsonb) as links;
END;
$$;

COMMENT ON FUNCTION public.get_legislative_graph(BIGINT, INT, FLOAT, INT, INT) IS 'Returnează graficul limitat la max_nodes și max_links, incluzând întotdeauna nodul central';
