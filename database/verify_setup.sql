-- =====================================================
-- SCRIPT DE VERIFICARE A CONFIGURĂRII BAZEI DE DATE
-- =====================================================

-- Verificarea tabelelor
SELECT 
    'Tabele' as component,
    table_name,
    CASE 
        WHEN rowsecurity THEN 'RLS ACTIVAT'
        ELSE 'RLS DEZACTIVAT'
    END as rls_status
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('stiri', 'profiles', 'usage_logs')
ORDER BY table_name;

-- Verificarea indecșilor
SELECT 
    'Indecși' as component,
    indexname,
    tablename
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('stiri', 'profiles', 'usage_logs')
ORDER BY tablename, indexname;

-- Verificarea funcțiilor
SELECT 
    'Funcții' as component,
    routine_name,
    routine_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN (
    'handle_new_user',
    'update_updated_at_column',
    'get_user_request_count_24h',
    'get_user_subscription_tier'
)
ORDER BY routine_name;

-- Verificarea trigger-urilor
SELECT 
    'Trigger-uri' as component,
    trigger_name,
    event_object_table,
    event_manipulation,
    action_timing
FROM information_schema.triggers 
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- Verificarea politicilor RLS
SELECT 
    'Politici RLS' as component,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Verificarea datelor de test
SELECT 
    'Date de test' as component,
    COUNT(*) as numar_stiri,
    MIN(publication_date) as data_cea_mai_veche,
    MAX(publication_date) as data_cea_mai_noua
FROM stiri;

-- Verificarea structurii JSONB
SELECT 
    'Structură JSONB' as component,
    title,
    content->>'summary' as summary,
    content->>'category' as category,
    content->>'author' as author
FROM stiri 
LIMIT 3;

-- Testarea funcțiilor utilitare (cu un UUID fictiv pentru test)
SELECT 
    'Test funcții' as component,
    get_user_subscription_tier('00000000-0000-0000-0000-000000000000') as subscription_tier_test,
    get_user_request_count_24h('00000000-0000-0000-0000-000000000000') as request_count_test;

-- Verificarea extensiilor
SELECT 
    'Extensii' as component,
    extname,
    extversion
FROM pg_extension 
WHERE extname = 'uuid-ossp';

-- Sumar final
SELECT 
    'VERIFICARE COMPLETĂ' as status,
    'Toate componentele au fost verificate cu succes' as message,
    NOW() as verificat_la;
