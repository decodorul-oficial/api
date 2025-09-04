-- =====================================================
-- MIGRAȚIA 044: FUNCȚIA GET_RELATED_STORIES
-- =====================================================
-- Documentează implementarea actuală a funcției de scoring pentru știri relevante
-- Funcția există deja în baza de date și este funcțională

-- Funcția returnează știri relevante cu scoring multi-criteriu
-- EXCLUDÂND EXPLICIT știrea originală din rezultate
CREATE OR REPLACE FUNCTION public.get_related_stories(
    target_story_id BIGINT,
    limit_count INT DEFAULT 5,
    min_score NUMERIC DEFAULT 1.0
) RETURNS TABLE(
    id BIGINT,
    title TEXT,
    publication_date DATE,
    category TEXT,
    relevance_score NUMERIC,
    relevance_reasons JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    target_topics JSONB;
    target_entities JSONB;
    target_keywords JSONB;
    target_category TEXT;
BEGIN
    -- Obține datele știrii target
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

    -- Returnează tabelul cu știrile relevante și scorurile lor
    RETURN QUERY
    WITH scored_stories AS (
        SELECT 
            s.id,
            s.title,
            s.publication_date,
            s.content->>'category' as story_category,
            
            -- Calculul scorului de relevanță (cast la NUMERIC)
            (
                -- +10 pentru acte normative comune (detectate în entities ca WORK_OF_ART sau patterns specifice)
                COALESCE((
                    SELECT COUNT(*) * 10 
                    FROM (
                        SELECT DISTINCT entity->>'text' as target_entity_text
                        FROM jsonb_array_elements(target_entities) as entity
                        WHERE entity->>'label' IN ('WORK_OF_ART', 'NUMERIC_VALUE')
                        AND (
                            entity->>'text' ~ '^\d+/\d+$' OR  -- Pattern pentru nr/an
                            entity->>'text' ~ '^OG' OR
                            entity->>'text' ~ '^HG' OR
                            entity->>'text' ~ '^Legea'
                        )
                    ) target_acts
                    INNER JOIN (
                        SELECT DISTINCT entity->>'text' as story_entity_text
                        FROM jsonb_array_elements(s.entities) as entity
                        WHERE entity->>'label' IN ('WORK_OF_ART', 'NUMERIC_VALUE')
                        AND (
                            entity->>'text' ~ '^\d+/\d+$' OR
                            entity->>'text' ~ '^OG' OR
                            entity->>'text' ~ '^HG' OR
                            entity->>'text' ~ '^Legea'
                        )
                    ) story_acts ON target_acts.target_entity_text = story_acts.story_entity_text
                ), 0)::NUMERIC +
                
                -- +5 pentru organizații importante comune
                COALESCE((
                    SELECT COUNT(*) * 5 
                    FROM (
                        SELECT DISTINCT entity->>'text' as target_org_text
                        FROM jsonb_array_elements(target_entities) as entity
                        WHERE entity->>'label' = 'ORGANIZATION'
                        AND length(entity->>'text') > 10  -- Filtrează organizații importante
                    ) target_orgs
                    INNER JOIN (
                        SELECT DISTINCT entity->>'text' as story_org_text
                        FROM jsonb_array_elements(s.entities) as entity
                        WHERE entity->>'label' = 'ORGANIZATION'
                        AND length(entity->>'text') > 10
                    ) story_orgs ON target_orgs.target_org_text = story_orgs.story_org_text
                ), 0)::NUMERIC +
                
                -- +3 pentru același topic (comparând label-urile din topics)
                COALESCE((
                    SELECT COUNT(*) * 3
                    FROM (
                        SELECT DISTINCT topic->>'label' as target_topic_label
                        FROM jsonb_array_elements(target_topics) as topic
                    ) target_topic_labels
                    INNER JOIN (
                        SELECT DISTINCT topic->>'label' as story_topic_label
                        FROM jsonb_array_elements(s.topics) as topic
                    ) story_topic_labels ON target_topic_labels.target_topic_label = story_topic_labels.story_topic_label
                ), 0)::NUMERIC +
                
                -- +1 pentru fiecare keyword comun
                COALESCE((
                    SELECT COUNT(*) * 1
                    FROM (
                        SELECT DISTINCT trim(both '"' from keyword::text) as target_keyword_text
                        FROM jsonb_array_elements(target_keywords::jsonb) as keyword
                    ) target_kw
                    INNER JOIN (
                        SELECT DISTINCT trim(both '"' from keyword::text) as story_keyword_text
                        FROM jsonb_array_elements((s.content->>'keywords')::jsonb) as keyword
                    ) story_kw ON target_kw.target_keyword_text = story_kw.story_keyword_text
                ), 0)::NUMERIC +
                
                -- +2 bonus pentru aceeași categorie
                CASE WHEN s.content->>'category' = target_category THEN 2 ELSE 0 END::NUMERIC
                
            ) AS relevance_score,
            
            -- Construiește motivele relevanței
            jsonb_build_object(
                'common_legal_acts', (
                    SELECT jsonb_agg(DISTINCT target_entity_text)
                    FROM (
                        SELECT DISTINCT entity->>'text' as target_entity_text
                        FROM jsonb_array_elements(target_entities) as entity
                        WHERE entity->>'label' IN ('WORK_OF_ART', 'NUMERIC_VALUE')
                        AND (
                            entity->>'text' ~ '^\d+/\d+$' OR
                            entity->>'text' ~ '^OG' OR
                            entity->>'text' ~ '^HG' OR
                            entity->>'text' ~ '^Legea'
                        )
                    ) target_acts
                    INNER JOIN (
                        SELECT DISTINCT entity->>'text' as story_entity_text
                        FROM jsonb_array_elements(s.entities) as entity
                        WHERE entity->>'label' IN ('WORK_OF_ART', 'NUMERIC_VALUE')
                        AND (
                            entity->>'text' ~ '^\d+/\d+$' OR
                            entity->>'text' ~ '^OG' OR
                            entity->>'text' ~ '^HG' OR
                            entity->>'text' ~ '^Legea'
                        )
                    ) story_acts ON target_acts.target_entity_text = story_acts.story_entity_text
                ),
                'common_organizations', (
                    SELECT jsonb_agg(DISTINCT target_org_text)
                    FROM (
                        SELECT DISTINCT entity->>'text' as target_org_text
                        FROM jsonb_array_elements(target_entities) as entity
                        WHERE entity->>'label' = 'ORGANIZATION'
                        AND length(entity->>'text') > 10
                    ) target_orgs
                    INNER JOIN (
                        SELECT DISTINCT entity->>'text' as story_org_text
                        FROM jsonb_array_elements(s.entities) as entity
                        WHERE entity->>'label' = 'ORGANIZATION'
                        AND length(entity->>'text') > 10
                    ) story_orgs ON target_orgs.target_org_text = story_orgs.story_org_text
                ),
                'common_topics', (
                    SELECT jsonb_agg(DISTINCT target_topic_label)
                    FROM (
                        SELECT DISTINCT topic->>'label' as target_topic_label
                        FROM jsonb_array_elements(target_topics) as topic
                    ) target_topic_labels
                    INNER JOIN (
                        SELECT DISTINCT topic->>'label' as story_topic_label
                        FROM jsonb_array_elements(s.topics) as topic
                    ) story_topic_labels ON target_topic_labels.target_topic_label = story_topic_labels.story_topic_label
                ),
                'common_keywords', (
                    SELECT jsonb_agg(DISTINCT target_keyword_text)
                    FROM (
                        SELECT DISTINCT trim(both '"' from keyword::text) as target_keyword_text
                        FROM jsonb_array_elements(target_keywords::jsonb) as keyword
                    ) target_kw
                    INNER JOIN (
                        SELECT DISTINCT trim(both '"' from keyword::text) as story_keyword_text
                        FROM jsonb_array_elements((s.content->>'keywords')::jsonb) as keyword
                    ) story_kw ON target_kw.target_keyword_text = story_kw.story_keyword_text
                ),
                'same_category', s.content->>'category' = target_category
            ) as relevance_reasons
        FROM stiri s
        WHERE s.id != target_story_id  -- Exclude știrea target
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
$$;

COMMENT ON FUNCTION public.get_related_stories(BIGINT, INT, NUMERIC) 
IS 'Returnează știri relevante cu scoring multi-criteriu, EXCLUDÂND EXPLICIT știrea originală din rezultate';

-- Indexuri pentru optimizarea funcției (dacă nu există deja)
CREATE INDEX IF NOT EXISTS idx_stiri_entities_work_of_art 
ON public.stiri USING GIN (entities) 
WHERE entities @> '[{"label": "WORK_OF_ART"}]';

CREATE INDEX IF NOT EXISTS idx_stiri_entities_organizations 
ON public.stiri USING GIN (entities) 
WHERE entities @> '[{"label": "ORGANIZATION"}]';

CREATE INDEX IF NOT EXISTS idx_stiri_content_category 
ON public.stiri ((content->>'category'));

