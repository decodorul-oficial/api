-- Weekly public newsletter: top-15 articles RPC + audit runs table

-- 1) Audit table for weekly newsletter sends
CREATE TABLE IF NOT EXISTS payments.newsletter_weekly_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_week DATE NOT NULL, -- Monday of the previous calendar week (Europe/Bucharest)
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'RUNNING'
    CHECK (status IN ('RUNNING', 'OK', 'PARTIAL', 'FAILED', 'SKIPPED_DUPLICATE', 'SKIPPED_NO_ARTICLES', 'SKIPPED_NO_SUBSCRIBERS', 'SKIPPED_DRY_RUN')),
  selection_mode TEXT, -- 'by_views' | 'by_publication_date'
  article_ids BIGINT[] NOT NULL DEFAULT '{}',
  subscribers_considered INT NOT NULL DEFAULT 0,
  emails_sent INT NOT NULL DEFAULT 0,
  emails_failed INT NOT NULL DEFAULT 0,
  resend_quota_hit BOOLEAN NOT NULL DEFAULT FALSE,
  error_summary TEXT,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_weekly_runs_ok_edition_uidx
  ON payments.newsletter_weekly_runs (edition_week)
  WHERE status = 'OK';

CREATE INDEX IF NOT EXISTS newsletter_weekly_runs_started_idx
  ON payments.newsletter_weekly_runs (started_at DESC);

GRANT ALL ON payments.newsletter_weekly_runs TO service_role;

CREATE OR REPLACE VIEW public.newsletter_weekly_runs AS
  SELECT * FROM payments.newsletter_weekly_runs;

GRANT ALL ON public.newsletter_weekly_runs TO service_role;

-- 2) RPC: top newsletter stories for previous calendar week (Europe/Bucharest)
CREATE OR REPLACE FUNCTION public.get_weekly_newsletter_stiri(
  p_limit INTEGER DEFAULT 15
)
RETURNS TABLE (
  id BIGINT,
  title TEXT,
  publication_date DATE,
  content JSONB,
  created_at TIMESTAMPTZ,
  filename TEXT,
  view_count BIGINT,
  week_start DATE,
  week_end DATE,
  edition_week DATE,
  selection_mode TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_bucharest DATE;
  v_this_monday DATE;
  v_week_start DATE;
  v_week_end DATE;
  v_edition_week DATE;
  v_window_start TIMESTAMPTZ;
  v_window_end TIMESTAMPTZ;
  v_max_views BIGINT := 0;
  v_distinct_positive INT := 0;
  v_use_views BOOLEAN := FALSE;
  v_limit INT := GREATEST(COALESCE(p_limit, 15), 1);
BEGIN
  v_today_bucharest := (NOW() AT TIME ZONE 'Europe/Bucharest')::DATE;
  -- ISO week: date_trunc('week') is Monday in Postgres
  v_this_monday := date_trunc('week', v_today_bucharest::TIMESTAMP)::DATE;
  v_week_start := v_this_monday - 7;
  v_week_end := v_this_monday - 1;
  v_edition_week := v_week_start;

  v_window_start := (v_week_start::TIMESTAMP AT TIME ZONE 'Europe/Bucharest');
  v_window_end := ((v_week_end + 1)::TIMESTAMP AT TIME ZONE 'Europe/Bucharest');

  SELECT
    COALESCE(MAX(cnt), 0),
    COALESCE(COUNT(*) FILTER (WHERE cnt > 0), 0)
  INTO v_max_views, v_distinct_positive
  FROM (
    SELECT COUNT(nv.id)::BIGINT AS cnt
    FROM public.stiri s
    LEFT JOIN public.news_views nv
      ON nv.news_id = s.id
     AND nv.viewed_at >= v_window_start
     AND nv.viewed_at < v_window_end
    WHERE s.publication_date >= v_week_start
      AND s.publication_date <= v_week_end
    GROUP BY s.id
  ) t;

  -- Prefer views ranking only when it actually differentiates
  v_use_views := (v_max_views > 1) AND (v_distinct_positive > 0);

  IF v_use_views THEN
    RETURN QUERY
    SELECT
      s.id,
      s.title,
      s.publication_date,
      s.content,
      s.created_at,
      s.filename,
      COALESCE(COUNT(nv.id), 0)::BIGINT AS view_count,
      v_week_start,
      v_week_end,
      v_edition_week,
      'by_views'::TEXT AS selection_mode
    FROM public.stiri s
    LEFT JOIN public.news_views nv
      ON nv.news_id = s.id
     AND nv.viewed_at >= v_window_start
     AND nv.viewed_at < v_window_end
    WHERE s.publication_date >= v_week_start
      AND s.publication_date <= v_week_end
    GROUP BY s.id
    ORDER BY COALESCE(COUNT(nv.id), 0) DESC, s.publication_date DESC, s.id DESC
    LIMIT v_limit;
  ELSE
    RETURN QUERY
    SELECT
      s.id,
      s.title,
      s.publication_date,
      s.content,
      s.created_at,
      s.filename,
      COALESCE(s.view_count, 0)::BIGINT AS view_count,
      v_week_start,
      v_week_end,
      v_edition_week,
      'by_publication_date'::TEXT AS selection_mode
    FROM public.stiri s
    WHERE s.publication_date >= v_week_start
      AND s.publication_date <= v_week_end
    ORDER BY s.publication_date DESC, s.id DESC
    LIMIT v_limit;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_weekly_newsletter_stiri(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_weekly_newsletter_stiri(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_newsletter_stiri(INTEGER) TO anon;
