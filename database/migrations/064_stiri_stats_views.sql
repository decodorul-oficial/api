-- Extended stiri stats: per-month counts and views-based metrics

-- Daily distribution within a specific month (defaults: current year/month)
CREATE OR REPLACE FUNCTION public.get_stiri_stats_by_month(
  p_year INT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT,
  p_month INT DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::INT
)
RETURNS TABLE(
  day INT,
  count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH bounds AS (
    SELECT make_date(p_year, p_month, 1) AS start_date,
           (make_date(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::DATE AS end_date
  ), days AS (
    SELECT generate_series(1, EXTRACT(DAY FROM (SELECT end_date FROM bounds))::INT) AS day
  ), counts AS (
    SELECT EXTRACT(DAY FROM (created_at AT TIME ZONE 'Europe/Bucharest'))::INT AS day,
           COUNT(*) AS cnt
    FROM public.stiri, bounds
    WHERE (created_at AT TIME ZONE 'Europe/Bucharest')::DATE BETWEEN (SELECT start_date FROM bounds) AND (SELECT end_date FROM bounds)
    GROUP BY 1
  )
  SELECT d.day, COALESCE(c.cnt, 0) AS count
  FROM days d
  LEFT JOIN counts c ON c.day = d.day
  ORDER BY d.day;
$$;

COMMENT ON FUNCTION public.get_stiri_stats_by_month(INT, INT) IS 'Daily count of stiri for the given year and month (Europe/Bucharest)';

-- ==============================
-- Views-based metrics
-- ==============================

-- Total views across all time
CREATE OR REPLACE FUNCTION public.get_stiri_views_total()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*) FROM public.news_views;
$$;

COMMENT ON FUNCTION public.get_stiri_views_total() IS 'Total number of views recorded in public.news_views';

-- Hourly views for a given day
CREATE OR REPLACE FUNCTION public.get_stiri_views_by_day(
  p_day DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  hour INT,
  count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH hours AS (
    SELECT generate_series(0, 23) AS hour
  ),
  counts AS (
    SELECT EXTRACT(HOUR FROM (viewed_at AT TIME ZONE 'Europe/Bucharest'))::INT AS hour,
           COUNT(*) AS cnt
    FROM public.news_views
    WHERE ((viewed_at AT TIME ZONE 'Europe/Bucharest')::DATE) = p_day
    GROUP BY 1
  )
  SELECT h.hour, COALESCE(c.cnt, 0) AS count
  FROM hours h
  LEFT JOIN counts c ON c.hour = h.hour
  ORDER BY h.hour;
$$;

COMMENT ON FUNCTION public.get_stiri_views_by_day(DATE) IS 'Hourly views count for the given day (Europe/Bucharest)';

-- Daily views for a given week Monday-Friday
CREATE OR REPLACE FUNCTION public.get_stiri_views_by_week(
  p_week_start DATE DEFAULT (date_trunc('week', CURRENT_DATE))::DATE
)
RETURNS TABLE(
  day DATE,
  count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH days AS (
    SELECT generate_series(p_week_start, p_week_start + INTERVAL '4 days', INTERVAL '1 day')::DATE AS day
  ),
  counts AS (
    SELECT (viewed_at AT TIME ZONE 'Europe/Bucharest')::DATE AS day,
           COUNT(*) AS cnt
    FROM public.news_views
    WHERE (viewed_at AT TIME ZONE 'Europe/Bucharest')::DATE BETWEEN p_week_start AND (p_week_start + INTERVAL '6 days')::DATE
    GROUP BY 1
  )
  SELECT d.day, COALESCE(c.cnt, 0) AS count
  FROM days d
  LEFT JOIN counts c ON c.day = d.day
  ORDER BY d.day;
$$;

COMMENT ON FUNCTION public.get_stiri_views_by_week(DATE) IS 'Daily views for Monday-Friday of the given week (Europe/Bucharest)';

-- Monthly views aggregation for a given year (Jan-Dec)
CREATE OR REPLACE FUNCTION public.get_stiri_views_by_year(
  p_year INT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT
)
RETURNS TABLE(
  month INT,
  count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH months AS (
    SELECT generate_series(1, 12) AS month
  ),
  counts AS (
    SELECT EXTRACT(MONTH FROM (viewed_at AT TIME ZONE 'Europe/Bucharest'))::INT AS month,
           COUNT(*) AS cnt
    FROM public.news_views
    WHERE EXTRACT(YEAR FROM (viewed_at AT TIME ZONE 'Europe/Bucharest'))::INT = p_year
    GROUP BY 1
  )
  SELECT m.month, COALESCE(c.cnt, 0) AS count
  FROM months m
  LEFT JOIN counts c ON c.month = m.month
  ORDER BY m.month;
$$;

COMMENT ON FUNCTION public.get_stiri_views_by_year(INT) IS 'Monthly views for the given year (Europe/Bucharest)';

-- Daily views within a specific month
CREATE OR REPLACE FUNCTION public.get_stiri_views_by_month(
  p_year INT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT,
  p_month INT DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::INT
)
RETURNS TABLE(
  day INT,
  count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH bounds AS (
    SELECT make_date(p_year, p_month, 1) AS start_date,
           (make_date(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::DATE AS end_date
  ), days AS (
    SELECT generate_series(1, EXTRACT(DAY FROM (SELECT end_date FROM bounds))::INT) AS day
  ), counts AS (
    SELECT EXTRACT(DAY FROM (viewed_at AT TIME ZONE 'Europe/Bucharest'))::INT AS day,
           COUNT(*) AS cnt
    FROM public.news_views, bounds
    WHERE (viewed_at AT TIME ZONE 'Europe/Bucharest')::DATE BETWEEN (SELECT start_date FROM bounds) AND (SELECT end_date FROM bounds)
    GROUP BY 1
  )
  SELECT d.day, COALESCE(c.cnt, 0) AS count
  FROM days d
  LEFT JOIN counts c ON c.day = d.day
  ORDER BY d.day;
$$;

COMMENT ON FUNCTION public.get_stiri_views_by_month(INT, INT) IS 'Daily views for the given year and month (Europe/Bucharest)';


