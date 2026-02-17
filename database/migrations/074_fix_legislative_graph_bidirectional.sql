-- =====================================================
-- MIGRAȚIA 074: CORECTAREA EXPLORĂRII BIDIRECȚIONALE A GRAFICULUI LEGISLATIV
-- =====================================================
-- Corectează funcția get_legislative_graph pentru a explora conexiunile
-- în ambele direcții (atât source->target cât și target->source)
-- astfel încât graficul să includă toate conexiunile relevante

CREATE OR REPLACE FUNCTION public.get_legislative_graph(
    p_document_id BIGINT,
    p_depth INT DEFAULT 1
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
BEGIN
    -- Verifică dacă documentul există
    IF NOT EXISTS (SELECT 1 FROM public.stiri WHERE id = p_document_id) THEN
        RETURN;
    END IF;
    
    -- LIMITARE STRICTĂ DE SECURITATE: Adâncimea maximă este 3
    -- Aceasta previne interogări extrem de complexe care pot bloca serviciul
    IF p_depth > v_max_depth THEN
        RAISE EXCEPTION 'Adâncimea maximă permisă este %', v_max_depth;
    END IF;
    
    -- Construiește graficul nivel cu nivel
    WHILE v_current_depth < p_depth AND array_length(v_nodes_at_depth, 1) > 0 LOOP
        -- Găsește conexiunile FORWARD (unde nodurile curente sunt surse)
        SELECT array_agg(DISTINCT lc.target_document_id) INTO v_forward_nodes
        FROM public.legislative_connections lc
        WHERE lc.source_document_id = ANY(v_nodes_at_depth)
          AND lc.target_document_id != ALL(v_visited_nodes);
        
        -- Găsește conexiunile BACKWARD (unde nodurile curente sunt ținte)
        SELECT array_agg(DISTINCT lc.source_document_id) INTO v_backward_nodes
        FROM public.legislative_connections lc
        WHERE lc.target_document_id = ANY(v_nodes_at_depth)
          AND lc.source_document_id != ALL(v_visited_nodes);
        
        -- Combină nodurile din ambele direcții
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
        
        -- Dacă nu mai sunt noduri noi, oprește
        IF v_next_level_nodes IS NULL OR array_length(v_next_level_nodes, 1) = 0 THEN
            EXIT;
        END IF;
        
        -- Adaugă noile noduri la lista vizitată
        v_visited_nodes := array_cat(v_visited_nodes, v_next_level_nodes);
        v_nodes_at_depth := v_next_level_nodes;
        v_current_depth := v_current_depth + 1;
    END LOOP;
    
    -- Construiește lista de noduri
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', s.id,
            'title', s.title,
            'publicationDate', s.publication_date,
            'type', 'legislation'
        )
    ) INTO v_nodes
    FROM public.stiri s
    WHERE s.id = ANY(v_visited_nodes);
    
    -- Construiește lista de conexiuni
    -- Include toate conexiunile care au ambele capete în nodurile vizitate
    -- (atât conexiunile forward cât și backward)
    SELECT jsonb_agg(
        jsonb_build_object(
            'source', lc.source_document_id,
            'target', lc.target_document_id,
            'type', lc.relationship_type,
            'confidence', lc.confidence_score
        )
    ) INTO v_links
    FROM public.legislative_connections lc
    WHERE (lc.source_document_id = ANY(v_visited_nodes)
           AND lc.target_document_id = ANY(v_visited_nodes));
    
    -- Returnează rezultatul
    RETURN QUERY SELECT 
        COALESCE(v_nodes, '[]'::jsonb) as nodes,
        COALESCE(v_links, '[]'::jsonb) as links;
END;
$$;

COMMENT ON FUNCTION public.get_legislative_graph(BIGINT, INT) IS 'Returnează graficul de conexiuni legislative pentru un document dat, explorând conexiunile în ambele direcții (forward și backward) pentru o reprezentare completă a graficului';

