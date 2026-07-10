-- Stripe Customer Portal + subscription lifecycle (cancel / webhooks)
-- profiles: customer Stripe pentru billingPortal.sessions.create
-- payments.subscriptions: subscription Stripe (sub_...) pentru cancel / sync din webhooks

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

COMMENT ON COLUMN public.profiles.stripe_customer_id IS 'Stripe Customer ID (cus_…); setat la plată Checkout; folosit pentru Customer Portal.';

ALTER TABLE payments.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

COMMENT ON COLUMN payments.subscriptions.stripe_subscription_id IS 'Stripe Subscription ID (sub_…); anulare și evenimente customer.subscription.*.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_subscriptions_stripe_subscription_id
  ON payments.subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
