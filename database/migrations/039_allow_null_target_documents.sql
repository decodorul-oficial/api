-- =====================================================
-- MIGRAȚIA 039: PERMITEREA DOCUMENTELOR ȚINTĂ NULL
-- =====================================================
-- Modifică tabela legislative_connections să permită target_document_id NULL pentru documente externe

-- 1. Modifică tabela să permită target_document_id NULL
ALTER TABLE public.legislative_connections 
ALTER COLUMN target_document_id DROP NOT NULL;

-- 2. Adaugă o constrângere de verificare pentru a permite NULL doar pentru tipuri speciale
ALTER TABLE public.legislative_connections 
ADD CONSTRAINT check_target_document_null 
CHECK (
    (target_document_id IS NOT NULL) OR 
    (target_document_id IS NULL AND relationship_type IN ('face referire la (extern)', 'eroare_extragere'))
);

-- 3. Actualizează comentariul tabelului
COMMENT ON TABLE public.legislative_connections IS 'Conexiuni legislative între documente, inclusiv referințe externe și erori de extragere';
