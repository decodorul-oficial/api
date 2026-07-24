-- =====================================================
-- validate-legislative-links.sql
-- Unit fixtures + sample of 20 random stories with LEGAL_REF
-- Run via: supabase db query --linked -f api/scripts/validate-legislative-links.sql
--
-- Validation run 2026-07-24 (post migration 080):
--   A) normalize fixtures: 9/9 pass
--   B) sample 20 stories: 20/20 produce edges (external and/or internal);
--      2 internal edges in sample — both cite Legea 165/2013 → story about that law (OK)
--   C) globals: org_edges=0, text_title_match=0, LEGAL_REF dominant, self_links=0
--   D) get_related_stories smoke: OK (same columns)
-- =====================================================

-- A) Normalize fixtures (must all pass)
WITH fixtures AS (
  SELECT * FROM (VALUES
    ('HG nr. 645/2025', 'hg', '645', '2025'),
    ('Hotărârea Guvernului nr. 645/2025', 'hg', '645', '2025'),
    ('Legea nr. 15/1990', 'lege', '15', '1990'),
    ('OUG nr. 115/2023', 'oug', '115', '2023'),
    ('Ordinul nr. 1.908/2025', 'ordin', '1908', '2025'),
    ('Art. 5 din Legea nr. 15/1990', 'lege', '15', '1990'),
    ('Anexa nr. 1 la HG nr. 828/2024', 'hg', '828', '2024'),
    ('Codul de procedură civilă', 'cod', 'de procedura civila', NULL),
    ('Guvernul României', NULL, NULL, NULL)
  ) AS t(input, expect_type, expect_number, expect_year)
),
results AS (
  SELECT
    f.input,
    f.expect_type,
    n->>'type' AS got_type,
    f.expect_number,
    n->>'number' AS got_number,
    f.expect_year,
    n->>'year' AS got_year,
    (n->>'type' IS NOT DISTINCT FROM f.expect_type)
      AND (n->>'number' IS NOT DISTINCT FROM f.expect_number)
      AND (n->>'year' IS NOT DISTINCT FROM f.expect_year) AS passed
  FROM fixtures f
  CROSS JOIN LATERAL public.normalize_legislative_identifier(f.input) AS n
)
SELECT 'A_normalize_fixtures' AS suite, *
FROM results
ORDER BY passed ASC, input;

SELECT
  'A_normalize_summary' AS suite,
  COUNT(*) FILTER (WHERE passed) AS passed,
  COUNT(*) FILTER (WHERE NOT passed) AS failed,
  COUNT(*) AS total
FROM (
  SELECT
    (n->>'type' IS NOT DISTINCT FROM f.expect_type)
      AND (n->>'number' IS NOT DISTINCT FROM f.expect_number)
      AND (n->>'year' IS NOT DISTINCT FROM f.expect_year) AS passed
  FROM (VALUES
    ('HG nr. 645/2025', 'hg', '645', '2025'),
    ('Hotărârea Guvernului nr. 645/2025', 'hg', '645', '2025'),
    ('Legea nr. 15/1990', 'lege', '15', '1990'),
    ('OUG nr. 115/2023', 'oug', '115', '2023'),
    ('Ordinul nr. 1.908/2025', 'ordin', '1908', '2025'),
    ('Art. 5 din Legea nr. 15/1990', 'lege', '15', '1990'),
    ('Anexa nr. 1 la HG nr. 828/2024', 'hg', '828', '2024'),
    ('Codul de procedură civilă', 'cod', 'de procedura civila', NULL),
    ('Guvernul României', NULL, NULL, NULL)
  ) AS f(input, expect_type, expect_number, expect_year)
  CROSS JOIN LATERAL public.normalize_legislative_identifier(f.input) AS n
) s;

-- C) Global metrics
SELECT
  'C_global_metrics' AS suite,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE target_document_id IS NOT NULL) AS internal,
  ROUND(100.0 * COUNT(*) FILTER (WHERE metadata->>'match_method' = 'exact_identifier_match')
    / NULLIF(COUNT(*) FILTER (WHERE target_document_id IS NOT NULL), 0), 1) AS pct_exact_of_internal,
  COUNT(*) FILTER (WHERE metadata->>'match_method' = 'text_title_match') AS text_title_match,
  COUNT(*) FILTER (WHERE metadata->'source_entity'->>'label' = 'LEGAL_REF') AS legal_ref_edges,
  COUNT(*) FILTER (WHERE metadata->'source_entity'->>'label' = 'ORGANIZATION') AS org_edges,
  COUNT(*) FILTER (WHERE source_document_id = target_document_id) AS self_links
FROM legislative_connections;

-- Parseable rate on sample LEGAL_REF
WITH sample AS (
  SELECT DISTINCT trim(e->>'text') AS txt
  FROM stiri s, jsonb_array_elements(COALESCE(s.content->'ner', s.entities)) e
  WHERE e->>'label' = 'LEGAL_REF'
    AND s.publication_date > CURRENT_DATE - 90
  LIMIT 500
)
SELECT
  'C_parseable_legal_ref_90d_sample' AS suite,
  COUNT(*) AS sample_size,
  COUNT(*) FILTER (WHERE (normalize_legislative_identifier(txt)->>'type') IS NOT NULL) AS parseable,
  ROUND(100.0 * COUNT(*) FILTER (WHERE (normalize_legislative_identifier(txt)->>'type') IS NOT NULL) / NULLIF(COUNT(*),0), 1) AS pct_parseable
FROM sample;

-- B) Pick 20 random stories with LEGAL_REF (stable seed via md5)
DROP TABLE IF EXISTS tmp_validation_sample_20;
CREATE TEMP TABLE tmp_validation_sample_20 AS
SELECT s.id, s.title, s.publication_date
FROM stiri s
WHERE s.publication_date > CURRENT_DATE - INTERVAL '12 months'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(s.content->'ner', s.entities)) e
    WHERE e->>'label' = 'LEGAL_REF'
  )
ORDER BY md5(s.id::text || 'legislative-validation-2026')
LIMIT 20;

SELECT 'B_sample_stories' AS suite, id, left(title, 100) AS title, publication_date
FROM tmp_validation_sample_20
ORDER BY id;

-- Per-story signals
SELECT
  'B_story_signals' AS suite,
  sm.id AS story_id,
  (
    SELECT COUNT(*)
    FROM jsonb_array_elements(COALESCE(s.content->'ner', s.entities)) e
    WHERE e->>'label' = 'LEGAL_REF'
  ) AS legal_ref_count,
  (
    SELECT COUNT(*)
    FROM jsonb_array_elements(COALESCE(s.content->'ner', s.entities)) e
    WHERE e->>'label' = 'LEGAL_REF'
      AND (normalize_legislative_identifier(e->>'text')->>'type') IS NOT NULL
  ) AS legal_ref_parseable,
  COUNT(lc.id) FILTER (WHERE lc.target_document_id IS NOT NULL) AS internal_links,
  COUNT(lc.id) FILTER (WHERE lc.target_document_id IS NULL) AS external_links
FROM tmp_validation_sample_20 sm
JOIN stiri s ON s.id = sm.id
LEFT JOIN legislative_connections lc ON lc.source_document_id = sm.id
GROUP BY sm.id, s.content, s.entities
ORDER BY sm.id;

-- Internal edges for semantic review
SELECT
  'B_internal_edges_for_review' AS suite,
  lc.source_document_id,
  left(src.title, 80) AS source_title,
  lc.target_document_id,
  left(tgt.title, 80) AS target_title,
  lc.relationship_type,
  lc.metadata->>'match_method' AS match_method,
  lc.metadata->'source_entity'->>'text' AS cited_entity,
  lc.metadata->'resolved_identifier' AS resolved,
  left(coalesce(lc.metadata->>'local_window', ''), 160) AS local_window
FROM legislative_connections lc
JOIN tmp_validation_sample_20 sm ON sm.id = lc.source_document_id
JOIN stiri src ON src.id = lc.source_document_id
JOIN stiri tgt ON tgt.id = lc.target_document_id
WHERE lc.target_document_id IS NOT NULL
ORDER BY lc.source_document_id, lc.confidence_score DESC;

-- D) Related stories smoke (same columns)
SELECT 'D_related_stories_smoke' AS suite, r.*
FROM tmp_validation_sample_20 sm
CROSS JOIN LATERAL get_related_stories(sm.id, 3, 1.0) r
LIMIT 15;
