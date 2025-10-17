-- =====================================================
-- FIX EMAIL NOTIFICATION FUNCTIONS SCHEMA
-- Migration 058: Move email notification functions from payments to public schema
-- =====================================================

-- =====================================================
-- 1. DROP EXISTING FUNCTIONS FROM PAYMENTS SCHEMA
-- =====================================================

-- Drop functions from payments schema if they exist
DROP FUNCTION IF EXISTS payments.check_email_notification_limit(UUID);
DROP FUNCTION IF EXISTS payments.get_user_email_notification_limit(UUID);
DROP FUNCTION IF EXISTS payments.get_user_current_email_notifications_count(UUID);

-- =====================================================
-- 2. CREATE FUNCTIONS IN PUBLIC SCHEMA
-- =====================================================

-- Function to check email notification limit
CREATE OR REPLACE FUNCTION public.check_email_notification_limit(
    p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_tier_name TEXT;
    v_max_notifications INTEGER;
    v_current_notifications INTEGER;
    v_is_in_trial BOOLEAN;
BEGIN
    -- Get user's subscription tier and trial status
    SELECT 
        p.subscription_tier,
        (p.trial_end IS NOT NULL AND NOW() < p.trial_end) as is_in_trial
    INTO v_user_tier_name, v_is_in_trial
    FROM public.profiles p
    WHERE p.id = p_user_id;
    
    -- If no tier found, default to free (0 notifications)
    IF v_user_tier_name IS NULL THEN
        v_user_tier_name := 'free';
    END IF;
    
    -- Handle trial users: if user is in trial and has 'pro' tier, treat as pro-monthly
    IF v_is_in_trial AND v_user_tier_name = 'pro' THEN
        v_user_tier_name := 'pro-monthly';
    END IF;
    
    -- Get max notifications for this tier
    SELECT st.max_email_notifications INTO v_max_notifications
    FROM payments.subscription_tiers st
    WHERE st.name = v_user_tier_name;
    
    -- If no tier found, default to 0
    IF v_max_notifications IS NULL THEN
        v_max_notifications := 0;
    END IF;
    
    -- Count current active notifications
    SELECT COUNT(*) INTO v_current_notifications
    FROM saved_searches ss
    WHERE ss.user_id = p_user_id 
    AND ss.email_notifications_enabled = TRUE;
    
    -- Return true if under limit
    RETURN v_current_notifications < v_max_notifications;
END;
$$;

-- Function to get user email notification limit
CREATE OR REPLACE FUNCTION public.get_user_email_notification_limit(
    p_user_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_tier_name TEXT;
    v_max_notifications INTEGER;
    v_is_in_trial BOOLEAN;
BEGIN
    -- Get user's subscription tier and trial status
    SELECT 
        p.subscription_tier,
        (p.trial_end IS NOT NULL AND NOW() < p.trial_end) as is_in_trial
    INTO v_user_tier_name, v_is_in_trial
    FROM public.profiles p
    WHERE p.id = p_user_id;
    
    -- If no tier found, default to free (0 notifications)
    IF v_user_tier_name IS NULL THEN
        v_user_tier_name := 'free';
    END IF;
    
    -- Handle trial users: if user is in trial and has 'pro' tier, treat as pro-monthly
    IF v_is_in_trial AND v_user_tier_name = 'pro' THEN
        v_user_tier_name := 'pro-monthly';
    END IF;
    
    -- Get max notifications for this tier
    SELECT st.max_email_notifications INTO v_max_notifications
    FROM payments.subscription_tiers st
    WHERE st.name = v_user_tier_name;
    
    -- If no tier found, default to 0
    IF v_max_notifications IS NULL THEN
        v_max_notifications := 0;
    END IF;
    
    RETURN v_max_notifications;
END;
$$;

-- Function to get user current email notifications count
CREATE OR REPLACE FUNCTION public.get_user_current_email_notifications_count(
    p_user_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_count INTEGER;
BEGIN
    -- Count current active notifications
    SELECT COUNT(*) INTO v_current_count
    FROM saved_searches ss
    WHERE ss.user_id = p_user_id 
    AND ss.email_notifications_enabled = TRUE;
    
    RETURN COALESCE(v_current_count, 0);
END;
$$;

-- =====================================================
-- 3. GRANT PERMISSIONS
-- =====================================================

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.check_email_notification_limit(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_email_notification_limit(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_current_email_notifications_count(UUID) TO authenticated, service_role;

-- =====================================================
-- 4. ADD COMMENTS
-- =====================================================

COMMENT ON FUNCTION public.check_email_notification_limit(UUID) IS 'Check if user can enable more email notifications based on subscription tier';
COMMENT ON FUNCTION public.get_user_email_notification_limit(UUID) IS 'Get maximum email notifications allowed for user based on subscription tier';
COMMENT ON FUNCTION public.get_user_current_email_notifications_count(UUID) IS 'Get current number of active email notifications for user';

-- =====================================================
-- 5. VERIFICATION
-- =====================================================

-- Verify functions exist in public schema
DO $$
BEGIN
    -- Check if functions exist
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_email_notification_limit' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
        RAISE EXCEPTION 'Function public.check_email_notification_limit not found';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_user_email_notification_limit' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
        RAISE EXCEPTION 'Function public.get_user_email_notification_limit not found';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_user_current_email_notifications_count' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
        RAISE EXCEPTION 'Function public.get_user_current_email_notifications_count not found';
    END IF;
    
    RAISE NOTICE 'All email notification functions successfully created in public schema';
END $$;
