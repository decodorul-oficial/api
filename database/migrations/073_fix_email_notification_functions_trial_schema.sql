-- =====================================================
-- FIX EMAIL NOTIFICATION FUNCTIONS TRIAL SCHEMA
-- Migration 073: Update email notification functions to use payments.subscriptions for trial data
-- =====================================================

-- =====================================================
-- 1. UPDATE EMAIL NOTIFICATION FUNCTIONS
-- =====================================================

-- Function to check email notification limit (updated to use payments.subscriptions)
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
    v_trial_end TIMESTAMPTZ;
BEGIN
    -- Get user's subscription tier from profiles
    SELECT p.subscription_tier INTO v_user_tier_name
    FROM public.profiles p
    WHERE p.id = p_user_id;
    
    -- Check if user is in trial period from payments.subscriptions
    SELECT s.trial_end INTO v_trial_end
    FROM payments.subscriptions s
    WHERE s.user_id = p_user_id 
    AND s.status = 'TRIALING'
    LIMIT 1;
    
    -- Determine if user is in trial
    v_is_in_trial := (v_trial_end IS NOT NULL AND NOW() < v_trial_end);
    
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

-- Function to get user email notification limit (updated to use payments.subscriptions)
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
    v_trial_end TIMESTAMPTZ;
BEGIN
    -- Get user's subscription tier from profiles
    SELECT p.subscription_tier INTO v_user_tier_name
    FROM public.profiles p
    WHERE p.id = p_user_id;
    
    -- Check if user is in trial period from payments.subscriptions
    SELECT s.trial_end INTO v_trial_end
    FROM payments.subscriptions s
    WHERE s.user_id = p_user_id 
    AND s.status = 'TRIALING'
    LIMIT 1;
    
    -- Determine if user is in trial
    v_is_in_trial := (v_trial_end IS NOT NULL AND NOW() < v_trial_end);
    
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

-- =====================================================
-- 2. UPDATE COMMENTS
-- =====================================================

COMMENT ON FUNCTION public.check_email_notification_limit(UUID) IS 'Check if user can enable more email notifications based on subscription tier - reads trial data from payments.subscriptions';
COMMENT ON FUNCTION public.get_user_email_notification_limit(UUID) IS 'Get maximum email notifications allowed for user based on subscription tier - reads trial data from payments.subscriptions';

-- =====================================================
-- 3. VERIFICATION
-- =====================================================

DO $$
BEGIN
    -- Test the functions with a sample user to ensure they work
    RAISE NOTICE 'Testing email notification functions...';
    
    -- Check if functions exist and can be called
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'check_email_notification_limit' 
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ) THEN
        RAISE EXCEPTION '❌ Function public.check_email_notification_limit not found';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'get_user_email_notification_limit' 
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ) THEN
        RAISE EXCEPTION '❌ Function public.get_user_email_notification_limit not found';
    END IF;
    
    RAISE NOTICE '✅ Email notification functions successfully updated to use payments.subscriptions for trial data';
    RAISE NOTICE '🎉 Migration completed successfully - functions now read trial data from correct source';
END $$;
