-- =====================================================
-- MIGRAȚIA 028: LIMITAREA DE SECURITATE PENTRU ADÂNCIMEA GRAFICULUI
-- =====================================================
-- Implementează o limitare strictă de securitate pentru parametrul depth
-- în funcția get_legislative_graph pentru a preveni interogări DoS

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
        -- Găsește toate conexiunile pentru nodurile de la nivelul curent
        SELECT array_agg(DISTINCT lc.target_document_id) INTO v_next_level_nodes
        FROM public.legislative_connections lc
        WHERE lc.source_document_id = ANY(v_nodes_at_depth)
          AND lc.target_document_id != ALL(v_visited_nodes);
        
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
    SELECT jsonb_agg(
        jsonb_build_object(
            'source', lc.source_document_id,
            'target', lc.target_document_id,
            'type', lc.relationship_type,
            'confidence', lc.confidence_score
        )
    ) INTO v_links
    FROM public.legislative_connections lc
    WHERE lc.source_document_id = ANY(v_visited_nodes)
      AND lc.target_document_id = ANY(v_visited_nodes);
    
    -- Returnează rezultatul
    RETURN QUERY SELECT v_nodes, v_links;
END;
$$;

COMMENT ON FUNCTION public.get_legislative_graph(BIGINT, INT) IS 'Returnează graficul de conexiuni legislative pentru un document dat, cu o adâncime specificată (MAXIM 3 pentru securitate)';
