-- Trial expiry hardening + reminder tracking (Hobby-safe: no new cron jobs)
-- 1) Fix broken downgrade_user_from_trial (referenced dropped profiles.trial_* columns)
-- 2) Add trial_reminder_sent_at for one-shot "expires tomorrow" emails
-- 3) Refresh public.subscriptions view to expose the new column (appended at end)

ALTER TABLE payments.subscriptions
  ADD COLUMN IF NOT EXISTS trial_reminder_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN payments.subscriptions.trial_reminder_sent_at IS
  'Set when the 1-day-before trial expiry Reminder email was sent (anti-spam).';

-- Return type changed (dropped trial_* OUT columns) — must DROP first
DROP FUNCTION IF EXISTS public.downgrade_user_from_trial(uuid);

CREATE FUNCTION public.downgrade_user_from_trial(p_user_id uuid)
RETURNS TABLE(
  id uuid,
  subscription_tier text,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Cancel any active trial subscription first
  UPDATE payments.subscriptions s
  SET
    status = 'CANCELED',
    canceled_at = NOW(),
    updated_at = NOW()
  WHERE s.user_id = p_user_id
    AND s.status = 'TRIALING';

  RETURN QUERY
  UPDATE profiles p
  SET
    subscription_tier = 'free',
    updated_at = NOW()
  WHERE p.id = p_user_id
  RETURNING p.id, p.subscription_tier, p.updated_at;
END;
$function$;

-- Keep downgrade_from_trial as the simple boolean helper used by app code
CREATE OR REPLACE FUNCTION public.downgrade_from_trial(user_id_param uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE profiles
  SET
    subscription_tier = 'free',
    updated_at = NOW()
  WHERE id = user_id_param;

  UPDATE payments.subscriptions
  SET
    status = 'CANCELED',
    canceled_at = NOW(),
    updated_at = NOW()
  WHERE user_id = user_id_param
    AND status = 'TRIALING';

  RETURN TRUE;
END;
$function$;

-- Append new column at end (CREATE OR REPLACE VIEW allows adding columns at end only)
CREATE OR REPLACE VIEW public.subscriptions AS
SELECT
  id,
  user_id,
  tier_id,
  status,
  payment_provider_reference,
  payment_method_token,
  current_period_start,
  current_period_end,
  cancel_at_period_end,
  canceled_at,
  cancel_requested_at,
  cancel_effective_at,
  auto_renew,
  trial_start,
  trial_end,
  metadata,
  created_at,
  updated_at,
  stripe_subscription_id,
  trial_reminder_sent_at
FROM payments.subscriptions;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO service_role;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT SELECT ON public.subscriptions TO anon;
