-- =====================================================
-- MIGRAȚIA 065: VIEW PENTRU CONEXIUNI DOCUMENTE ȘI FUNCȚII DE FORMAT
-- =====================================================
-- Creează funcții de format pentru cheile documentelor și un view compatibil
-- cu scenariul: SELECT cheie_document_tinta, tip_relatie FROM conexiuni_documente WHERE id_stire_sursa = ?

-- 1) Funcție: mapare tip -> cod scurt (pentru afișare cheie)
CREATE OR REPLACE FUNCTION public.short_document_code(
    p_type TEXT
) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
    v_t TEXT := lower(coalesce(p_type, ''));
BEGIN
    IF v_t = '' THEN
        RETURN NULL;
    ELSIF v_t IN ('hg', 'hotarare', 'hotărâre', 'hotararea', 'hotărârea', 'hotararea guvernului', 'hotărârea guvernului') THEN
        RETURN 'HG';
    ELSIF v_t IN ('oug', 'ordonanta_urgenta', 'ordonanța_urgență', 'ordonanta de urgenta', 'ordonanța de urgență') THEN
        RETURN 'OUG';
    ELSIF v_t IN ('og', 'ordonanta', 'ordonanța') THEN
        RETURN 'OG';
    ELSIF v_t IN ('lege', 'legea') THEN
        RETURN 'Legea';
    ELSIF v_t IN ('decizie') THEN
        RETURN 'Decizie';
    ELSIF v_t IN ('decret') THEN
        RETURN 'Decret';
    ELSIF v_t IN ('cod', 'codul') THEN
        RETURN 'Codul';
    ELSE
        -- fallback: upper din tipul detectat
        RETURN upper(p_type);
    END IF;
END;
$$;

COMMENT ON FUNCTION public.short_document_code(TEXT) IS 'Mapează tipul documentului la un cod scurt: HG, OUG, OG, Legea, etc.';

-- 2) Funcție: format cheie document (ex. HG-645-2025)
CREATE OR REPLACE FUNCTION public.format_document_key(
    p_type TEXT,
    p_number TEXT,
    p_year TEXT
) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
    v_code TEXT := public.short_document_code(p_type);
    v_num TEXT := NULLIF(trim(coalesce(p_number, '')), '');
    v_year TEXT := NULLIF(trim(coalesce(p_year, '')), '');
BEGIN
    IF v_code IS NULL THEN
        RETURN NULL;
    END IF;
    IF v_num IS NOT NULL AND v_year IS NOT NULL THEN
        RETURN v_code || '-' || v_num || '-' || v_year;
    ELSIF v_num IS NOT NULL THEN
        RETURN v_code || '-' || v_num;
    ELSE
        RETURN v_code;
    END IF;
END;
$$;

COMMENT ON FUNCTION public.format_document_key(TEXT, TEXT, TEXT) IS 'Construiește o cheie de afișare: TIP-NR-AN (ex: HG-645-2025)';

-- 3) VIEW: conexiuni_documente
-- Expune o interfață prietenoasă bazată pe legislative_connections și stiri
DROP VIEW IF EXISTS public.conexiuni_documente;
CREATE VIEW public.conexiuni_documente AS
SELECT 
    lc.source_document_id AS id_stire_sursa,
    -- cheie document sursă, derivată din titlul știrii
    COALESCE(
        public.format_document_key(
            (public.normalize_legislative_identifier(s_src.title))->>'type',
            (public.normalize_legislative_identifier(s_src.title))->>'number',
            (public.normalize_legislative_identifier(s_src.title))->>'year'
        ),
        s_src.title
    ) AS cheie_document_sursa,
    lc.target_document_id AS id_stire_tinta,
    -- cheie document țintă: din țintă internă sau din metadatele normalizate (extern)
    CASE 
        WHEN lc.target_document_id IS NOT NULL THEN 
            COALESCE(
                public.format_document_key(
                    (public.normalize_legislative_identifier(s_tgt.title))->>'type',
                    (public.normalize_legislative_identifier(s_tgt.title))->>'number',
                    (public.normalize_legislative_identifier(s_tgt.title))->>'year'
                ),
                s_tgt.title
            )
        ELSE 
            COALESCE(
                public.format_document_key(
                    lc.metadata->'normalized_identifier'->>'type',
                    lc.metadata->'normalized_identifier'->>'number',
                    lc.metadata->'normalized_identifier'->>'year'
                ),
                lc.metadata->>'external_identifier'
            )
    END AS cheie_document_tinta,
    lc.relationship_type AS tip_relatie,
    lc.confidence_score,
    lc.extraction_method,
    lc.id AS id_conexiune
FROM public.legislative_connections lc
LEFT JOIN public.stiri s_src ON s_src.id = lc.source_document_id
LEFT JOIN public.stiri s_tgt ON s_tgt.id = lc.target_document_id;

COMMENT ON VIEW public.conexiuni_documente IS 'View pentru interogări simple ale conexiunilor dintre documente: id_stire_sursa, cheie_document_tinta, tip_relatie etc.';

-- 4) Exemple de utilizare (documentație în comentarii):
-- SELECT cheie_document_tinta, tip_relatie
-- FROM public.conexiuni_documente
-- WHERE id_stire_sursa = 98;



