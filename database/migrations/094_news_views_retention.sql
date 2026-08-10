-- Retention for public.news_views:
-- 1) Anonymize IP addresses older than 90 days
-- 2) Delete rows older than 14 months
-- Scheduled daily via pg_cron (already installed).

CREATE OR REPLACE FUNCTION public.cleanup_news_views_retention()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Anonymize IPs after 90 days (keep aggregate analytics without identifiable address)
  UPDATE public.news_views
  SET
    ip_address = '0.0.0.0'::inet,
    user_agent = NULL
  WHERE viewed_at < NOW() - INTERVAL '90 days'
    AND ip_address IS DISTINCT FROM '0.0.0.0'::inet;

  -- Hard-delete very old rows (beyond analytics retention)
  DELETE FROM public.news_views
  WHERE viewed_at < NOW() - INTERVAL '14 months';
END;
$$;

COMMENT ON FUNCTION public.cleanup_news_views_retention() IS
  'Anonymizes news_views IP/UA after 90 days and deletes rows older than 14 months.';

-- Schedule daily at 03:15 UTC (idempotent: unschedule if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-news-views-retention') THEN
    PERFORM cron.unschedule('cleanup-news-views-retention');
  END IF;

  PERFORM cron.schedule(
    'cleanup-news-views-retention',
    '15 3 * * *',
    $$SELECT public.cleanup_news_views_retention();$$
  );
END $$;
