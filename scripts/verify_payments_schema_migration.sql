-- =====================================================
-- VERIFICATION SCRIPT FOR PAYMENTS SCHEMA MIGRATION
-- =====================================================

-- Check if payments schema exists
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'payments') 
        THEN '✅ Payments schema exists'
        ELSE '❌ Payments schema missing'
    END as schema_check;

-- Check if all tables exist in payments schema
SELECT 
    table_name,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'payments' AND table_name = t.table_name
        ) 
        THEN '✅ Exists'
        ELSE '❌ Missing'
    END as status
FROM (
    VALUES 
        ('subscription_tiers'),
        ('subscriptions'),
        ('payment_methods'),
        ('orders'),
        ('refunds'),
        ('payment_logs'),
        ('webhook_processing')
) t(table_name);

-- Check if views exist in public schema
SELECT 
    table_name,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.views 
            WHERE table_schema = 'public' AND table_name = t.table_name
        ) 
        THEN '✅ View exists'
        ELSE '❌ View missing'
    END as status
FROM (
    VALUES 
        ('subscription_tiers'),
        ('subscriptions'),
        ('payment_methods'),
        ('orders'),
        ('refunds'),
        ('payment_logs'),
        ('webhook_processing')
) t(table_name);

-- Check if functions exist in payments schema
SELECT 
    routine_name,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.routines 
            WHERE routine_schema = 'payments' AND routine_name = r.routine_name
        ) 
        THEN '✅ Function exists'
        ELSE '❌ Function missing'
    END as status
FROM (
    VALUES 
        ('activate_subscription'),
        ('cancel_subscription'),
        ('process_webhook_idempotent')
) r(routine_name);

-- Check data migration
SELECT 
    'subscription_tiers' as table_name,
    COUNT(*) as record_count
FROM payments.subscription_tiers
UNION ALL
SELECT 
    'subscriptions' as table_name,
    COUNT(*) as record_count
FROM payments.subscriptions
UNION ALL
SELECT 
    'payment_methods' as table_name,
    COUNT(*) as record_count
FROM payments.payment_methods
UNION ALL
SELECT 
    'orders' as table_name,
    COUNT(*) as record_count
FROM payments.orders
UNION ALL
SELECT 
    'refunds' as table_name,
    COUNT(*) as record_count
FROM payments.refunds
UNION ALL
SELECT 
    'payment_logs' as table_name,
    COUNT(*) as record_count
FROM payments.payment_logs
UNION ALL
SELECT 
    'webhook_processing' as table_name,
    COUNT(*) as record_count
FROM payments.webhook_processing;

-- Check RLS policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE schemaname = 'payments'
ORDER BY tablename, policyname;

-- Check foreign key constraints
SELECT 
    tc.table_schema,
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_schema AS foreign_table_schema,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'payments'
ORDER BY tc.table_name, tc.constraint_name;

-- Check indexes
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'payments'
ORDER BY tablename, indexname;

-- Test view functionality
SELECT 'Testing views...' as test_phase;

-- Test subscription_tiers view
SELECT COUNT(*) as subscription_tiers_count FROM public.subscription_tiers;

-- Test subscriptions view
SELECT COUNT(*) as subscriptions_count FROM public.subscriptions;

-- Test orders view
SELECT COUNT(*) as orders_count FROM public.orders;

-- Test payment_logs view
SELECT COUNT(*) as payment_logs_count FROM public.payment_logs;

-- Test function calls
SELECT 'Testing functions...' as test_phase;

-- Test if functions are callable (without actually calling them)
SELECT 
    routine_name,
    routine_type,
    data_type as return_type
FROM information_schema.routines 
WHERE routine_schema = 'payments'
ORDER BY routine_name;

-- Final verification
SELECT 
    'Migration verification completed!' as status,
    NOW() as verified_at;
