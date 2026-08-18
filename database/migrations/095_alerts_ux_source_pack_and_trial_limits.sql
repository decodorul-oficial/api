-- 095: Alerts UX — source_pack provenance + trial-friendly config limits
-- Delivery (digest/instant send) remains gated on ACTIVE subscription via
-- get_users_with_active_digests / user_has_paid_subscription.
-- Configuration limits follow profile/trial tier so users can set up alerts
-- before paying; sending starts only when the subscription is ACTIVE.

-- 1) Provenance: which profession pack created this row
ALTER TABLE public.legislation_watches
  ADD COLUMN IF NOT EXISTS source_pack_id TEXT
  REFERENCES public.profession_packs(id) ON DELETE SET NULL;

ALTER TABLE public.saved_searches
  ADD COLUMN IF NOT EXISTS source_pack_id TEXT
  REFERENCES public.profession_packs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_legislation_watches_source_pack
  ON public.legislation_watches(source_pack_id)
  WHERE source_pack_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_saved_searches_source_pack
  ON public.saved_searches(source_pack_id)
  WHERE source_pack_id IS NOT NULL;

-- 2) Tier resolution: treat TRIALING like the trial tier for config limits
CREATE OR REPLACE FUNCTION public._user_tier_row_name(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_name TEXT;
  v_active_tier TEXT;
  v_trial_tier TEXT;
BEGIN
  SELECT p.subscription_tier INTO v_name FROM public.profiles p WHERE p.id = p_user_id;
  IF v_name IS NULL THEN v_name := 'free'; END IF;

  SELECT st.name INTO v_active_tier
  FROM payments.subscriptions s
  JOIN payments.subscription_tiers st ON st.id = s.tier_id
  WHERE s.user_id = p_user_id AND s.status = 'ACTIVE'
  LIMIT 1;

  IF v_active_tier IS NOT NULL THEN
    RETURN v_active_tier;
  END IF;

  SELECT st.name INTO v_trial_tier
  FROM payments.subscriptions s
  JOIN payments.subscription_tiers st ON st.id = s.tier_id
  WHERE s.user_id = p_user_id AND s.status = 'TRIALING'
  LIMIT 1;

  IF v_trial_tier IS NOT NULL THEN
    RETURN v_trial_tier;
  END IF;

  IF v_name = 'pro' THEN RETURN 'pro-monthly'; END IF;
  IF v_name = 'enterprise' THEN RETURN 'enterprise-monthly'; END IF;
  RETURN v_name;
END;
$$;

-- 3) Email watch limit uses tier (incl. trial), not ACTIVE-only paid check.
-- Free tier still has max_watch_email_notifications = 0.
CREATE OR REPLACE FUNCTION public.get_user_watch_email_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_limit INTEGER; v_tier TEXT;
BEGIN
  v_tier := public._user_tier_row_name(p_user_id);
  SELECT st.max_watch_email_notifications INTO v_limit
  FROM payments.subscription_tiers st WHERE st.name = v_tier;
  RETURN coalesce(v_limit, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public._user_tier_row_name(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_watch_email_limit(UUID) TO authenticated, service_role;
