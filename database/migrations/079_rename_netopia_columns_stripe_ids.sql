-- Rename Netopia-specific columns to neutral/Stripe names + Stripe customer/subscription IDs
-- profiles.stripe_customer_id, payments.subscriptions.stripe_subscription_id (from 078)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

COMMENT ON COLUMN public.profiles.stripe_customer_id IS 'Stripe Customer ID (cus_…); folosit pentru Customer Portal.';

ALTER TABLE payments.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

COMMENT ON COLUMN payments.subscriptions.stripe_subscription_id IS 'Stripe Subscription ID (sub_…); anulare și evenimente customer.subscription.*.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_subscriptions_stripe_subscription_id
  ON payments.subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Drop public views before renaming underlying columns
DROP VIEW IF EXISTS public.webhook_processing CASCADE;
DROP VIEW IF EXISTS public.payment_logs CASCADE;
DROP VIEW IF EXISTS public.refunds CASCADE;
DROP VIEW IF EXISTS public.orders CASCADE;
DROP VIEW IF EXISTS public.payment_methods CASCADE;
DROP VIEW IF EXISTS public.subscriptions CASCADE;

-- orders
ALTER TABLE payments.orders RENAME COLUMN netopia_order_id TO payment_provider_reference;
DROP INDEX IF EXISTS payments.idx_payments_orders_netopia_order_id;
CREATE INDEX IF NOT EXISTS idx_payments_orders_payment_provider_reference
  ON payments.orders (payment_provider_reference);

-- subscriptions
ALTER TABLE payments.subscriptions RENAME COLUMN netopia_order_id TO payment_provider_reference;
ALTER TABLE payments.subscriptions RENAME COLUMN netopia_token TO payment_method_token;
DROP INDEX IF EXISTS payments.idx_payments_subscriptions_netopia_order_id;
CREATE INDEX IF NOT EXISTS idx_payments_subscriptions_payment_provider_reference
  ON payments.subscriptions (payment_provider_reference);

-- payment_methods
ALTER TABLE payments.payment_methods RENAME COLUMN netopia_token TO payment_method_token;
DROP INDEX IF EXISTS payments.idx_payments_payment_methods_netopia_token;
CREATE INDEX IF NOT EXISTS idx_payments_payment_methods_payment_method_token
  ON payments.payment_methods (payment_method_token);

-- refunds
ALTER TABLE payments.refunds RENAME COLUMN netopia_refund_id TO payment_refund_reference;
DROP INDEX IF EXISTS payments.idx_payments_refunds_netopia_refund_id;
CREATE INDEX IF NOT EXISTS idx_payments_refunds_payment_refund_reference
  ON payments.refunds (payment_refund_reference);

-- payment_logs
ALTER TABLE payments.payment_logs RENAME COLUMN netopia_order_id TO payment_provider_reference;
DROP INDEX IF EXISTS payments.idx_payments_payment_logs_netopia_order_id;
CREATE INDEX IF NOT EXISTS idx_payments_payment_logs_payment_provider_reference
  ON payments.payment_logs (payment_provider_reference);

-- webhook_processing
ALTER TABLE payments.webhook_processing RENAME COLUMN netopia_order_id TO payment_provider_reference;
DROP INDEX IF EXISTS payments.idx_payments_webhook_processing_netopia_order_id;
CREATE INDEX IF NOT EXISTS idx_payments_webhook_processing_payment_provider_reference
  ON payments.webhook_processing (payment_provider_reference);

ALTER TABLE payments.webhook_processing
  DROP CONSTRAINT IF EXISTS webhook_processing_netopia_order_id_event_type_signature_hash_key;

ALTER TABLE payments.webhook_processing
  ADD CONSTRAINT webhook_processing_provider_ref_event_sig_unique
  UNIQUE (payment_provider_reference, event_type, signature_hash);

-- Recreate public views (subscription_tiers may already exist with stripe_price_id)
DROP VIEW IF EXISTS public.subscription_tiers CASCADE;
CREATE OR REPLACE VIEW public.subscription_tiers AS
SELECT
  id, name, display_name, description, price, currency, "interval",
  features, is_active, is_popular, trial_days, created_at, updated_at,
  max_email_notifications, stripe_price_id
FROM payments.subscription_tiers;

CREATE OR REPLACE VIEW public.subscriptions AS
SELECT * FROM payments.subscriptions;

CREATE OR REPLACE VIEW public.payment_methods AS
SELECT * FROM payments.payment_methods;

CREATE OR REPLACE VIEW public.orders AS
SELECT * FROM payments.orders;

CREATE OR REPLACE VIEW public.refunds AS
SELECT * FROM payments.refunds;

CREATE OR REPLACE VIEW public.payment_logs AS
SELECT * FROM payments.payment_logs;

CREATE OR REPLACE VIEW public.webhook_processing AS
SELECT * FROM payments.webhook_processing;

-- activate_subscription
CREATE OR REPLACE FUNCTION payments.activate_subscription(
  p_subscription_id UUID,
  p_payment_provider_reference TEXT,
  p_payment_method_token TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  subscription_record RECORD;
BEGIN
  SELECT s.*, st.name AS tier_name INTO subscription_record
  FROM payments.subscriptions s
  JOIN payments.subscription_tiers st ON s.tier_id = st.id
  WHERE s.id = p_subscription_id;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  UPDATE payments.subscriptions
  SET
    status = 'ACTIVE',
    payment_provider_reference = p_payment_provider_reference,
    payment_method_token = COALESCE(p_payment_method_token, payment_method_token),
    updated_at = NOW()
  WHERE id = p_subscription_id;

  UPDATE public.profiles
  SET subscription_tier = LOWER(subscription_record.tier_name), updated_at = NOW()
  WHERE id = subscription_record.user_id;

  RETURN TRUE;
END;
$$;

-- process_webhook_idempotent
CREATE OR REPLACE FUNCTION payments.process_webhook_idempotent(
  p_payment_provider_reference TEXT,
  p_event_type TEXT,
  p_signature_hash TEXT,
  p_payload JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_record RECORD;
BEGIN
  SELECT * INTO existing_record
  FROM payments.webhook_processing
  WHERE payment_provider_reference = p_payment_provider_reference
    AND event_type = p_event_type
    AND signature_hash = p_signature_hash;

  IF FOUND THEN RETURN FALSE; END IF;

  INSERT INTO payments.webhook_processing (payment_provider_reference, event_type, signature_hash, status)
  VALUES (p_payment_provider_reference, p_event_type, p_signature_hash, 'PROCESSING');

  RETURN TRUE;
END;
$$;

-- update_order_status (column renames inside body)
CREATE OR REPLACE FUNCTION payments.update_order_status(
  p_order_id UUID,
  p_status TEXT,
  p_transaction_id TEXT DEFAULT NULL,
  p_amount NUMERIC DEFAULT NULL,
  p_currency TEXT DEFAULT NULL,
  p_raw_data JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order payments.orders%ROWTYPE;
  v_sub payments.subscriptions%ROWTYPE;
  v_tier payments.subscription_tiers%ROWTYPE;
  v_new_status TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_period_end TIMESTAMPTZ;
  v_event_type TEXT;
  v_already_succeeded BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_order FROM payments.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0002';
  END IF;

  v_new_status := UPPER(COALESCE(p_status, 'PENDING'));
  IF v_new_status IN ('PAID', 'CONFIRMED', 'SUCCESS', 'SUCCEED', 'SUCCEDED') THEN
    v_new_status := 'SUCCEEDED';
  ELSIF v_new_status IN ('CANCEL', 'CANCELED', 'CANCELLED') THEN
    v_new_status := 'CANCELED';
  ELSIF v_new_status IN ('REFUND', 'REFUNDED', 'PARTIAL_REFUND') THEN
    v_new_status := 'REFUNDED';
  ELSIF v_new_status IN ('FAIL', 'FAILED_ERROR', 'ERROR') THEN
    v_new_status := 'FAILED';
  ELSIF v_new_status NOT IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED') THEN
    v_new_status := 'PENDING';
  END IF;

  IF v_order.status = 'SUCCEEDED' THEN
    v_already_succeeded := TRUE;
  END IF;

  IF v_order.subscription_id IS NULL THEN
    SELECT * INTO v_sub
    FROM payments.subscriptions
    WHERE user_id = v_order.user_id
      AND status IN ('TRIALING', 'PENDING', 'ACTIVE')
    ORDER BY CASE status WHEN 'TRIALING' THEN 1 WHEN 'PENDING' THEN 2 ELSE 3 END, created_at DESC
    LIMIT 1;

    IF FOUND THEN
      UPDATE payments.orders SET subscription_id = v_sub.id WHERE id = v_order.id;
      SELECT * INTO v_order FROM payments.orders WHERE id = p_order_id;
    END IF;
  END IF;

  UPDATE payments.orders
  SET
    status = v_new_status,
    amount = COALESCE(p_amount, payments.orders.amount),
    currency = COALESCE(p_currency, payments.orders.currency),
    metadata = COALESCE(metadata, '{}'::JSONB) || JSONB_BUILD_OBJECT(
      'transaction_id', p_transaction_id,
      'webhook_raw', p_raw_data
    ),
    updated_at = v_now
  WHERE id = p_order_id;

  IF v_order.subscription_id IS NOT NULL THEN
    SELECT * INTO v_sub FROM payments.subscriptions WHERE id = v_order.subscription_id FOR UPDATE;
  END IF;

  IF v_new_status = 'SUCCEEDED' AND v_sub.id IS NOT NULL AND NOT v_already_succeeded THEN
    SELECT * INTO v_tier FROM payments.subscription_tiers WHERE id = v_sub.tier_id;

    IF v_tier.id IS NOT NULL THEN
      IF v_tier.interval = 'MONTHLY' THEN
        v_period_end := v_now + INTERVAL '1 month';
      ELSIF v_tier.interval = 'YEARLY' THEN
        v_period_end := v_now + INTERVAL '1 year';
      ELSIF v_tier.interval = 'LIFETIME' THEN
        v_period_end := NULL;
      END IF;
    END IF;

    UPDATE payments.subscriptions
    SET
      status = 'ACTIVE',
      trial_end = CASE WHEN trial_end IS NULL OR trial_end > v_now THEN v_now ELSE trial_end END,
      current_period_start = COALESCE(current_period_start, v_now),
      current_period_end = COALESCE(current_period_end, v_period_end),
      updated_at = v_now
    WHERE id = v_sub.id;

    v_event_type := 'PAYMENT_SUCCEEDED';
  ELSE
    v_event_type := CASE WHEN v_new_status = 'FAILED' THEN 'PAYMENT_FAILED' ELSE 'WEBHOOK_PROCESSED' END;
  END IF;

  INSERT INTO payments.payment_logs (
    order_id, subscription_id, event_type, payment_provider_reference, amount, currency, status,
    raw_payload, ipn_received_at, ipn_status, error_message
  ) VALUES (
    p_order_id,
    v_order.subscription_id,
    v_event_type,
    v_order.payment_provider_reference,
    p_amount,
    p_currency,
    v_new_status,
    p_raw_data,
    v_now,
    v_new_status,
    CASE WHEN v_already_succeeded THEN 'idempotent' ELSE NULL END
  );

  RETURN JSONB_BUILD_OBJECT(
    'success', TRUE,
    'order_id', p_order_id,
    'new_status', v_new_status,
    'linked_subscription', v_order.subscription_id IS NOT NULL,
    'idempotent', v_already_succeeded
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO payments.payment_logs (
    order_id, subscription_id, event_type, payment_provider_reference, amount, currency, status,
    raw_payload, ipn_received_at, ipn_status, error_message
  ) VALUES (
    p_order_id, NULL, 'WEBHOOK_FAILED', NULL, p_amount, p_currency,
    COALESCE(UPPER(p_status), 'PENDING'), p_raw_data, v_now,
    COALESCE(UPPER(p_status), 'PENDING'), SQLERRM
  );
  RETURN JSONB_BUILD_OBJECT('success', FALSE, 'error', SQLERRM);
END;
$$;

-- Drop legacy Netopia-named public wrapper if exists
DROP FUNCTION IF EXISTS public.update_order_status_by_netopia_id(TEXT, TEXT, JSONB);
