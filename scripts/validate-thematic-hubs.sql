-- Validation: thematic hubs + enrichment + graph signals
-- Sample IDs snapshot (pre-fix, no internal edges): hub-validation-2026
-- IDs: 2308,688,629,210,4454,2484,4447,2456,2727,1816,49,4168,1616,4150,3006,4007,3715,4742,4969,3170
--
-- Run pieces separately if statement timeout; avoid get_related_stories in bulk.

-- A) Dictionary noise
SELECT 'dict_noise' AS chk,
  COUNT(*) FILTER (WHERE text_norm LIKE '%abonament%' OR text_norm LIKE '%colec%') AS noise,
  COUNT(*) AS total
FROM thematic_hub_dictionary;

SELECT * FROM thematic_hub_dictionary WHERE text_norm = 'forexebug';

-- B) Sample signals via graph (use CROSS JOIN LATERAL)
WITH sample AS (
  SELECT unnest(ARRAY[
    2308,688,629,210,4454,2484,4447,2456,2727,1816,
    49,4168,1616,4150,3006,4007,3715,4742,4969,3170
  ]::bigint[]) AS id
),
per AS (
  SELECT
    s.id,
    left(s.title, 50) AS title,
    (SELECT COUNT(*) FROM jsonb_array_elements(COALESCE(s.content->'ner','[]'::jsonb)) e WHERE e->>'label'='LEGAL_REF') AS n_lr,
    (SELECT COUNT(*) FROM legislative_connections lc WHERE lc.source_document_id=s.id AND lc.target_document_id IS NOT NULL) AS n_int,
    (SELECT COUNT(*) FROM legislative_connections lc WHERE lc.source_document_id=s.id AND lc.target_document_id IS NULL AND lc.relationship_type='face referire la (extern)') AS n_ext,
    (SELECT COUNT(*) FROM jsonb_array_elements(g.nodes) x WHERE x->>'type'='program_comun') AS n_hub,
    (SELECT COUNT(*) FROM jsonb_array_elements(g.nodes) x WHERE x->>'type'='external') AS n_gext
  FROM sample sm
  JOIN stiri s ON s.id = sm.id
  CROSS JOIN LATERAL get_legislative_graph(s.id, 1, 0.5, 20, 15) g
)
SELECT *,
  CASE WHEN n_int>0 OR n_ext>0 OR n_hub>0 OR n_gext>0 OR n_lr>0 THEN 'OK' ELSE 'KO' END AS verdict
FROM per
ORDER BY id;

-- Threshold: expect >= 12/20 OK

-- C) Negative controls
WITH neg AS (
  SELECT s.id
  FROM stiri s
  WHERE s.publication_date > CURRENT_DATE - INTERVAL '12 months'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(s.content->'ner','[]'::jsonb)) e
      WHERE e->>'label' IN ('PROGRAM','LEGAL_REF')
    )
    AND NOT EXISTS (
      SELECT 1 FROM thematic_hub_dictionary d
      WHERE lower(s.title) LIKE '%'||d.text_norm||'%'
         OR lower(COALESCE(s.content->>'keywords','')) LIKE '%'||d.text_norm||'%'
    )
  ORDER BY md5(s.id::text || 'neg-hub-2026')
  LIMIT 5
)
SELECT n.id,
  (SELECT COUNT(*) FROM jsonb_array_elements(g.nodes) x WHERE x->>'type'='program_comun') AS hubs,
  CASE WHEN (SELECT COUNT(*) FROM jsonb_array_elements(g.nodes) x WHERE x->>'type'='program_comun') = 0
       THEN 'OK' ELSE 'KO' END AS verdict
FROM neg n
CROSS JOIN LATERAL get_legislative_graph(n.id, 1, 0.5, 20, 15) g;

-- D) Forexebug cluster
SELECT s.id,
  (SELECT string_agg(x->>'title', ', ') FROM jsonb_array_elements(g.nodes) x WHERE x->>'type'='program_comun') AS hubs,
  (SELECT COUNT(*) FROM jsonb_array_elements(g.nodes) x WHERE x->>'type'='external') AS externals
FROM stiri s
CROSS JOIN LATERAL get_legislative_graph(s.id, 2, 0.5, 40, 30) g
WHERE s.id IN (2112, 314, 3383, 5593)
ORDER BY s.id;

-- E) Spot related (single-id calls only)
-- SELECT * FROM get_related_stories(2112, 5, 1.0);
