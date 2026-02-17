ALTER TABLE payments.orders ADD COLUMN billing_details JSONB;
COMMENT ON COLUMN payments.orders.billing_details IS 'Snapshot of billing details at the time of order creation';

