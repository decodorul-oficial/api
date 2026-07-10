-- Stripe Price ID per tier (fiecare rând = plan + interval, ex. Pro lunar vs Pro anual).
-- View public.subscription_tiers trebuie să expună coloana (ca public.orders cu billing_details).

ALTER TABLE payments.subscription_tiers
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

COMMENT ON COLUMN payments.subscription_tiers.stripe_price_id IS 'Stripe Price ID (price_...) pentru Checkout; configurat în Dashboard Stripe, legat de acest tier.';

CREATE OR REPLACE VIEW public.subscription_tiers AS
SELECT
  id,
  name,
  display_name,
  description,
  price,
  currency,
  "interval",
  features,
  is_active,
  is_popular,
  trial_days,
  created_at,
  updated_at,
  max_email_notifications,
  stripe_price_id
FROM payments.subscription_tiers;
