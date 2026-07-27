-- =====================================================
-- 083: pg_cron + pg_net schedules for alert digest slots
-- =====================================================
--
-- BEFORE ENABLING SCHEDULES:
--   1. Set Supabase Vault secret: ALERTS_CRON_SECRET (same value as Vercel)
--   2. Set the API base URL below (replace placeholder)
--   3. Adjust UTC cron expressions for Europe/Bucharest DST (EEST UTC+3 / EET UTC+2)
--
-- Digest slots (RO, L–V): 07:55, 09:55, 11:55, 13:55, 15:55, 17:55, 19:55, 21:55
-- Example UTC mapping (EEST / UTC+3): 07:55 RO = 04:55 UTC → minute 55, hours 4,6,8,10,12,14,16,18

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Helper: POST to Vercel digest handler only if vault secret exists
CREATE OR REPLACE FUNCTION public.post_alerts_digest_slot(p_slot TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secret TEXT;
  v_url TEXT;
  v_body JSONB;
  v_request_id BIGINT;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'ALERTS_CRON_SECRET'
  LIMIT 1;

  IF v_secret IS NULL OR length(trim(v_secret)) = 0 THEN
    RAISE NOTICE 'post_alerts_digest_slot skipped: ALERTS_CRON_SECRET not in vault';
    RETURN NULL;
  END IF;

  -- TODO: replace with production API URL before scheduling
  v_url := coalesce(
    current_setting('app.settings.alerts_api_base_url', true),
    'https://decodoruloficial.ro/api/src/api/cron/alerts-digest-slot'
  );

  v_body := jsonb_build_object(
    'slot', p_slot,
    'day', to_char((now() AT TIME ZONE 'Europe/Bucharest')::date, 'YYYY-MM-DD')
  );

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := v_body
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION public.post_alerts_digest_slot(TEXT) IS
  'Posts digest slot job to Vercel handler via pg_net. Requires vault secret ALERTS_CRON_SECRET and app.settings.alerts_api_base_url.';

GRANT EXECUTE ON FUNCTION public.post_alerts_digest_slot(TEXT) TO service_role;

-- =====================================================
-- SCHEDULE EXAMPLES (commented — enable manually after vault + URL are set)
-- =====================================================
--
-- EEST (UTC+3) — summer: RO :55 → UTC :55 at hour-3
--
-- SELECT cron.schedule(
--   'alerts-digest-0755-eest',
--   '55 4 * * 1-5',
--   $$SELECT public.post_alerts_digest_slot('07:55');$$
-- );
-- SELECT cron.schedule(
--   'alerts-digest-0955-eest',
--   '55 6 * * 1-5',
--   $$SELECT public.post_alerts_digest_slot('09:55');$$
-- );
-- SELECT cron.schedule(
--   'alerts-digest-1155-eest',
--   '55 8 * * 1-5',
--   $$SELECT public.post_alerts_digest_slot('11:55');$$
-- );
-- SELECT cron.schedule(
--   'alerts-digest-1355-eest',
--   '55 10 * * 1-5',
--   $$SELECT public.post_alerts_digest_slot('13:55');$$
-- );
-- SELECT cron.schedule(
--   'alerts-digest-1555-eest',
--   '55 12 * * 1-5',
--   $$SELECT public.post_alerts_digest_slot('15:55');$$
-- );
-- SELECT cron.schedule(
--   'alerts-digest-1755-eest',
--   '55 14 * * 1-5',
--   $$SELECT public.post_alerts_digest_slot('17:55');$$
-- );
-- SELECT cron.schedule(
--   'alerts-digest-1955-eest',
--   '55 16 * * 1-5',
--   $$SELECT public.post_alerts_digest_slot('19:55');$$
-- );
-- SELECT cron.schedule(
--   'alerts-digest-2155-eest',
--   '55 18 * * 1-5',
--   $$SELECT public.post_alerts_digest_slot('21:55');$$
-- );
--
-- EET (UTC+2) — winter: subtract 1h from UTC hour column above
--
-- To set API URL without redeploying SQL:
--   SELECT set_config('app.settings.alerts_api_base_url', 'https://api.example.com/api/src/api/cron/alerts-digest-slot', false);
--
-- Verify vault:
--   SELECT name FROM vault.secrets WHERE name = 'ALERTS_CRON_SECRET';
--
-- List jobs:
--   SELECT * FROM cron.job WHERE jobname LIKE 'alerts-digest-%';
