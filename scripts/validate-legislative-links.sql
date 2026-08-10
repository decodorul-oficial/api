-- =====================================================
-- validate-legislative-links.sql
-- Unit fixtures + sample of 20 random stories with LEGAL_REF
-- Run via: supabase db query --linked -f api/scripts/validate-legislative-links.sql
--
-- Validation run 2026-08-10 (post migration 093 / identity v5):
--   A) normalize fixtures include multi-slash, MS issuer, din-year
--   E) resolve true positives + false friends
--   F) self-subject skip on 6447
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
    ('Guvernul României', NULL, NULL, NULL),
    ('Ordinul nr. 589/993/902/2026', 'ordin', '589/993/902', '2026'),
    ('Ordinul MS nr. 589/2026', 'ordin', '589', '2026'),
    ('Ordinul nr. 898/899 din 16 iulie 2026', 'ordin', '898/899', '2026'),
    ('Decizia nr. 589/2026', 'decizie', '589', '2026')
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
    ('Guvernul României', NULL, NULL, NULL),
    ('Ordinul nr. 589/993/902/2026', 'ordin', '589/993/902', '2026'),
    ('Ordinul MS nr. 589/2026', 'ordin', '589', '2026'),
    ('Ordinul nr. 898/899 din 16 iulie 2026', 'ordin', '898/899', '2026'),
    ('Decizia nr. 589/2026', 'decizie', '589', '2026')
  ) AS f(input, expect_type, expect_number, expect_year)
  CROSS JOIN LATERAL public.normalize_legislative_identifier(f.input) AS n
) s;

-- E) Resolve quality: true positives + false friends
SELECT
  'E_resolve_ms_589' AS suite,
  (SELECT document_id FROM public.resolve_legislative_identifier('Ordinul MS nr. 589/2026') LIMIT 1) AS got_id,
  3532 AS expect_id,
  (SELECT document_id FROM public.resolve_legislative_identifier('Ordinul MS nr. 589/2026') LIMIT 1) = 3532 AS passed;

SELECT
  'E_resolve_decizie_589' AS suite,
  (SELECT document_id FROM public.resolve_legislative_identifier('Decizia nr. 589/2026') LIMIT 1) AS got_id,
  5093 AS expect_id,
  (SELECT document_id FROM public.resolve_legislative_identifier('Decizia nr. 589/2026') LIMIT 1) = 5093 AS passed;

SELECT
  'E_false_friend_compound_not_ms' AS suite,
  (SELECT document_id FROM public.resolve_legislative_identifier('Ordinul nr. 589/993/902/2026') LIMIT 1) AS got_id,
  (
    SELECT document_id FROM public.resolve_legislative_identifier('Ordinul nr. 589/993/902/2026') LIMIT 1
  ) IS DISTINCT FROM 3532
  AND (
    SELECT document_id FROM public.resolve_legislative_identifier('Ordinul nr. 589/993/902/2026') LIMIT 1
  ) IS DISTINCT FROM 5093 AS passed;

SELECT
  'E_nr_dot_strip_decizie' AS suite,
  (SELECT document_id FROM public.resolve_legislative_identifier('Decizia nr. 589/2026') LIMIT 1) IS NOT NULL AS passed;

-- F) Self-subject: 6447 must not keep external self-ref for its own compound order
SELECT
  'F_self_subject_6447' AS suite,
  COUNT(*) FILTER (
    WHERE target_document_id IS NULL
      AND (
        metadata->>'external_identifier' ILIKE '%589/993/902/2026%'
        OR metadata->'source_entity'->>'text' ILIKE '%589/993/902/2026%'
      )
  ) AS self_extern_rows,
  COUNT(*) FILTER (
    WHERE target_document_id IS NULL
      AND (
        metadata->>'external_identifier' ILIKE '%589/993/902/2026%'
        OR metadata->'source_entity'->>'text' ILIKE '%589/993/902/2026%'
      )
  ) = 0 AS passed
FROM legislative_connections
WHERE source_document_id = 6447;

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
  COUNT(*) FILTER (WHERE source_document_id = target_document_id) AS self_links,
  COUNT(*) FILTER (WHERE metadata->>'extraction_version' = '5.0') AS v5_edges
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
