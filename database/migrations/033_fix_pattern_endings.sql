-- =====================================================
-- MIGRAȚIA 033: CORECTAREA PATTERN-URILOR PENTRU TERMINAȚII
-- =====================================================
-- Corectează pattern-urile pentru a include terminările corecte

CREATE OR REPLACE FUNCTION public.normalize_legislative_identifier(
    p_text TEXT
) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
    v_result JSONB;
    v_normalized_text TEXT;
    v_type TEXT;
    v_number TEXT;
    v_year TEXT;
BEGIN
    -- Normalizează textul și diacriticele
    v_normalized_text := lower(trim(p_text));
    v_normalized_text := replace(v_normalized_text, 'ă', 'a');
    v_normalized_text := replace(v_normalized_text, 'â', 'a');
    v_normalized_text := replace(v_normalized_text, 'î', 'i');
    v_normalized_text := replace(v_normalized_text, 'ș', 's');
    v_normalized_text := replace(v_normalized_text, 'ț', 't');
    
    -- Pattern-uri pentru diferite tipuri de acte normative
    -- Lege
    IF v_normalized_text ~ 'legea?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})' THEN
        v_type := 'lege';
        v_number := regexp_replace(v_normalized_text, 'legea?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})', '\1', 'g');
        v_year := regexp_replace(v_normalized_text, 'legea?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})', '\2', 'g');
    
    -- Ordonanță de urgență
    ELSIF v_normalized_text ~ 'ordonanta?\s+de?\s+urgenta?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})' THEN
        v_type := 'ordonanta_urgenta';
        v_number := regexp_replace(v_normalized_text, 'ordonanta?\s+de?\s+urgenta?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})', '\1', 'g');
        v_year := regexp_replace(v_normalized_text, 'ordonanta?\s+de?\s+urgenta?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})', '\2', 'g');
    
    -- Ordonanță
    ELSIF v_normalized_text ~ 'ordonanta?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})' THEN
        v_type := 'ordonanta';
        v_number := regexp_replace(v_normalized_text, 'ordonanta?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})', '\1', 'g');
        v_year := regexp_replace(v_normalized_text, 'ordonanta?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})', '\2', 'g');
    
    -- Hotărâre (corectat pentru "hotararea")
    ELSIF v_normalized_text ~ 'hotararea?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})' THEN
        v_type := 'hotarare';
        v_number := regexp_replace(v_normalized_text, 'hotararea?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})', '\1', 'g');
        v_year := regexp_replace(v_normalized_text, 'hotararea?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})', '\2', 'g');
    
    -- Decret (corectat pentru "decretul")
    ELSIF v_normalized_text ~ 'decretul?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})' THEN
        v_type := 'decret';
        v_number := regexp_replace(v_normalized_text, 'decretul?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})', '\1', 'g');
        v_year := regexp_replace(v_normalized_text, 'decretul?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})', '\2', 'g');
    
    -- Decizie
    ELSIF v_normalized_text ~ 'decizie\s+nr\.?\s*(\d+)\s*/\s*(\d{4})' THEN
        v_type := 'decizie';
        v_number := regexp_replace(v_normalized_text, 'decizie\s+nr\.?\s*(\d+)\s*/\s*(\d{4})', '\1', 'g');
        v_year := regexp_replace(v_normalized_text, 'decizie\s+nr\.?\s*(\d+)\s*/\s*(\d{4})', '\2', 'g');
    
    -- Cod
    ELSIF v_normalized_text ~ 'codul\s+([a-z]+)' THEN
        v_type := 'cod';
        v_number := regexp_replace(v_normalized_text, 'codul\s+([a-z]+)', '\1', 'g');
        v_year := NULL;
    
    ELSE
        v_type := NULL;
        v_number := NULL;
        v_year := NULL;
    END IF;
    
    -- Construiește rezultatul
    v_result := jsonb_build_object(
        'type', v_type,
        'number', v_number,
        'year', v_year,
        'normalized_text', v_normalized_text,
        'confidence', CASE 
            WHEN v_type IS NOT NULL THEN 0.9
            ELSE 0.3
        END
    );
    
    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.normalize_legislative_identifier(TEXT) IS 'Normalizează identificatorii legislative în tip, număr și an pentru rezolvare precisă (terminații corectate)';
