-- Fix pentru feed-ul personalizat cu categoria extrasă ca câmp separat
-- Data: 2025-01-04
-- Descriere: Creează o funcție nouă care să returneze știrile personalizate cu categoria extrasă ca câmp separat

-- Creez o funcție nouă care să returneze știrile personalizate cu categoria extrasă ca câmp separat
CREATE OR REPLACE FUNCTION public.get_personalized_stiri_with_category(
    user_uuid UUID,
    p_limit INT DEFAULT 10,
    p_offset INT DEFAULT 0,
    p_order_by TEXT DEFAULT 'publication_date',
    p_order_dir TEXT DEFAULT 'desc'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_categories JSONB;
    v_order_by TEXT := LOWER(COALESCE(p_order_by, 'publication_date'));
    v_order_dir TEXT := LOWER(COALESCE(p_order_dir, 'desc'));
    v_sql TEXT;
    v_result JSONB;
BEGIN
    -- Obține categoriile preferate ale utilizatorului
    SELECT preferred_categories INTO v_categories
    FROM public.user_preferences
    WHERE id = user_uuid;
    
    -- Validare coloane sortare
    IF v_order_by NOT IN ('publication_date', 'created_at', 'title', 'id', 'view_count') THEN
        v_order_by := 'publication_date';
    END IF;
    IF v_order_dir NOT IN ('asc', 'desc') THEN
        v_order_dir := 'desc';
    END IF;
    
    -- Construiește query-ul SQL cu categoria extrasă
    IF v_categories IS NOT NULL AND jsonb_array_length(v_categories) > 0 THEN
        -- Filtrează pe categorii preferate
        v_sql := format($f$
            WITH filtered AS (
                SELECT 
                    s.*,
                    s.content ->> 'category' as category
                FROM public.stiri s
                WHERE s.content ->> 'category' = ANY(
                    SELECT jsonb_array_elements_text(%L::jsonb)
                )
            ),
            counted AS (
                SELECT COUNT(*)::BIGINT AS total_count FROM filtered
            ),
            paged AS (
                SELECT * FROM filtered
                ORDER BY %I %s, id ASC
                LIMIT %s OFFSET %s
            )
            SELECT jsonb_build_object(
                'items', COALESCE((SELECT jsonb_agg(to_jsonb(p.*)) FROM paged p), '[]'::jsonb),
                'total_count', (SELECT total_count FROM counted)
            )
        $f$, v_categories, v_order_by, upper(v_order_dir), p_limit, p_offset);
    ELSE
        -- Returnează toate știrile dacă nu are preferințe
        v_sql := format($f$
            WITH filtered AS (
                SELECT 
                    s.*,
                    s.content ->> 'category' as category
                FROM public.stiri s
            ),
            counted AS (
                SELECT COUNT(*)::BIGINT AS total_count FROM filtered
            ),
            paged AS (
                SELECT * FROM filtered
                ORDER BY %I %s, id ASC
                LIMIT %s OFFSET %s
            )
            SELECT jsonb_build_object(
                'items', COALESCE((SELECT jsonb_agg(to_jsonb(p.*)) FROM paged p), '[]'::jsonb),
                'total_count', (SELECT total_count FROM counted)
            )
        $f$, v_order_by, upper(v_order_dir), p_limit, p_offset);
    END IF;
    
    EXECUTE v_sql INTO v_result;
    RETURN v_result;
END;
$$;

-- Comentariu pentru funcție
COMMENT ON FUNCTION public.get_personalized_stiri_with_category(UUID, INT, INT, TEXT, TEXT) IS 
'Returnează știrile personalizate pentru un utilizator cu categoria extrasă ca câmp separat. Funcția filtrează știrile pe baza categoriilor preferate ale utilizatorului și returnează rezultatele cu paginare și sortare.';
