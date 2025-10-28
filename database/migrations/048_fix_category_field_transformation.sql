-- Fix the personalized feed function to handle category matching with different separators and diacritics
-- This migration addresses the issue where user preferences with hyphenated category names
-- (e.g., "justitie-dreptul-muncii-transporturi") don't match database categories with commas and spaces
-- (e.g., "justiție, dreptul muncii, transporturi")

CREATE OR REPLACE FUNCTION get_personalized_stiri_with_category(
    user_uuid UUID,
    p_limit INTEGER DEFAULT 10,
    p_offset INTEGER DEFAULT 0,
    p_order_by TEXT DEFAULT 'publication_date',
    p_order_dir TEXT DEFAULT 'desc'
)
RETURNS JSONB
LANGUAGE plpgsql
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
    
    -- Construiește query-ul cu matching flexibil pentru categorii
    v_sql := '
        WITH user_categories AS (
            SELECT jsonb_array_elements_text($1) as category
        ),
        matched_stiri AS (
            SELECT DISTINCT s.*
            FROM public.stiri s
            CROSS JOIN user_categories uc
            WHERE s.content ->> ''category'' IS NOT NULL
            AND (
                -- Exact match
                s.content ->> ''category'' = uc.category
                OR
                -- Flexible match: normalize both strings for comparison
                LOWER(REPLACE(REPLACE(REPLACE(s.content ->> ''category'', '' '', ''-''), '','', ''-''), ''ă'', ''a'')) = 
                LOWER(REPLACE(REPLACE(REPLACE(uc.category, '' '', ''-''), '','', ''-''), ''ă'', ''a''))
                OR
                -- Partial match: check if any word from user category exists in database category
                EXISTS (
                    SELECT 1 FROM unnest(string_to_array(REPLACE(REPLACE(uc.category, ''-'', '' ''), '','', '' ''), '' '')) as user_word
                    WHERE user_word != ''''
                    AND LOWER(REPLACE(REPLACE(s.content ->> ''category'', ''ă'', ''a''), ''ă'', ''a'')) LIKE ''%'' || LOWER(REPLACE(REPLACE(user_word, ''ă'', ''a''), ''ă'', ''a'')) || ''%''
                )
            )
        )
        SELECT jsonb_build_object(
            ''data'', jsonb_agg(
                jsonb_build_object(
                    ''id'', id,
                    ''title'', content ->> ''title'',
                    ''content'', content ->> ''content'',
                    ''publication_date'', content ->> ''publication_date'',
                    ''category'', content ->> ''category'',
                    ''source'', content ->> ''source'',
                    ''url'', content ->> ''url'',
                    ''view_count'', COALESCE((content ->> ''view_count'')::INTEGER, 0),
                    ''created_at'', created_at,
                    ''updated_at'', updated_at
                )
            ),
            ''total'', COUNT(*),
            ''limit'', $2,
            ''offset'', $3
        )
        FROM matched_stiri
        ORDER BY ' || v_order_by || ' ' || v_order_dir || '
        LIMIT $2 OFFSET $3
    ';
    
    -- Execută query-ul
    EXECUTE v_sql INTO v_result USING v_categories, p_limit, p_offset;
    
    -- Returnează rezultatul sau un obiect gol dacă nu există date
    RETURN COALESCE(v_result, jsonb_build_object('data', jsonb_build_array(), 'total', 0, 'limit', p_limit, 'offset', p_offset));
END;
$$;