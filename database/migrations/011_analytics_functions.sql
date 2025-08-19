-- ==============================================
-- 011 - Funcții analytics: top_entities, top_topics
-- ==============================================

-- Top entități din coloana JSONB `entities`
CREATE OR REPLACE FUNCTION public.get_top_entities(p_limit INT DEFAULT 20)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  WITH expanded AS (
    SELECT
      (e->>'text') AS text,
      (e->>'label') AS label
    FROM public.stiri s,
         LATERAL jsonb_array_elements(s.entities) AS e
    WHERE jsonb_typeof(s.entities) = 'array'
  ), counted AS (
    SELECT text, label, COUNT(*) AS occurrences
    FROM expanded
    WHERE COALESCE(text, '') <> ''
    GROUP BY text, label
    ORDER BY occurrences DESC, text ASC
    LIMIT p_limit
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(counted)), '[]'::jsonb)
  INTO result
  FROM counted;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.get_top_entities(INT) IS 'Returnează JSONB cu top entități (text, label, occurrences) din coloana entities';

-- Top topicuri din coloana JSONB `topics`
-- Așteptat format element: {"topic_id": int?, "label": text?, "score": float?}
CREATE OR REPLACE FUNCTION public.get_top_topics(p_limit INT DEFAULT 20)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  WITH expanded AS (
    SELECT
      COALESCE((t->>'label'), CONCAT('topic_', (t->>'topic_id'))) AS label
    FROM public.stiri s,
         LATERAL jsonb_array_elements(s.topics) AS t
    WHERE jsonb_typeof(s.topics) = 'array'
  ), counted AS (
    SELECT label, COUNT(*) AS occurrences
    FROM expanded
    WHERE COALESCE(label, '') <> ''
    GROUP BY label
    ORDER BY occurrences DESC, label ASC
    LIMIT p_limit
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(counted)), '[]'::jsonb)
  INTO result
  FROM counted;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.get_top_topics(INT) IS 'Returnează JSONB cu top topicuri (label, occurrences) din coloana topics';


