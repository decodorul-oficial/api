-- =====================================================
-- MIGRAȚIA 030: CORECTAREA PATTERN-URILOR PENTRU HOTĂRÂRE ȘI DECRET
-- =====================================================
-- Corectează regex-urile pentru hotărâre și decret

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
    v_pattern TEXT;
BEGIN
    -- Normalizează textul
    v_normalized_text := lower(trim(p_text));
    
    -- Pattern-uri pentru diferite tipuri de acte normative
    -- Lege
    IF v_normalized_text ~ 'legea?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})' THEN
        v_pattern := 'legea?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})';
        v_type := 'lege';
        v_number := regexp_replace(v_normalized_text, v_pattern, '\1', 'g');
        v_year := regexp_replace(v_normalized_text, v_pattern, '\2', 'g');
    
    -- Ordonanță de urgență
    ELSIF v_normalized_text ~ 'ordonan[țt]a?\s+de?\s+urgen[țt][ăa]?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})' THEN
        v_pattern := 'ordonan[țt]a?\s+de?\s+urgen[țt][ăa]?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})';
        v_type := 'ordonanta_urgenta';
        v_number := regexp_replace(v_normalized_text, v_pattern, '\1', 'g');
        v_year := regexp_replace(v_normalized_text, v_pattern, '\2', 'g');
    
    -- Ordonanță
    ELSIF v_normalized_text ~ 'ordonan[țt]a?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})' THEN
        v_pattern := 'ordonan[țt]a?\s+nr\.?\s*(\d+)\s*/\s*(\d{4})';
        v_type := 'ordonanta';
        v_number := regexp_replace(v_normalized_text, v_pattern, '\1', 'g');
        v_year := regexp_replace(v_normalized_text, v_pattern, '\2', 'g');
    
    -- Hotărâre (corectat)
    ELSIF v_normalized_text ~ 'hotarare\s+nr\.?\s*(\d+)\s*/\s*(\d{4})' THEN
        v_pattern := 'hotarare\s+nr\.?\s*(\d+)\s*/\s*(\d{4})';
        v_type := 'hotarare';
        v_number := regexp_replace(v_normalized_text, v_pattern, '\1', 'g');
        v_year := regexp_replace(v_normalized_text, v_pattern, '\2', 'g');
    
    -- Decret (corectat)
    ELSIF v_normalized_text ~ 'decret\s+nr\.?\s*(\d+)\s*/\s*(\d{4})' THEN
        v_pattern := 'decret\s+nr\.?\s*(\d+)\s*/\s*(\d{4})';
        v_type := 'decret';
        v_number := regexp_replace(v_normalized_text, v_pattern, '\1', 'g');
        v_year := regexp_replace(v_normalized_text, v_pattern, '\2', 'g');
    
    -- Decizie
    ELSIF v_normalized_text ~ 'decizie\s+nr\.?\s*(\d+)\s*/\s*(\d{4})' THEN
        v_pattern := 'decizie\s+nr\.?\s*(\d+)\s*/\s*(\d{4})';
        v_type := 'decizie';
        v_number := regexp_replace(v_normalized_text, v_pattern, '\1', 'g');
        v_year := regexp_replace(v_normalized_text, v_pattern, '\2', 'g');
    
    -- Cod (Codul fiscal, Codul penal, etc.)
    ELSIF v_normalized_text ~ 'codul\s+([a-zăâîșț]+)' THEN
        v_pattern := 'codul\s+([a-zăâîșț]+)';
        v_type := 'cod';
        v_number := regexp_replace(v_normalized_text, v_pattern, '\1', 'g');
        v_year := NULL;
    
    ELSE
        -- Nu s-a găsit un pattern cunoscut
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

COMMENT ON FUNCTION public.normalize_legislative_identifier(TEXT) IS 'Normalizează identificatorii legislative în tip, număr și an pentru rezolvare precisă (pattern-uri corectate)';
