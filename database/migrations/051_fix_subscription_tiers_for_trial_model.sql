-- =====================================================
-- FIX SUBSCRIPTION TIERS FOR TRIAL MODEL
-- Migration 051: Update subscription tiers for monthly/yearly with 14-day trial
-- =====================================================

-- Delete existing tiers and recreate with correct structure
DELETE FROM subscription_tiers;

-- Insert the correct subscription tiers
INSERT INTO subscription_tiers (
    name, 
    display_name, 
    description, 
    price, 
    currency, 
    interval, 
    features, 
    is_active, 
    is_popular, 
    trial_days
) VALUES
-- Free tier (no trial, just basic access)
('free', 'Free', 'Acces gratuit cu limitări', 0.00, 'RON', 'LIFETIME', 
 '["Acces limitat la știri", "Căutare de bază", "5 cereri/zi"]', 
 true, false, 0),

-- Pro Monthly (with 14-day trial)
('pro-monthly', 'Pro Lunar', 'Abonament Pro cu acces complet lunar', 29.99, 'RON', 'MONTHLY', 
 '["Acces nelimitat la știri", "Căutare avansată", "Analiză de rețea", "Suport prioritar", "Export PDF"]', 
 true, true, 14),

-- Pro Yearly (with 14-day trial + 2 months free)
('pro-yearly', 'Pro Anual', 'Abonament Pro cu acces complet anual (2 luni gratuite)', 299.99, 'RON', 'YEARLY', 
 '["Acces nelimitat la știri", "Căutare avansată", "Analiză de rețea", "Suport prioritar", "Export PDF", "2 luni gratuite"]', 
 true, false, 14),

-- Enterprise Monthly (with 14-day trial)
('enterprise-monthly', 'Enterprise Lunar', 'Abonament Enterprise cu funcționalități avansate', 99.99, 'RON', 'MONTHLY', 
 '["Toate funcționalitățile Pro", "Integrări personalizate", "Suport dedicat", "API personalizat", "Analiză avansată"]', 
 true, false, 14),

-- Enterprise Yearly (with 14-day trial + 2 months free)
('enterprise-yearly', 'Enterprise Anual', 'Abonament Enterprise cu funcționalități avansate (2 luni gratuite)', 999.99, 'RON', 'YEARLY', 
 '["Toate funcționalitățile Pro", "Integrări personalizate", "Suport dedicat", "API personalizat", "Analiză avansată", "2 luni gratuite"]', 
 true, false, 14);

-- Update the profiles table to support trial status
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS trial_start TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_tier_id UUID REFERENCES subscription_tiers(id);

-- Add index for trial queries
CREATE INDEX IF NOT EXISTS idx_profiles_trial_end ON profiles(trial_end) WHERE trial_end IS NOT NULL;

-- Add comment
COMMENT ON COLUMN profiles.trial_start IS 'Start date of trial period';
COMMENT ON COLUMN profiles.trial_end IS 'End date of trial period';
COMMENT ON COLUMN profiles.trial_tier_id IS 'Tier ID for trial subscription';

-- Create function to check if user is in trial period
CREATE OR REPLACE FUNCTION is_user_in_trial(user_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    trial_end_date TIMESTAMPTZ;
BEGIN
    SELECT trial_end INTO trial_end_date
    FROM profiles
    WHERE id = user_id_param;
    
    IF trial_end_date IS NULL THEN
        RETURN FALSE;
    END IF;
    
    RETURN NOW() < trial_end_date;
END;
$$;

-- Create function to get trial status for user
CREATE OR REPLACE FUNCTION get_user_trial_status(user_id_param UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    profile_record RECORD;
    trial_status JSON;
BEGIN
    SELECT 
        trial_start,
        trial_end,
        trial_tier_id,
        subscription_tier
    INTO profile_record
    FROM profiles
    WHERE id = user_id_param;
    
    IF profile_record.trial_end IS NULL THEN
        trial_status := json_build_object(
            'isTrial', false,
            'hasTrial', false
        );
    ELSE
        IF NOW() < profile_record.trial_end THEN
            trial_status := json_build_object(
                'isTrial', true,
                'hasTrial', true,
                'trialStart', profile_record.trial_start,
                'trialEnd', profile_record.trial_end,
                'tierId', profile_record.trial_tier_id,
                'daysRemaining', EXTRACT(EPOCH FROM (profile_record.trial_end - NOW())) / 86400
            );
        ELSE
            trial_status := json_build_object(
                'isTrial', false,
                'hasTrial', true,
                'expired', true,
                'trialStart', profile_record.trial_start,
                'trialEnd', profile_record.trial_end,
                'tierId', profile_record.trial_tier_id
            );
        END IF;
    END IF;
    
    RETURN trial_status;
END;
$$;

-- Create function to downgrade user from trial
CREATE OR REPLACE FUNCTION downgrade_from_trial(user_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update profile to free tier and clear trial info
    UPDATE profiles
    SET 
        subscription_tier = 'free',
        trial_start = NULL,
        trial_end = NULL,
        trial_tier_id = NULL,
        updated_at = NOW()
    WHERE id = user_id_param;
    
    -- Cancel any trial subscriptions
    UPDATE subscriptions
    SET 
        status = 'CANCELED',
        canceled_at = NOW(),
        updated_at = NOW()
    WHERE user_id = user_id_param 
    AND status = 'TRIALING';
    
    RETURN TRUE;
END;
$$;

-- Add comments for new functions
COMMENT ON FUNCTION is_user_in_trial(UUID) IS 'Check if user is currently in trial period';
COMMENT ON FUNCTION get_user_trial_status(UUID) IS 'Get detailed trial status for user';
COMMENT ON FUNCTION downgrade_from_trial(UUID) IS 'Downgrade user from trial to free tier';
