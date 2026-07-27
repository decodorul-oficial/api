-- Fix payments.update_order_status still referencing renamed netopia_order_id
-- (column was renamed to payment_provider_reference in 079, but live function lagged)

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
