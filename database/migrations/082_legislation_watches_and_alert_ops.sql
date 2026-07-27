-- =====================================================
-- 082: Legislation watches + alert digest ops + marketing features
-- =====================================================

-- 1) Tier limits
ALTER TABLE payments.subscription_tiers
  ADD COLUMN IF NOT EXISTS max_legislation_watches INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_watch_email_notifications INTEGER NOT NULL DEFAULT 0;

UPDATE payments.subscription_tiers SET
  max_legislation_watches = 3,
  max_watch_email_notifications = 0,
  max_email_notifications = 0
WHERE name = 'free';

UPDATE payments.subscription_tiers SET
  max_legislation_watches = 500,
  max_watch_email_notifications = 500,
  max_email_notifications = 200
WHERE name LIKE 'pro%';

UPDATE payments.subscription_tiers SET
  max_legislation_watches = 5000,
  max_watch_email_notifications = 5000,
  max_email_notifications = 1000
WHERE name LIKE 'enterprise%';

-- Marketing copy (honest Faza 1)
UPDATE payments.subscription_tiers
SET features = '["Acces limitat la știri","Căutare de bază","5 cereri/zi","Fără alerte email pe legi"]'::jsonb,
    updated_at = now()
WHERE name = 'free';

UPDATE payments.subscription_tiers
SET features = '[
  "Urmărești legi și ordine — te anunțăm când se schimbă",
  "Alerte email de câteva ori pe zi (L–V), doar cu noutăți",
  "Gestionezi totul în Favorite & Alerte",
  "Căutări salvate cu notificări",
  "Favorite, export și context legislativ",
  "Asistență prioritară"
]'::jsonb,
    description = 'Monitorizare legislativă și alerte pentru profesioniști',
    updated_at = now()
WHERE name = 'pro-monthly';

UPDATE payments.subscription_tiers
SET features = '[
  "Urmărești legi și ordine — te anunțăm când se schimbă",
  "Alerte email de câteva ori pe zi (L–V), doar cu noutăți",
  "Gestionezi totul în Favorite & Alerte",
  "Căutări salvate cu notificări",
  "Favorite, export și context legislativ",
  "Asistență prioritară"
]'::jsonb,
    description = 'Monitorizare legislativă și alerte pentru profesioniști (2 luni gratuite)',
    updated_at = now()
WHERE name = 'pro-yearly';

UPDATE payments.subscription_tiers
SET features = '[
  "Tot ce include Pro, la scară de echipă",
  "Limite extinse pentru urmăriri și alerte email",
  "Integrări și API personalizat",
  "Suport dedicat",
  "Analiză avansată",
  "Export & arhivare"
]'::jsonb,
    description = 'Monitorizare legislativă pentru organizații',
    updated_at = now()
WHERE name = 'enterprise-monthly';

UPDATE payments.subscription_tiers
SET features = '[
  "Tot ce include Pro, la scară de echipă",
  "Limite extinse pentru urmăriri și alerte email",
  "Integrări și API personalizat",
  "Suport dedicat",
  "Analiză avansată",
  "Export & arhivare",
  "2 luni gratuite"
]'::jsonb,
    description = 'Monitorizare legislativă pentru organizații (2 luni gratuite)',
    updated_at = now()
WHERE name = 'enterprise-yearly';

-- 2) Helper: normalized key from identifier JSON
CREATE OR REPLACE FUNCTION public.legislation_normalized_key(p_id JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_id IS NULL THEN NULL
    WHEN coalesce(p_id->>'type','') <> '' AND coalesce(p_id->>'number','') <> '' AND coalesce(p_id->>'year','') <> ''
      THEN lower(p_id->>'type') || '-' || (p_id->>'number') || '-' || (p_id->>'year')
    WHEN coalesce(p_id->>'type','') = 'cod' AND coalesce(p_id->>'number','') <> ''
      THEN 'cod-' || regexp_replace(lower(p_id->>'number'), '\s+', '-', 'g')
    WHEN coalesce(p_id->>'normalized_text','') <> ''
      THEN 'text-' || left(regexp_replace(lower(p_id->>'normalized_text'), '[^a-z0-9]+', '-', 'g'), 80)
    ELSE NULL
  END;
$$;

-- 3) legislation_watches
CREATE TABLE IF NOT EXISTS public.legislation_watches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('stiri', 'external', 'normalized_ref')),
  target_stiri_id BIGINT REFERENCES public.stiri(id) ON DELETE SET NULL,
  target_external_id BIGINT REFERENCES public.external_legislative_documents(id) ON DELETE SET NULL,
  normalized_key TEXT NOT NULL,
  normalized_identifier JSONB NOT NULL DEFAULT '{}',
  alert_intensity TEXT NOT NULL DEFAULT 'important'
    CHECK (alert_intensity IN ('important', 'critical', 'mentions')),
  relation_filters TEXT[] NOT NULL DEFAULT ARRAY['modifică','completează','abrogă','derogă','suspendă'],
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  instant_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  min_confidence DOUBLE PRECISION NOT NULL DEFAULT 0.55,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT legislation_watches_target_chk CHECK (
    (target_type = 'stiri' AND target_stiri_id IS NOT NULL) OR
    (target_type = 'external' AND target_external_id IS NOT NULL) OR
    (target_type = 'normalized_ref')
  ),
  UNIQUE (user_id, normalized_key)
);

CREATE INDEX IF NOT EXISTS idx_legislation_watches_user ON public.legislation_watches(user_id);
CREATE INDEX IF NOT EXISTS idx_legislation_watches_key ON public.legislation_watches(normalized_key);
CREATE INDEX IF NOT EXISTS idx_legislation_watches_email ON public.legislation_watches(email_enabled) WHERE email_enabled;
CREATE INDEX IF NOT EXISTS idx_legislation_watches_stiri ON public.legislation_watches(target_stiri_id);
CREATE INDEX IF NOT EXISTS idx_legislation_watches_external ON public.legislation_watches(target_external_id);

CREATE OR REPLACE FUNCTION public.set_legislation_watch_relation_filters()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.relation_filters := CASE NEW.alert_intensity
    WHEN 'critical' THEN ARRAY['modifică','abrogă']
    WHEN 'mentions' THEN ARRAY['modifică','completează','abrogă','derogă','suspendă','face referire la']
    ELSE ARRAY['modifică','completează','abrogă','derogă','suspendă']
  END;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_legislation_watch_filters ON public.legislation_watches;
CREATE TRIGGER trg_legislation_watch_filters
  BEFORE INSERT OR UPDATE OF alert_intensity ON public.legislation_watches
  FOR EACH ROW EXECUTE FUNCTION public.set_legislation_watch_relation_filters();

ALTER TABLE public.legislation_watches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own legislation watches" ON public.legislation_watches;
CREATE POLICY "Users manage own legislation watches" ON public.legislation_watches
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role all legislation watches" ON public.legislation_watches;
CREATE POLICY "Service role all legislation watches" ON public.legislation_watches
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.legislation_watches TO authenticated;
GRANT ALL ON public.legislation_watches TO service_role;

-- 4) Dedup deliveries
CREATE TABLE IF NOT EXISTS payments.email_article_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stiri_id BIGINT NOT NULL REFERENCES public.stiri(id) ON DELETE CASCADE,
  delivery_date DATE NOT NULL,
  first_slot TEXT,
  role TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, stiri_id, delivery_date)
);

CREATE INDEX IF NOT EXISTS idx_email_article_deliveries_user_day
  ON payments.email_article_deliveries(user_id, delivery_date);

ALTER TABLE payments.email_article_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role email_article_deliveries" ON payments.email_article_deliveries;
CREATE POLICY "Service role email_article_deliveries" ON payments.email_article_deliveries
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON payments.email_article_deliveries TO service_role;

-- 5) Slot runs + provider status + admin alerts
CREATE TABLE IF NOT EXISTS payments.email_slot_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot TEXT NOT NULL,
  run_day DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'RUNNING'
    CHECK (status IN ('RUNNING','OK','PARTIAL','FAILED','SKIPPED_OVERLAP')),
  users_considered INT DEFAULT 0,
  users_sent INT DEFAULT 0,
  users_skipped INT DEFAULT 0,
  users_failed INT DEFAULT 0,
  primary_articles_sent INT DEFAULT 0,
  resend_quota_hit BOOLEAN DEFAULT FALSE,
  error_summary TEXT,
  duration_ms INT
);

CREATE INDEX IF NOT EXISTS idx_email_slot_runs_day ON payments.email_slot_runs(run_day DESC);
CREATE INDEX IF NOT EXISTS idx_email_slot_runs_status ON payments.email_slot_runs(status);

ALTER TABLE payments.email_slot_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role email_slot_runs" ON payments.email_slot_runs;
CREATE POLICY "Service role email_slot_runs" ON payments.email_slot_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON payments.email_slot_runs TO service_role;

CREATE TABLE IF NOT EXISTS payments.email_provider_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  emails_sent_today INT DEFAULT 0,
  daily_quota INT DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'OK'
    CHECK (status IN ('OK','NEAR_QUOTA','QUOTA_EXCEEDED','AUTH_ERROR')),
  raw JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE payments.email_provider_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role email_provider_status" ON payments.email_provider_status;
CREATE POLICY "Service role email_provider_status" ON payments.email_provider_status
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON payments.email_provider_status TO service_role;

CREATE TABLE IF NOT EXISTS payments.admin_alert_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT,
  delivered BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_alert_logs_key_created
  ON payments.admin_alert_logs(alert_key, created_at DESC);

ALTER TABLE payments.admin_alert_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role admin_alert_logs" ON payments.admin_alert_logs;
CREATE POLICY "Service role admin_alert_logs" ON payments.admin_alert_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON payments.admin_alert_logs TO service_role;

CREATE TABLE IF NOT EXISTS payments.alert_preference_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE payments.alert_preference_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role alert_preference_audit" ON payments.alert_preference_audit;
CREATE POLICY "Service role alert_preference_audit" ON payments.alert_preference_audit
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON payments.alert_preference_audit TO service_role;

-- Extend digest logs
ALTER TABLE payments.email_digest_logs
  ADD COLUMN IF NOT EXISTS slot TEXT,
  ADD COLUMN IF NOT EXISTS primary_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reference_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resend_id TEXT,
  ADD COLUMN IF NOT EXISTS duration_ms INT;

-- Allow multiple slot logs per day: drop unique if present, add unique on (user, date, slot)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_digest_logs_user_id_digest_date_key'
  ) THEN
    ALTER TABLE payments.email_digest_logs DROP CONSTRAINT email_digest_logs_user_id_digest_date_key;
  END IF;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS email_digest_logs_user_day_slot_uidx
  ON payments.email_digest_logs (user_id, digest_date, (coalesce(slot, '')));

-- 6) Limit RPCs
CREATE OR REPLACE FUNCTION public._user_tier_row_name(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_name TEXT;
  v_active_tier TEXT;
BEGIN
  SELECT p.subscription_tier INTO v_name FROM public.profiles p WHERE p.id = p_user_id;
  IF v_name IS NULL THEN v_name := 'free'; END IF;

  SELECT st.name INTO v_active_tier
  FROM payments.subscriptions s
  JOIN payments.subscription_tiers st ON st.id = s.tier_id
  WHERE s.user_id = p_user_id AND s.status = 'ACTIVE'
  LIMIT 1;

  IF v_active_tier IS NOT NULL THEN
    RETURN v_active_tier;
  END IF;

  IF v_name = 'pro' THEN RETURN 'pro-monthly'; END IF;
  IF v_name = 'enterprise' THEN RETURN 'enterprise-monthly'; END IF;
  RETURN v_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_has_paid_subscription(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM payments.subscriptions s
    WHERE s.user_id = p_user_id AND s.status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_legislation_watch_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_limit INTEGER; v_tier TEXT;
BEGIN
  v_tier := public._user_tier_row_name(p_user_id);
  SELECT st.max_legislation_watches INTO v_limit
  FROM payments.subscription_tiers st WHERE st.name = v_tier;
  RETURN coalesce(v_limit, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_legislation_watch_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COUNT(*)::INT FROM public.legislation_watches WHERE user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.check_legislation_watch_limit(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.get_user_legislation_watch_count(p_user_id) < public.get_user_legislation_watch_limit(p_user_id);
$$;

CREATE OR REPLACE FUNCTION public.get_user_watch_email_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_limit INTEGER; v_tier TEXT;
BEGIN
  IF NOT public.user_has_paid_subscription(p_user_id) THEN
    RETURN 0;
  END IF;
  v_tier := public._user_tier_row_name(p_user_id);
  SELECT st.max_watch_email_notifications INTO v_limit
  FROM payments.subscription_tiers st WHERE st.name = v_tier;
  RETURN coalesce(v_limit, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_watch_email_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COUNT(*)::INT FROM public.legislation_watches
  WHERE user_id = p_user_id AND email_enabled = TRUE;
$$;

CREATE OR REPLACE FUNCTION public.check_watch_email_limit(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.get_user_watch_email_count(p_user_id) < public.get_user_watch_email_limit(p_user_id);
$$;

GRANT EXECUTE ON FUNCTION public.user_has_paid_subscription(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_legislation_watch_limit(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_legislation_watch_count(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_legislation_watch_limit(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_watch_email_limit(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_watch_email_count(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_watch_email_limit(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.legislation_normalized_key(JSONB) TO authenticated, service_role;

-- 7) Matching RPC
CREATE OR REPLACE FUNCTION public.get_legislation_watch_hits(
  p_user_id UUID,
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ
)
RETURNS TABLE (
  watch_id UUID,
  watch_label TEXT,
  stiri_id BIGINT,
  stiri_title TEXT,
  stiri_slug TEXT,
  publication_date TIMESTAMPTZ,
  relationship_type TEXT,
  confidence_score DOUBLE PRECISION,
  match_method TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH watches AS (
    SELECT w.*
    FROM public.legislation_watches w
    WHERE w.user_id = p_user_id
  ),
  hits AS (
    -- target_stiri: new source document modifies watched target
    SELECT
      w.id AS watch_id,
      w.label AS watch_label,
      s.id AS stiri_id,
      s.title AS stiri_title,
      (public.slugify(s.title) || '-' || s.id::text) AS stiri_slug,
      coalesce(s.publication_date::timestamptz, s.created_at) AS publication_date,
      lc.relationship_type,
      lc.confidence_score::DOUBLE PRECISION,
      'target_stiri'::TEXT AS match_method
    FROM watches w
    JOIN public.legislative_connections lc
      ON lc.target_document_id = w.target_stiri_id
     AND lc.relationship_type = ANY (w.relation_filters)
     AND coalesce(lc.confidence_score, 0) >= w.min_confidence
    JOIN public.stiri s ON s.id = lc.source_document_id
    WHERE w.target_type = 'stiri'
      AND w.target_stiri_id IS NOT NULL
      AND coalesce(s.publication_date::timestamptz, s.created_at) >= p_since
      AND coalesce(s.publication_date::timestamptz, s.created_at) < p_until

    UNION ALL

    -- normalized_key / external via connection metadata
    SELECT
      w.id,
      w.label,
      s.id,
      s.title,
      (public.slugify(s.title) || '-' || s.id::text),
      coalesce(s.publication_date::timestamptz, s.created_at),
      lc.relationship_type,
      lc.confidence_score::DOUBLE PRECISION,
      CASE WHEN w.target_type = 'external' THEN 'external_id' ELSE 'normalized_key' END
    FROM watches w
    JOIN public.legislative_connections lc
      ON lc.relationship_type = ANY (w.relation_filters)
     AND coalesce(lc.confidence_score, 0) >= w.min_confidence
     AND (
       public.legislation_normalized_key(lc.metadata->'normalized_identifier') = w.normalized_key
       OR (
         w.target_type = 'external' AND w.target_external_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM public.external_legislative_documents e
           WHERE e.id = w.target_external_id
             AND (
               public.legislation_normalized_key(e.normalized_identifier) = w.normalized_key
               OR lower(coalesce(lc.metadata->>'external_identifier','')) = lower(e.identifier)
             )
         )
       )
     )
    JOIN public.stiri s ON s.id = lc.source_document_id
    WHERE w.target_type IN ('external', 'normalized_ref')
      AND coalesce(s.publication_date::timestamptz, s.created_at) >= p_since
      AND coalesce(s.publication_date::timestamptz, s.created_at) < p_until
  )
  SELECT DISTINCT ON (h.watch_id, h.stiri_id)
    h.watch_id, h.watch_label, h.stiri_id, h.stiri_title, h.stiri_slug,
    h.publication_date, h.relationship_type, h.confidence_score, h.match_method
  FROM hits h
  ORDER BY h.watch_id, h.stiri_id, h.confidence_score DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_legislation_watch_hits(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

-- 8) Users with active digests (searches OR watches), paid ACTIVE only for email
CREATE OR REPLACE FUNCTION public.get_users_with_active_digests()
RETURNS TABLE(
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  saved_searches JSONB,
  legislation_watches JSONB,
  notification_settings JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH paid AS (
    SELECT s.user_id
    FROM payments.subscriptions s
    WHERE s.status = 'ACTIVE'
  ),
  search_users AS (
    SELECT ss.user_id,
      jsonb_agg(jsonb_build_object(
        'id', ss.id, 'name', ss.name, 'search_params', ss.search_params
      )) AS saved_searches
    FROM saved_searches ss
    JOIN paid p ON p.user_id = ss.user_id
    WHERE ss.email_notifications_enabled = TRUE
    GROUP BY ss.user_id
  ),
  watch_users AS (
    SELECT w.user_id,
      jsonb_agg(jsonb_build_object(
        'id', w.id, 'label', w.label, 'normalized_key', w.normalized_key
      )) AS legislation_watches
    FROM public.legislation_watches w
    JOIN paid p ON p.user_id = w.user_id
    WHERE w.email_enabled = TRUE
    GROUP BY w.user_id
  ),
  all_users AS (
    SELECT coalesce(su.user_id, wu.user_id) AS user_id,
      coalesce(su.saved_searches, '[]'::jsonb) AS saved_searches,
      coalesce(wu.legislation_watches, '[]'::jsonb) AS legislation_watches
    FROM search_users su
    FULL OUTER JOIN watch_users wu ON wu.user_id = su.user_id
  )
  SELECT
    au.user_id,
    u.email::TEXT AS user_email,
    coalesce(pr.display_name, u.email)::TEXT AS user_name,
    au.saved_searches,
    au.legislation_watches,
    coalesce(up.notification_settings, '{}'::jsonb) AS notification_settings
  FROM all_users au
  JOIN auth.users u ON u.id = au.user_id
  LEFT JOIN public.profiles pr ON pr.id = au.user_id
  LEFT JOIN public.user_preferences up ON up.id = au.user_id
  WHERE u.email_confirmed_at IS NOT NULL
    AND coalesce((up.notification_settings->>'digest_email_enabled')::boolean, true) = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_users_with_active_digests() TO service_role;

-- 9) Ops views
CREATE OR REPLACE VIEW payments.v_email_ops_today AS
SELECT
  (now() AT TIME ZONE 'Europe/Bucharest')::date AS run_day,
  count(*) FILTER (WHERE status = 'OK') AS slots_ok,
  count(*) FILTER (WHERE status IN ('FAILED','PARTIAL')) AS slots_failed,
  count(*) FILTER (WHERE status = 'SKIPPED_OVERLAP') AS slots_overlap,
  coalesce(sum(users_sent), 0) AS emails_sent,
  coalesce(sum(users_skipped), 0) AS users_skipped,
  coalesce(sum(users_failed), 0) AS users_failed,
  coalesce(sum(primary_articles_sent), 0) AS primary_articles,
  bool_or(resend_quota_hit) AS quota_hit,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) AS duration_p50_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS duration_p95_ms
FROM payments.email_slot_runs
WHERE run_day = (now() AT TIME ZONE 'Europe/Bucharest')::date;

CREATE OR REPLACE VIEW payments.v_email_ops_7d AS
SELECT
  run_day,
  count(*) AS runs,
  coalesce(sum(users_sent), 0) AS emails_sent,
  coalesce(sum(users_failed), 0) AS users_failed,
  bool_or(resend_quota_hit) AS quota_hit
FROM payments.email_slot_runs
WHERE run_day >= (now() AT TIME ZONE 'Europe/Bucharest')::date - 7
GROUP BY run_day
ORDER BY run_day DESC;

CREATE OR REPLACE VIEW payments.v_email_top_users_7d AS
SELECT user_id, count(*) AS emails
FROM payments.email_digest_logs
WHERE digest_date >= (now() AT TIME ZONE 'Europe/Bucharest')::date - 7
  AND status = 'SENT'
GROUP BY user_id
ORDER BY emails DESC
LIMIT 50;

CREATE OR REPLACE VIEW payments.v_email_missed_slots AS
WITH expected AS (
  SELECT d::date AS run_day, s.slot
  FROM generate_series(
    ((now() AT TIME ZONE 'Europe/Bucharest')::date - 1),
    (now() AT TIME ZONE 'Europe/Bucharest')::date,
    '1 day'::interval
  ) d
  CROSS JOIN (VALUES
    ('07:55'),('09:55'),('11:55'),('13:55'),
    ('15:55'),('17:55'),('19:55'),('21:55')
  ) AS s(slot)
  WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
),
actual AS (
  SELECT run_day, slot, status
  FROM payments.email_slot_runs
  WHERE status IN ('OK','PARTIAL')
    AND run_day >= (now() AT TIME ZONE 'Europe/Bucharest')::date - 1
)
SELECT e.run_day, e.slot
FROM expected e
LEFT JOIN actual a ON a.run_day = e.run_day AND a.slot = e.slot
WHERE a.slot IS NULL
  AND (
    e.run_day < (now() AT TIME ZONE 'Europe/Bucharest')::date
    OR e.slot::time < (now() AT TIME ZONE 'Europe/Bucharest')::time
  );

GRANT SELECT ON payments.v_email_ops_today TO service_role;
GRANT SELECT ON payments.v_email_ops_7d TO service_role;
GRANT SELECT ON payments.v_email_top_users_7d TO service_role;
GRANT SELECT ON payments.v_email_missed_slots TO service_role;
