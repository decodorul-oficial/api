-- =====================================================
-- 087: Oblio fiscal invoices + Stripe lifecycle fields
-- =====================================================

ALTER TABLE payments.orders
  ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS oblio_series TEXT,
  ADD COLUMN IF NOT EXISTS oblio_number TEXT,
  ADD COLUMN IF NOT EXISTS oblio_link TEXT,
  ADD COLUMN IF NOT EXISTS oblio_status TEXT;

COMMENT ON COLUMN payments.orders.stripe_invoice_id IS 'Stripe Invoice ID (in_…) asociat plății';
COMMENT ON COLUMN payments.orders.oblio_series IS 'Seria facturii Oblio';
COMMENT ON COLUMN payments.orders.oblio_number IS 'Numărul facturii Oblio';
COMMENT ON COLUMN payments.orders.oblio_link IS 'Link vizualizare/descărcare factură Oblio';
COMMENT ON COLUMN payments.orders.oblio_status IS 'pending|issued|failed|skipped';

CREATE INDEX IF NOT EXISTS idx_payments_orders_stripe_invoice_id
  ON payments.orders (stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_orders_oblio_status
  ON payments.orders (oblio_status)
  WHERE oblio_status IS NOT NULL;

-- Queue for async Oblio emit / retry (free-tier sweeper)
CREATE TABLE IF NOT EXISTS payments.oblio_invoice_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES payments.orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'skipped')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_oblio_invoice_queue_pending
  ON payments.oblio_invoice_queue (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

COMMENT ON TABLE payments.oblio_invoice_queue IS
  'Coadă emitere facturi Oblio; procesată din webhook + sweeper recurring-billing / pg_cron';

-- Public views must expose new columns (SELECT *)
DROP VIEW IF EXISTS public.orders CASCADE;
CREATE OR REPLACE VIEW public.orders AS
SELECT * FROM payments.orders;

CREATE OR REPLACE VIEW public.oblio_invoice_queue AS
SELECT * FROM payments.oblio_invoice_queue;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oblio_invoice_queue TO authenticated, service_role;
GRANT SELECT ON public.orders TO authenticated, anon, service_role;
GRANT INSERT, UPDATE ON public.orders TO authenticated, service_role;

-- Optional pg_cron → Vercel payments maintenance (commented; enable after vault secret)
-- SELECT cron.schedule(
--   'payments-maintenance-daily',
--   '15 3 * * *',
--   $$SELECT public.post_payments_maintenance();$$
-- );

CREATE OR REPLACE FUNCTION public.post_payments_maintenance()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secret TEXT;
  v_url TEXT;
  v_request_id BIGINT;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'ALERTS_CRON_SECRET'
  LIMIT 1;

  IF v_secret IS NULL OR length(trim(v_secret)) = 0 THEN
    RAISE NOTICE 'post_payments_maintenance skipped: ALERTS_CRON_SECRET not in vault';
    RETURN NULL;
  END IF;

  v_url := coalesce(
    nullif(current_setting('app.settings.alerts_api_base_url', true), ''),
    'https://decodorul-oficial-api.vercel.app/api/src/api/cron/recurring-billing.js'
  );

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := jsonb_build_object('source', 'pg_cron', 'job', 'payments_maintenance'),
    timeout_milliseconds := 55000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION public.post_payments_maintenance() IS
  'Optional: POST payments sweeper to Vercel. Uses ALERTS_CRON_SECRET vault secret.';

GRANT EXECUTE ON FUNCTION public.post_payments_maintenance() TO service_role;
