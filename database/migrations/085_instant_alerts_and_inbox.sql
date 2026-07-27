-- =====================================================
-- 085: Instant watch alerts + in-app inbox
-- =====================================================

CREATE TABLE IF NOT EXISTS payments.instant_alert_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  watch_id UUID NOT NULL REFERENCES public.legislation_watches(id) ON DELETE CASCADE,
  stiri_id BIGINT NOT NULL REFERENCES public.stiri(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  connection_id BIGINT REFERENCES public.legislative_connections(id) ON DELETE SET NULL,
  resend_id TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, watch_id, stiri_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_instant_alert_logs_user_sent
  ON payments.instant_alert_logs(user_id, sent_at DESC);

COMMENT ON TABLE payments.instant_alert_logs IS 'Dedup + audit for instant legislative watch emails';

GRANT SELECT, INSERT ON payments.instant_alert_logs TO service_role;

-- In-app notifications inbox
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  href TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
  ON public.user_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
  ON public.user_notifications(user_id)
  WHERE read_at IS NULL;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_notifications_select_own ON public.user_notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY user_notifications_update_own ON public.user_notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, UPDATE ON public.user_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_notifications TO service_role;

-- Targets for a new legislative connection (instant-enabled watches, paid, master on)
CREATE OR REPLACE FUNCTION public.get_instant_alert_targets(p_connection_id BIGINT)
RETURNS TABLE(
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  watch_id UUID,
  watch_label TEXT,
  stiri_id BIGINT,
  stiri_title TEXT,
  stiri_slug TEXT,
  relationship_type TEXT,
  confidence_score DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conn public.legislative_connections%ROWTYPE;
BEGIN
  SELECT * INTO v_conn
  FROM public.legislative_connections lc
  WHERE lc.id = p_connection_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_conn.relationship_type NOT IN ('modifică', 'abrogă') THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH paid AS (
    SELECT s.user_id FROM payments.subscriptions s WHERE s.status = 'ACTIVE'
  ),
  src AS (
    SELECT s.id, s.title
    FROM public.stiri s
    WHERE s.id = v_conn.source_document_id
  ),
  hits AS (
    SELECT
      w.user_id,
      w.id AS watch_id,
      w.label AS watch_label,
      src.id AS stiri_id,
      src.title AS stiri_title,
      (public.slugify(src.title) || '-' || src.id::text) AS stiri_slug,
      v_conn.relationship_type,
      v_conn.confidence_score::DOUBLE PRECISION AS confidence_score
    FROM public.legislation_watches w
    JOIN paid p ON p.user_id = w.user_id
    JOIN public.user_preferences up ON up.id = w.user_id
    CROSS JOIN src
    WHERE w.instant_enabled = TRUE
      AND coalesce((up.notification_settings->>'instant_master_enabled')::boolean, false) = TRUE
      AND v_conn.relationship_type = ANY (w.relation_filters)
      AND coalesce(v_conn.confidence_score, 0) >= w.min_confidence
      AND (
        (w.target_type = 'stiri' AND w.target_stiri_id = v_conn.target_document_id)
        OR (
          w.target_type IN ('external', 'normalized_ref')
          AND public.legislation_normalized_key(v_conn.metadata->'normalized_identifier') = w.normalized_key
        )
      )
  )
  SELECT
    h.user_id,
    u.email::TEXT,
    coalesce(pr.display_name, u.email)::TEXT,
    h.watch_id,
    h.watch_label,
    h.stiri_id,
    h.stiri_title,
    h.stiri_slug,
    h.relationship_type,
    h.confidence_score
  FROM hits h
  JOIN auth.users u ON u.id = h.user_id
  LEFT JOIN public.profiles pr ON pr.id = h.user_id
  WHERE u.email_confirmed_at IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_instant_alert_targets(BIGINT) TO service_role;

-- pg_net webhook → Vercel instant-watch-alerts handler
CREATE OR REPLACE FUNCTION public.post_instant_watch_alert(p_connection_id BIGINT)
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
  WHERE name = 'INSTANT_ALERT_WEBHOOK_SECRET'
  LIMIT 1;

  IF v_secret IS NULL OR length(trim(v_secret)) = 0 THEN
    RAISE NOTICE 'post_instant_watch_alert skipped: INSTANT_ALERT_WEBHOOK_SECRET not in vault';
    RETURN NULL;
  END IF;

  -- Vercel @vercel/node: path must include .js (without → 404). API host ≠ web frontend.
  v_url := coalesce(
    nullif(current_setting('app.settings.instant_alerts_api_url', true), ''),
    'https://decodorul-oficial-api.vercel.app/api/src/api/cron/instant-watch-alerts.js'
  );

  v_body := jsonb_build_object('connection_id', p_connection_id);

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

COMMENT ON FUNCTION public.post_instant_watch_alert(BIGINT) IS
  'Posts instant alert job when a critical legislative connection is inserted. Requires vault INSTANT_ALERT_WEBHOOK_SECRET.';

GRANT EXECUTE ON FUNCTION public.post_instant_watch_alert(BIGINT) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_legislative_connection_instant_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.relationship_type IN ('modifică', 'abrogă') THEN
    PERFORM public.post_instant_watch_alert(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS legislative_connections_instant_alert ON public.legislative_connections;

CREATE TRIGGER legislative_connections_instant_alert
  AFTER INSERT ON public.legislative_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_legislative_connection_instant_alert();

-- =====================================================
-- SCHEDULE / TRIGGER NOTES (enable after vault secret)
-- =====================================================
-- Vault: INSTANT_ALERT_WEBHOOK_SECRET (same value as Vercel env)
-- URL default is hardcoded to https://decodorul-oficial-api.vercel.app/api/src/api/cron/instant-watch-alerts.js
-- Verify: SELECT name FROM vault.secrets WHERE name = 'INSTANT_ALERT_WEBHOOK_SECRET';
