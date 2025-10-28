-- =====================================================
-- MOVE PAYMENT TABLES TO PAYMENTS SCHEMA
-- Migration 052: Move all payment-related tables to separate schema
-- =====================================================

-- Create payments schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS payments;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA payments TO authenticated;
GRANT USAGE ON SCHEMA payments TO service_role;
GRANT ALL ON SCHEMA payments TO service_role;

-- =====================================================
-- 1. MOVE SUBSCRIPTION_TIERS TABLE
-- =====================================================

-- Create table in payments schema
CREATE TABLE IF NOT EXISTS payments.subscription_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RON',
    interval TEXT NOT NULL CHECK (interval IN ('MONTHLY', 'YEARLY', 'LIFETIME')),
    features JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_popular BOOLEAN DEFAULT false,
    trial_days INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Copy data from public schema with proper casting
INSERT INTO payments.subscription_tiers 
SELECT 
    id,
    name,
    display_name,
    description,
    price::DECIMAL(10,2),  -- Cast TEXT to DECIMAL
    currency,
    interval,
    features,
    COALESCE(is_active::BOOLEAN, true),  -- Cast to BOOLEAN with default
    COALESCE(is_popular::BOOLEAN, false),  -- Cast to BOOLEAN with default
    COALESCE(trial_days::INTEGER, 0),  -- Cast to INTEGER with default
    created_at,
    updated_at
FROM public.subscription_tiers
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- 2. MOVE SUBSCRIPTIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS payments.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tier_id UUID NOT NULL REFERENCES payments.subscription_tiers(id),
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

-- Copy data from public schema with proper casting
INSERT INTO payments.subscriptions 
SELECT 
    id,
    user_id,
    tier_id,
    status,
    netopia_order_id,
    netopia_token,
    current_period_start,
    current_period_end,
    COALESCE(cancel_at_period_end::BOOLEAN, false),  -- Cast to BOOLEAN with default
    canceled_at,
    cancel_requested_at,
    cancel_effective_at,
    COALESCE(auto_renew::BOOLEAN, true),  -- Cast to BOOLEAN with default
    trial_start,
    trial_end,
    COALESCE(metadata, '{}'::JSONB),  -- Ensure JSONB with default
    created_at,
    updated_at
FROM public.subscriptions
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 3. MOVE PAYMENT_METHODS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS payments.payment_methods (
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

-- Copy data from public schema with proper casting
INSERT INTO payments.payment_methods 
SELECT 
    id,
    user_id,
    netopia_token,
    last4,
    brand,
    exp_month::INTEGER,  -- Cast to INTEGER
    exp_year::INTEGER,   -- Cast to INTEGER
    COALESCE(is_default::BOOLEAN, false),  -- Cast to BOOLEAN with default
    created_at,
    updated_at
FROM public.payment_methods
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 4. MOVE ORDERS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS payments.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES payments.subscriptions(id),
    netopia_order_id TEXT UNIQUE,
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RON',
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 
        'CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED'
    )),
    checkout_url TEXT,
    payment_method_id UUID REFERENCES payments.payment_methods(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Copy data from public schema with proper casting
INSERT INTO payments.orders 
SELECT 
    id,
    user_id,
    subscription_id,
    netopia_order_id,
    amount::DECIMAL(10,2),  -- Cast to DECIMAL if needed
    currency,
    status,
    checkout_url,
    payment_method_id,
    COALESCE(metadata, '{}'::JSONB),  -- Ensure JSONB with default
    created_at,
    updated_at
FROM public.orders
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 5. MOVE REFUNDS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS payments.refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES payments.orders(id),
    netopia_refund_id TEXT,
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

-- Copy data from public schema with proper casting
INSERT INTO payments.refunds 
SELECT 
    id,
    order_id,
    netopia_refund_id,
    amount::DECIMAL(10,2),  -- Cast to DECIMAL if needed
    currency,
    reason,
    status,
    COALESCE(metadata, '{}'::JSONB),  -- Ensure JSONB with default
    created_at,
    updated_at
FROM public.refunds
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 6. MOVE PAYMENT_LOGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS payments.payment_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES payments.orders(id),
    subscription_id UUID REFERENCES payments.subscriptions(id),
    event_type TEXT NOT NULL CHECK (event_type IN (
        'ORDER_CREATED', 'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED',
        'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_UPDATED', 'SUBSCRIPTION_CANCELED',
        'REFUND_CREATED', 'REFUND_SUCCEEDED', 'REFUND_FAILED',
        'WEBHOOK_RECEIVED', 'WEBHOOK_PROCESSED', 'WEBHOOK_FAILED'
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
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Copy data from public schema with proper casting
INSERT INTO payments.payment_logs 
SELECT 
    id,
    order_id,
    subscription_id,
    event_type,
    netopia_order_id,
    amount::DECIMAL(10,2),  -- Cast to DECIMAL if needed
    currency,
    status,
    COALESCE(raw_payload, '{}'::JSONB),  -- Ensure JSONB with default
    ipn_received_at,
    ipn_status,
    webhook_id,
    COALESCE(retry_count::INTEGER, 0),  -- Cast to INTEGER with default
    NULL as error_message,  -- Field doesn't exist in source table
    0 as processing_time_ms,  -- Field doesn't exist in source table
    created_at
FROM public.payment_logs
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 7. MOVE WEBHOOK_PROCESSING TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS payments.webhook_processing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    netopia_order_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    signature_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PROCESSING' CHECK (status IN (
        'PROCESSING', 'SUCCEEDED', 'FAILED'
    )),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(netopia_order_id, event_type, signature_hash)
);

-- Copy data from public schema with proper casting
INSERT INTO payments.webhook_processing 
SELECT 
    id,
    netopia_order_id,
    event_type,
    signature_hash,
    status,
    error_message,
    created_at,
    COALESCE(processed_at, NOW()) as updated_at  -- Use processed_at or NOW() as updated_at
FROM public.webhook_processing
ON CONFLICT (netopia_order_id, event_type, signature_hash) DO NOTHING;

-- =====================================================
-- 8. CREATE INDEXES IN PAYMENTS SCHEMA
-- =====================================================

-- Indexes for subscription_tiers
CREATE INDEX IF NOT EXISTS idx_payments_subscription_tiers_name ON payments.subscription_tiers(name);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_tiers_active ON payments.subscription_tiers(is_active);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_tiers_interval ON payments.subscription_tiers(interval);

-- Indexes for subscriptions
CREATE INDEX IF NOT EXISTS idx_payments_subscriptions_user_id ON payments.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscriptions_tier_id ON payments.subscriptions(tier_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscriptions_status ON payments.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_payments_subscriptions_netopia_order_id ON payments.subscriptions(netopia_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscriptions_current_period_end ON payments.subscriptions(current_period_end);
CREATE INDEX IF NOT EXISTS idx_payments_subscriptions_trial_end ON payments.subscriptions(trial_end) WHERE trial_end IS NOT NULL;

-- Indexes for payment_methods
CREATE INDEX IF NOT EXISTS idx_payments_payment_methods_user_id ON payments.payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_methods_netopia_token ON payments.payment_methods(netopia_token);
CREATE INDEX IF NOT EXISTS idx_payments_payment_methods_is_default ON payments.payment_methods(is_default);

-- Indexes for orders
CREATE INDEX IF NOT EXISTS idx_payments_orders_user_id ON payments.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_orders_subscription_id ON payments.orders(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_orders_netopia_order_id ON payments.orders(netopia_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_orders_status ON payments.orders(status);
CREATE INDEX IF NOT EXISTS idx_payments_orders_created_at ON payments.orders(created_at);

-- Indexes for refunds
CREATE INDEX IF NOT EXISTS idx_payments_refunds_order_id ON payments.refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_refunds_netopia_refund_id ON payments.refunds(netopia_refund_id);
CREATE INDEX IF NOT EXISTS idx_payments_refunds_status ON payments.refunds(status);

-- Indexes for payment_logs
CREATE INDEX IF NOT EXISTS idx_payments_payment_logs_order_id ON payments.payment_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_logs_subscription_id ON payments.payment_logs(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_logs_event_type ON payments.payment_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_payments_payment_logs_netopia_order_id ON payments.payment_logs(netopia_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_logs_created_at ON payments.payment_logs(created_at);

-- Indexes for webhook_processing
CREATE INDEX IF NOT EXISTS idx_payments_webhook_processing_netopia_order_id ON payments.webhook_processing(netopia_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_webhook_processing_event_type ON payments.webhook_processing(event_type);
CREATE INDEX IF NOT EXISTS idx_payments_webhook_processing_status ON payments.webhook_processing(status);

-- =====================================================
-- 9. MOVE FUNCTIONS TO PAYMENTS SCHEMA
-- =====================================================

-- Move activate_subscription function
CREATE OR REPLACE FUNCTION payments.activate_subscription(
    subscription_id UUID,
    netopia_order_id TEXT,
    netopia_token TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    subscription_record RECORD;
    tier_record RECORD;
BEGIN
    -- Get subscription and tier details
    SELECT s.*, st.name as tier_name, st.display_name
    INTO subscription_record
    FROM payments.subscriptions s
    JOIN payments.subscription_tiers st ON s.tier_id = st.id
    WHERE s.id = subscription_id;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Update subscription status
    UPDATE payments.subscriptions
    SET 
        status = 'ACTIVE',
        netopia_order_id = activate_subscription.netopia_order_id,
        netopia_token = COALESCE(activate_subscription.netopia_token, netopia_token),
        updated_at = NOW()
    WHERE id = subscription_id;
    
    -- Update user profile subscription tier
    UPDATE public.profiles
    SET 
        subscription_tier = LOWER(subscription_record.tier_name),
        updated_at = NOW()
    WHERE id = subscription_record.user_id;
    
    RETURN TRUE;
END;
$$;

-- Move cancel_subscription function
CREATE OR REPLACE FUNCTION payments.cancel_subscription(
    subscription_id UUID,
    immediate BOOLEAN DEFAULT FALSE,
    reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    subscription_record RECORD;
BEGIN
    -- Get subscription details
    SELECT * INTO subscription_record
    FROM payments.subscriptions
    WHERE id = subscription_id;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Update subscription
    UPDATE payments.subscriptions
    SET 
        status = CASE WHEN immediate THEN 'CANCELED' ELSE status END,
        cancel_at_period_end = TRUE,
        canceled_at = CASE WHEN immediate THEN NOW() ELSE canceled_at END,
        updated_at = NOW()
    WHERE id = subscription_id;
    
    -- If immediate cancellation, downgrade user profile
    IF immediate THEN
        UPDATE public.profiles
        SET 
            subscription_tier = 'free',
            updated_at = NOW()
        WHERE id = subscription_record.user_id;
    END IF;
    
    RETURN TRUE;
END;
$$;

-- Move process_webhook_idempotent function
CREATE OR REPLACE FUNCTION payments.process_webhook_idempotent(
    netopia_order_id TEXT,
    event_type TEXT,
    signature_hash TEXT,
    payload JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    existing_record RECORD;
BEGIN
    -- Check for existing processing record
    SELECT * INTO existing_record
    FROM payments.webhook_processing
    WHERE netopia_order_id = process_webhook_idempotent.netopia_order_id
    AND event_type = process_webhook_idempotent.event_type
    AND signature_hash = process_webhook_idempotent.signature_hash;
    
    IF FOUND THEN
        RETURN FALSE; -- Already processed
    END IF;
    
    -- Insert new processing record
    INSERT INTO payments.webhook_processing (
        netopia_order_id,
        event_type,
        signature_hash,
        status
    ) VALUES (
        process_webhook_idempotent.netopia_order_id,
        process_webhook_idempotent.event_type,
        process_webhook_idempotent.signature_hash,
        'PROCESSING'
    );
    
    RETURN TRUE;
END;
$$;

-- =====================================================
-- 10. UPDATE PROFILES TABLE REFERENCES
-- =====================================================

-- Add foreign key constraint to payments schema
ALTER TABLE public.profiles 
ADD CONSTRAINT fk_profiles_trial_tier_id 
FOREIGN KEY (trial_tier_id) REFERENCES payments.subscription_tiers(id);

-- =====================================================
-- 11. CREATE VIEWS FOR BACKWARD COMPATIBILITY
-- =====================================================

-- Create views in public schema that reference payments schema
CREATE OR REPLACE VIEW public.subscription_tiers AS
SELECT * FROM payments.subscription_tiers;

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

-- =====================================================
-- 12. SET UP ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on all payment tables
ALTER TABLE payments.subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments.payment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments.webhook_processing ENABLE ROW LEVEL SECURITY;

-- Policies for subscription_tiers (read-only for authenticated users)
CREATE POLICY "Anyone can view subscription tiers" ON payments.subscription_tiers
    FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "Service role can manage subscription tiers" ON payments.subscription_tiers
    FOR ALL TO service_role USING (true);

-- Policies for subscriptions (users can only see their own)
CREATE POLICY "Users can view own subscriptions" ON payments.subscriptions
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage subscriptions" ON payments.subscriptions
    FOR ALL TO service_role USING (true);

-- Policies for payment_methods (users can only see their own)
CREATE POLICY "Users can view own payment methods" ON payments.payment_methods
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage payment methods" ON payments.payment_methods
    FOR ALL TO service_role USING (true);

-- Policies for orders (users can only see their own)
CREATE POLICY "Users can view own orders" ON payments.orders
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage orders" ON payments.orders
    FOR ALL TO service_role USING (true);

-- Policies for refunds (users can only see their own)
CREATE POLICY "Users can view own refunds" ON payments.refunds
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM payments.orders o 
            WHERE o.id = refunds.order_id 
            AND o.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage refunds" ON payments.refunds
    FOR ALL TO service_role USING (true);

-- Policies for payment_logs (service role only)
CREATE POLICY "Service role can manage payment logs" ON payments.payment_logs
    FOR ALL TO service_role USING (true);

-- Policies for webhook_processing (service role only)
CREATE POLICY "Service role can manage webhook processing" ON payments.webhook_processing
    FOR ALL TO service_role USING (true);

-- =====================================================
-- 13. GRANT PERMISSIONS
-- =====================================================

-- Grant permissions on tables
GRANT SELECT ON payments.subscription_tiers TO authenticated;
GRANT ALL ON payments.subscription_tiers TO service_role;

GRANT SELECT ON payments.subscriptions TO authenticated;
GRANT ALL ON payments.subscriptions TO service_role;

GRANT SELECT ON payments.payment_methods TO authenticated;
GRANT ALL ON payments.payment_methods TO service_role;

GRANT SELECT ON payments.orders TO authenticated;
GRANT ALL ON payments.orders TO service_role;

GRANT SELECT ON payments.refunds TO authenticated;
GRANT ALL ON payments.refunds TO service_role;

GRANT ALL ON payments.payment_logs TO service_role;
GRANT ALL ON payments.webhook_processing TO service_role;

-- Grant permissions on functions
GRANT EXECUTE ON FUNCTION payments.activate_subscription(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION payments.cancel_subscription(UUID, BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION payments.process_webhook_idempotent(TEXT, TEXT, TEXT, JSONB) TO service_role;

-- =====================================================
-- 14. COMMENTS AND DOCUMENTATION
-- =====================================================

COMMENT ON SCHEMA payments IS 'Schema for all payment-related tables and functions';
COMMENT ON TABLE payments.subscription_tiers IS 'Available subscription tiers with pricing and features';
COMMENT ON TABLE payments.subscriptions IS 'User subscriptions to different tiers';
COMMENT ON TABLE payments.payment_methods IS 'Tokenized payment methods for users';
COMMENT ON TABLE payments.orders IS 'Payment orders for subscriptions and one-time payments';
COMMENT ON TABLE payments.refunds IS 'Refunds processed for orders';
COMMENT ON TABLE payments.payment_logs IS 'Audit log for all payment-related events';
COMMENT ON TABLE payments.webhook_processing IS 'Idempotency tracking for webhook processing';

-- =====================================================
-- 15. CLEANUP OLD TABLES, FUNCTIONS AND INDEXES
-- =====================================================

-- Drop old functions first (they might reference the tables)
DROP FUNCTION IF EXISTS public.activate_subscription(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.cancel_subscription(UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.process_webhook_idempotent(TEXT, TEXT, TEXT, JSONB);

-- Drop old indexes
DROP INDEX IF EXISTS public.idx_subscription_tiers_name;
DROP INDEX IF EXISTS public.idx_subscription_tiers_active;
DROP INDEX IF EXISTS public.idx_subscription_tiers_interval;

DROP INDEX IF EXISTS public.idx_subscriptions_user_id;
DROP INDEX IF EXISTS public.idx_subscriptions_tier_id;
DROP INDEX IF EXISTS public.idx_subscriptions_status;
DROP INDEX IF EXISTS public.idx_subscriptions_netopia_order_id;
DROP INDEX IF EXISTS public.idx_subscriptions_current_period_end;
DROP INDEX IF EXISTS public.idx_subscriptions_trial_end;

DROP INDEX IF EXISTS public.idx_payment_methods_user_id;
DROP INDEX IF EXISTS public.idx_payment_methods_netopia_token;
DROP INDEX IF EXISTS public.idx_payment_methods_is_default;

DROP INDEX IF EXISTS public.idx_orders_user_id;
DROP INDEX IF EXISTS public.idx_orders_subscription_id;
DROP INDEX IF EXISTS public.idx_orders_netopia_order_id;
DROP INDEX IF EXISTS public.idx_orders_status;
DROP INDEX IF EXISTS public.idx_orders_created_at;

DROP INDEX IF EXISTS public.idx_refunds_order_id;
DROP INDEX IF EXISTS public.idx_refunds_netopia_refund_id;
DROP INDEX IF EXISTS public.idx_refunds_status;

DROP INDEX IF EXISTS public.idx_payment_logs_order_id;
DROP INDEX IF EXISTS public.idx_payment_logs_subscription_id;
DROP INDEX IF EXISTS public.idx_payment_logs_event_type;
DROP INDEX IF EXISTS public.idx_payment_logs_netopia_order_id;
DROP INDEX IF EXISTS public.idx_payment_logs_created_at;

DROP INDEX IF EXISTS public.idx_webhook_processing_netopia_order_id;
DROP INDEX IF EXISTS public.idx_webhook_processing_event_type;
DROP INDEX IF EXISTS public.idx_webhook_processing_status;

-- Drop old tables (CASCADE will handle foreign key constraints)
DROP TABLE IF EXISTS public.subscription_tiers CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.payment_methods CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.refunds CASCADE;
DROP TABLE IF EXISTS public.payment_logs CASCADE;
DROP TABLE IF EXISTS public.webhook_processing CASCADE;

-- =====================================================
-- 16. VERIFICATION QUERIES
-- =====================================================

-- Verify data migration
DO $$
DECLARE
    old_count INTEGER;
    new_count INTEGER;
BEGIN
    -- Check subscription_tiers
    SELECT COUNT(*) INTO old_count FROM payments.subscription_tiers;
    RAISE NOTICE 'Subscription tiers migrated: %', old_count;
    
    -- Check subscriptions
    SELECT COUNT(*) INTO new_count FROM payments.subscriptions;
    RAISE NOTICE 'Subscriptions migrated: %', new_count;
    
    -- Check orders
    SELECT COUNT(*) INTO new_count FROM payments.orders;
    RAISE NOTICE 'Orders migrated: %', new_count;
    
    -- Check payment_logs
    SELECT COUNT(*) INTO new_count FROM payments.payment_logs;
    RAISE NOTICE 'Payment logs migrated: %', new_count;
    
    RAISE NOTICE 'Migration completed successfully!';
END $$;
