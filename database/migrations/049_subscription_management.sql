-- =====================================================
-- SUBSCRIPTION MANAGEMENT DATABASE SCHEMA
-- Migration 049: Add subscription management tables
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. SUBSCRIPTION TIERS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS subscription_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RON',
    interval TEXT NOT NULL CHECK (interval IN ('MONTHLY', 'YEARLY', 'LIFETIME')),
    features JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- 2. SUBSCRIPTIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tier_id UUID NOT NULL REFERENCES subscription_tiers(id),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 
        'TRIALING', 'INCOMPLETE', 'INCOMPLETE_EXPIRED'
    )),
    netopia_order_id TEXT UNIQUE,
    netopia_token TEXT,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    canceled_at TIMESTAMPTZ,
    cancel_requested_at TIMESTAMPTZ,
    cancel_effective_at TIMESTAMPTZ,
    auto_renew BOOLEAN NOT NULL DEFAULT true,
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- 3. PAYMENT METHODS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    netopia_token TEXT NOT NULL UNIQUE,
    last4 TEXT NOT NULL,
    brand TEXT NOT NULL,
    exp_month INTEGER NOT NULL,
    exp_year INTEGER NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- 4. ORDERS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id),
    netopia_order_id TEXT NOT NULL UNIQUE,
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RON',
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 
        'CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED'
    )),
    checkout_url TEXT,
    payment_method_id UUID REFERENCES payment_methods(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- 5. REFUNDS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id),
    netopia_refund_id TEXT UNIQUE,
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RON',
    reason TEXT NOT NULL CHECK (reason IN (
        'DUPLICATE', 'FRAUDULENT', 'REQUESTED_BY_CUSTOMER', 'ADMIN_REFUND'
    )),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED'
    )),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- 6. PAYMENT LOGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS payment_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id),
    subscription_id UUID REFERENCES subscriptions(id),
    event_type TEXT NOT NULL CHECK (event_type IN (
        'ORDER_CREATED', 'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED',
        'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_UPDATED', 'SUBSCRIPTION_CANCELED',
        'REFUND_CREATED', 'REFUND_SUCCEEDED', 'REFUND_FAILED',
        'WEBHOOK_RECEIVED', 'WEBHOOK_PROCESSED', 'WEBHOOK_FAILED',
        'TRIAL_STARTED', 'TRIAL_ENDED', 'AUTO_RENEWAL_ATTEMPTED',
        'AUTO_RENEWAL_FAILED', 'PAYMENT_RETRY', 'ORPHAN_PAYMENT'
    )),
    netopia_order_id TEXT,
    amount DECIMAL(10,2),
    currency TEXT,
    status TEXT,
    raw_payload JSONB NOT NULL,
    ipn_received_at TIMESTAMPTZ,
    ipn_status TEXT,
    webhook_id TEXT,
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    processing_time_ms INTEGER,
    processed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- 7. WEBHOOK PROCESSING TABLE (IDEMPOTENCY)
-- =====================================================

CREATE TABLE IF NOT EXISTS webhook_processing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    netopia_order_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    signature_hash TEXT NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    status TEXT NOT NULL DEFAULT 'PROCESSING' CHECK (status IN (
        'PROCESSING', 'SUCCEEDED', 'FAILED'
    )),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(netopia_order_id, event_type, signature_hash)
);

-- =====================================================
-- 8. INDEXES FOR PERFORMANCE
-- =====================================================

-- Subscription tiers indexes
CREATE INDEX IF NOT EXISTS idx_subscription_tiers_is_active ON subscription_tiers(is_active);
CREATE INDEX IF NOT EXISTS idx_subscription_tiers_price ON subscription_tiers(price);

-- Subscriptions indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_netopia_order_id ON subscriptions(netopia_order_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_current_period_end ON subscriptions(current_period_end);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tier_id ON subscriptions(tier_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_cancel_requested_at ON subscriptions(cancel_requested_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_cancel_effective_at ON subscriptions(cancel_effective_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_auto_renew ON subscriptions(auto_renew);

-- Orders indexes
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_subscription_id ON orders(subscription_id);
CREATE INDEX IF NOT EXISTS idx_orders_netopia_order_id ON orders(netopia_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- Payment methods indexes
CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_netopia_token ON payment_methods(netopia_token);
CREATE INDEX IF NOT EXISTS idx_payment_methods_is_default ON payment_methods(is_default);

-- Refunds indexes
CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_netopia_refund_id ON refunds(netopia_refund_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);

-- Payment logs indexes
CREATE INDEX IF NOT EXISTS idx_payment_logs_order_id ON payment_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_subscription_id ON payment_logs(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_event_type ON payment_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_payment_logs_netopia_order_id ON payment_logs(netopia_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_processed_at ON payment_logs(processed_at DESC);

-- Webhook processing indexes
CREATE INDEX IF NOT EXISTS idx_webhook_processing_netopia_order_id ON webhook_processing(netopia_order_id);
CREATE INDEX IF NOT EXISTS idx_webhook_processing_signature_hash ON webhook_processing(signature_hash);

-- =====================================================
-- 9. FUNCTIONS FOR ATOMIC OPERATIONS
-- =====================================================

-- Function to activate subscription and update user profile atomically
CREATE OR REPLACE FUNCTION activate_subscription(
    p_subscription_id UUID,
    p_netopia_order_id TEXT,
    p_netopia_token TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_tier_name TEXT;
BEGIN
    -- Get subscription details
    SELECT s.user_id, st.name INTO v_user_id, v_tier_name
    FROM subscriptions s
    JOIN subscription_tiers st ON s.tier_id = st.id
    WHERE s.id = p_subscription_id;
    
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Update subscription status
    UPDATE subscriptions 
    SET 
        status = 'ACTIVE',
        netopia_order_id = p_netopia_order_id,
        netopia_token = COALESCE(p_netopia_token, netopia_token),
        updated_at = NOW()
    WHERE id = p_subscription_id;
    
    -- Update user profile subscription tier
    UPDATE profiles 
    SET 
        subscription_tier = LOWER(v_tier_name),
        updated_at = NOW()
    WHERE id = v_user_id;
    
    -- Log the event
    INSERT INTO payment_logs (subscription_id, event_type, netopia_order_id, raw_payload)
    VALUES (p_subscription_id, 'SUBSCRIPTION_CREATED', p_netopia_order_id, 
            jsonb_build_object('subscription_id', p_subscription_id, 'tier', v_tier_name));
    
    RETURN TRUE;
END;
$$;

-- Function to cancel subscription
CREATE OR REPLACE FUNCTION cancel_subscription(
    p_subscription_id UUID,
    p_immediate BOOLEAN DEFAULT FALSE,
    p_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_tier_name TEXT;
BEGIN
    -- Get subscription details
    SELECT s.user_id, st.name INTO v_user_id, v_tier_name
    FROM subscriptions s
    JOIN subscription_tiers st ON s.tier_id = st.id
    WHERE s.id = p_subscription_id;
    
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Update subscription
    UPDATE subscriptions 
    SET 
        status = CASE WHEN p_immediate THEN 'CANCELED' ELSE status END,
        cancel_at_period_end = CASE WHEN p_immediate THEN TRUE ELSE TRUE END,
        canceled_at = CASE WHEN p_immediate THEN NOW() ELSE canceled_at END,
        updated_at = NOW()
    WHERE id = p_subscription_id;
    
    -- If immediate cancellation, downgrade user profile
    IF p_immediate THEN
        UPDATE profiles 
        SET 
            subscription_tier = 'free',
            updated_at = NOW()
        WHERE id = v_user_id;
    END IF;
    
    -- Log the event
    INSERT INTO payment_logs (subscription_id, event_type, raw_payload)
    VALUES (p_subscription_id, 'SUBSCRIPTION_CANCELED', 
            jsonb_build_object('subscription_id', p_subscription_id, 'immediate', p_immediate, 'reason', p_reason));
    
    RETURN TRUE;
END;
$$;

-- Function to process webhook idempotently
CREATE OR REPLACE FUNCTION process_webhook_idempotent(
    p_netopia_order_id TEXT,
    p_event_type TEXT,
    p_signature_hash TEXT,
    p_raw_payload JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_existing_id UUID;
BEGIN
    -- Check if already processed
    SELECT id INTO v_existing_id
    FROM webhook_processing
    WHERE netopia_order_id = p_netopia_order_id 
      AND event_type = p_event_type 
      AND signature_hash = p_signature_hash;
    
    IF v_existing_id IS NOT NULL THEN
        RETURN FALSE; -- Already processed
    END IF;
    
    -- Insert processing record
    INSERT INTO webhook_processing (netopia_order_id, event_type, signature_hash)
    VALUES (p_netopia_order_id, p_event_type, p_signature_hash);
    
    -- Log the webhook
    INSERT INTO payment_logs (netopia_order_id, event_type, raw_payload)
    VALUES (p_netopia_order_id, 'WEBHOOK_RECEIVED', p_raw_payload);
    
    RETURN TRUE;
END;
$$;

-- =====================================================
-- 10. TRIGGERS FOR UPDATED_AT
-- =====================================================

-- Update updated_at timestamp function (reuse existing)
-- Apply triggers to all new tables
CREATE TRIGGER update_subscription_tiers_updated_at
    BEFORE UPDATE ON subscription_tiers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_methods_updated_at
    BEFORE UPDATE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_refunds_updated_at
    BEFORE UPDATE ON refunds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 11. ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_processing ENABLE ROW LEVEL SECURITY;

-- Subscription tiers - readable by all authenticated users
CREATE POLICY "Allow authenticated users to read subscription tiers" ON subscription_tiers
    FOR SELECT TO authenticated USING (is_active = true);

-- Subscriptions - users can only access their own
CREATE POLICY "Users can access own subscriptions" ON subscriptions
    FOR ALL TO authenticated USING (user_id = auth.uid());

-- Payment methods - users can only access their own
CREATE POLICY "Users can access own payment methods" ON payment_methods
    FOR ALL TO authenticated USING (user_id = auth.uid());

-- Orders - users can only access their own
CREATE POLICY "Users can access own orders" ON orders
    FOR ALL TO authenticated USING (user_id = auth.uid());

-- Refunds - users can only access their own (through orders)
CREATE POLICY "Users can access own refunds" ON refunds
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM orders WHERE id = refunds.order_id AND user_id = auth.uid())
    );

-- Payment logs - only service role can access
CREATE POLICY "Only service role can access payment logs" ON payment_logs
    FOR ALL TO service_role USING (true);

-- Webhook processing - only service role can access
CREATE POLICY "Only service role can access webhook processing" ON webhook_processing
    FOR ALL TO service_role USING (true);

-- =====================================================
-- 12. INSERT DEFAULT SUBSCRIPTION TIERS
-- =====================================================

INSERT INTO subscription_tiers (name, display_name, price, currency, interval, features) VALUES
('free', 'Free', 0.00, 'RON', 'LIFETIME', '["Basic access", "Limited requests"]'),
('pro', 'Pro', 29.99, 'RON', 'MONTHLY', '["Unlimited requests", "Advanced analytics", "Priority support"]'),
('enterprise', 'Enterprise', 99.99, 'RON', 'MONTHLY', '["Unlimited requests", "Advanced analytics", "Priority support", "Custom integrations", "Dedicated support"]')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- 13. COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE subscription_tiers IS 'Available subscription tiers with pricing and features';
COMMENT ON TABLE subscriptions IS 'User subscriptions to different tiers';
COMMENT ON TABLE payment_methods IS 'Tokenized payment methods for users';
COMMENT ON TABLE orders IS 'Payment orders for subscriptions and one-time payments';
COMMENT ON TABLE refunds IS 'Refunds processed for orders';
COMMENT ON TABLE payment_logs IS 'Audit log for all payment-related events';
COMMENT ON TABLE webhook_processing IS 'Idempotency tracking for webhook processing';

COMMENT ON FUNCTION activate_subscription(UUID, TEXT, TEXT) IS 'Atomically activate subscription and update user profile';
COMMENT ON FUNCTION cancel_subscription(UUID, BOOLEAN, TEXT) IS 'Cancel subscription with optional immediate effect';
COMMENT ON FUNCTION process_webhook_idempotent(TEXT, TEXT, TEXT, JSONB) IS 'Process webhook with idempotency protection';
