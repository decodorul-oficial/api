-- =====================================================
-- CLEANUP EMAIL NOTIFICATION SYSTEM
-- Migration 059: Complete removal of previous email notification implementation
-- =====================================================

-- =====================================================
-- 1. DROP ALL EMAIL NOTIFICATION FUNCTIONS
-- =====================================================

-- Drop functions from public schema
DROP FUNCTION IF EXISTS public.check_email_notification_limit(UUID);
DROP FUNCTION IF EXISTS public.get_user_email_notification_limit(UUID);
DROP FUNCTION IF EXISTS public.get_user_current_email_notifications_count(UUID);

-- =====================================================
-- 2. DROP EMAIL NOTIFICATION TABLES
-- =====================================================

-- Drop email notification logs table
DROP TABLE IF EXISTS payments.email_notification_logs CASCADE;

-- Drop email templates table
DROP TABLE IF EXISTS payments.email_templates CASCADE;

-- =====================================================
-- 3. REMOVE EMAIL NOTIFICATION COLUMNS
-- =====================================================

-- Remove max_email_notifications column from subscription_tiers
ALTER TABLE payments.subscription_tiers 
DROP COLUMN IF EXISTS max_email_notifications;

-- Remove email_notifications_enabled column from saved_searches
ALTER TABLE saved_searches 
DROP COLUMN IF EXISTS email_notifications_enabled;

-- =====================================================
-- 4. CLEANUP COMMENTS
-- =====================================================

-- Remove comments that are no longer relevant
COMMENT ON TABLE payments.subscription_tiers IS 'Subscription tiers with pricing and features';
COMMENT ON TABLE saved_searches IS 'User saved search queries';

-- =====================================================
-- 5. VERIFICATION
-- =====================================================

-- Verify cleanup was successful
DO $$
DECLARE
    v_table_exists BOOLEAN;
    v_column_exists BOOLEAN;
    v_function_exists BOOLEAN;
BEGIN
    -- Check if email_notification_logs table was removed
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'payments' 
        AND table_name = 'email_notification_logs'
    ) INTO v_table_exists;
    
    IF v_table_exists THEN
        RAISE EXCEPTION 'email_notification_logs table still exists';
    END IF;
    
    -- Check if email_templates table was removed
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'payments' 
        AND table_name = 'email_templates'
    ) INTO v_table_exists;
    
    IF v_table_exists THEN
        RAISE EXCEPTION 'email_templates table still exists';
    END IF;
    
    -- Check if max_email_notifications column was removed
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'payments' 
        AND table_name = 'subscription_tiers' 
        AND column_name = 'max_email_notifications'
    ) INTO v_column_exists;
    
    IF v_column_exists THEN
        RAISE EXCEPTION 'max_email_notifications column still exists in subscription_tiers';
    END IF;
    
    -- Check if email_notifications_enabled column was removed
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'saved_searches' 
        AND column_name = 'email_notifications_enabled'
    ) INTO v_column_exists;
    
    IF v_column_exists THEN
        RAISE EXCEPTION 'email_notifications_enabled column still exists in saved_searches';
    END IF;
    
    -- Check if functions were removed
    SELECT EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'check_email_notification_limit' 
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ) INTO v_function_exists;
    
    IF v_function_exists THEN
        RAISE EXCEPTION 'check_email_notification_limit function still exists';
    END IF;
    
    RAISE NOTICE 'Email notification system cleanup completed successfully';
END $$;
