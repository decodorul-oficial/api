-- =====================================================
-- ADD MISSING FIELDS TO SUBSCRIPTION TIERS
-- Migration 050: Add description, isPopular, and trialDays fields
-- =====================================================

-- Add missing fields to subscription_tiers table
ALTER TABLE subscription_tiers 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS is_popular BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS trial_days INTEGER DEFAULT 0;

-- Update existing tiers with default values
UPDATE subscription_tiers 
SET 
  description = 'Standard subscription tier',
  is_popular = false,
  trial_days = 0
WHERE description IS NULL;

-- Add constraints
ALTER TABLE subscription_tiers 
ADD CONSTRAINT check_trial_days_positive CHECK (trial_days >= 0);

-- Add comments for documentation
COMMENT ON COLUMN subscription_tiers.description IS 'Human-readable description of the subscription tier';
COMMENT ON COLUMN subscription_tiers.is_popular IS 'Whether this tier is marked as popular/recommended';
COMMENT ON COLUMN subscription_tiers.trial_days IS 'Number of trial days for this tier (0 = no trial)';
