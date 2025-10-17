-- =====================================================
-- REMOVE TRIAL DUPLICATION FROM PROFILES TABLE
-- Migration 072: Move trial data source of truth to payments.subscriptions
-- =====================================================

-- 1. Update database functions to use payments.subscriptions instead of profiles
-- =====================================================

-- Update function to check if user is in trial period
CREATE OR REPLACE FUNCTION is_user_in_trial(user_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    trial_end_date TIMESTAMPTZ;
BEGIN
    SELECT trial_end INTO trial_end_date
    FROM payments.subscriptions
    WHERE user_id = user_id_param 
    AND status = 'TRIALING';
    
    IF trial_end_date IS NULL THEN
        RETURN FALSE;
    END IF;
    
    RETURN NOW() < trial_end_date;
END;
$$;

-- Update function to get trial status for user
CREATE OR REPLACE FUNCTION get_user_trial_status(user_id_param UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    subscription_record RECORD;
    trial_status JSON;
BEGIN
    SELECT 
        trial_start,
        trial_end,
        tier_id,
        status
    INTO subscription_record
    FROM payments.subscriptions
    WHERE user_id = user_id_param 
    AND status = 'TRIALING'
    LIMIT 1;
    
    IF subscription_record.trial_end IS NULL THEN
        trial_status := json_build_object(
            'isTrial', false,
            'hasTrial', false
        );
    ELSE
        IF NOW() < subscription_record.trial_end THEN
            trial_status := json_build_object(
                'isTrial', true,
                'hasTrial', true,
                'trialStart', subscription_record.trial_start,
                'trialEnd', subscription_record.trial_end,
                'tierId', subscription_record.tier_id,
                'daysRemaining', EXTRACT(EPOCH FROM (subscription_record.trial_end - NOW())) / 86400
            );
        ELSE
            trial_status := json_build_object(
                'isTrial', false,
                'hasTrial', true,
                'expired', true,
                'trialStart', subscription_record.trial_start,
                'trialEnd', subscription_record.trial_end,
                'tierId', subscription_record.tier_id
            );
        END IF;
    END IF;
    
    RETURN trial_status;
END;
$$;

-- Update function to downgrade user from trial
CREATE OR REPLACE FUNCTION downgrade_from_trial(user_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update profile to free tier (keep subscription_tier for backward compatibility)
    UPDATE profiles
    SET 
        subscription_tier = 'free',
        updated_at = NOW()
    WHERE id = user_id_param;
    
    -- Cancel any trial subscriptions
    UPDATE payments.subscriptions
    SET 
        status = 'CANCELED',
        canceled_at = NOW(),
        updated_at = NOW()
    WHERE user_id = user_id_param 
    AND status = 'TRIALING';
    
    RETURN TRUE;
END;
$$;

-- 2. Remove trial columns from profiles table
-- =====================================================

-- Drop foreign key constraint first
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS fk_profiles_trial_tier_id;

-- Drop index
DROP INDEX IF EXISTS public.idx_profiles_trial_end;

-- Remove trial columns from profiles table
ALTER TABLE public.profiles 
DROP COLUMN IF EXISTS trial_start,
DROP COLUMN IF EXISTS trial_end,
DROP COLUMN IF EXISTS trial_tier_id;

-- 3. Update comments and documentation
-- =====================================================

COMMENT ON FUNCTION is_user_in_trial(UUID) IS 'Check if user is currently in trial period - reads from payments.subscriptions';
COMMENT ON FUNCTION get_user_trial_status(UUID) IS 'Get trial status for user - reads from payments.subscriptions';
COMMENT ON FUNCTION downgrade_from_trial(UUID) IS 'Downgrade user from trial to free tier - updates both profiles and payments.subscriptions';

-- 4. Verification
-- =====================================================

DO $$
BEGIN
    -- Check that trial columns are removed from profiles
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND table_schema = 'public'
        AND column_name IN ('trial_start', 'trial_end', 'trial_tier_id')
    ) THEN
        RAISE EXCEPTION '❌ Trial columns still exist in profiles table';
    ELSE
        RAISE NOTICE '✅ Trial columns successfully removed from profiles table';
    END IF;
    
    -- Check that functions exist and work
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.routines 
        WHERE routine_name = 'is_user_in_trial' 
        AND routine_schema = 'public'
    ) THEN
        RAISE EXCEPTION '❌ is_user_in_trial function not found';
    ELSE
        RAISE NOTICE '✅ is_user_in_trial function updated successfully';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.routines 
        WHERE routine_name = 'get_user_trial_status' 
        AND routine_schema = 'public'
    ) THEN
        RAISE EXCEPTION '❌ get_user_trial_status function not found';
    ELSE
        RAISE NOTICE '✅ get_user_trial_status function updated successfully';
    END IF;
    
    RAISE NOTICE '🎉 Migration completed successfully - trial data source of truth is now payments.subscriptions';
END $$;
