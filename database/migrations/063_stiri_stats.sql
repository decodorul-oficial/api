-- Stiri statistics functions (today by hour, week by day, months of year, total)
-- Uses created_at as the insertion timestamp for news

-- Total number of stiri
CREATE OR REPLACE FUNCTION public.get_stiri_stats_total()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*) FROM public.stiri;
$$;

COMMENT ON FUNCTION public.get_stiri_stats_total() IS 'Return total number of stiri in public.stiri';

-- Hourly distribution for a given day (default: current day), in Europe/Bucharest timezone
CREATE OR REPLACE FUNCTION public.get_stiri_stats_by_day(
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
    SELECT
      EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Europe/Bucharest'))::INT AS hour,
      COUNT(*) AS cnt
    FROM public.stiri
    WHERE ((created_at AT TIME ZONE 'Europe/Bucharest')::DATE) = p_day
    GROUP BY 1
  )
  SELECT h.hour, COALESCE(c.cnt, 0) AS count
  FROM hours h
  LEFT JOIN counts c ON c.hour = h.hour
  ORDER BY h.hour;
$$;

COMMENT ON FUNCTION public.get_stiri_stats_by_day(DATE) IS 'Hourly count of stiri for the given day (Europe/Bucharest)';

-- Daily distribution for a given week Monday-Friday (default: current week, Monday as start)
CREATE OR REPLACE FUNCTION public.get_stiri_stats_by_week(
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
    SELECT
      (created_at AT TIME ZONE 'Europe/Bucharest')::DATE AS day,
      COUNT(*) AS cnt
    FROM public.stiri
    WHERE (created_at AT TIME ZONE 'Europe/Bucharest')::DATE BETWEEN p_week_start AND (p_week_start + INTERVAL '6 days')::DATE
    GROUP BY 1
  )
  SELECT d.day, COALESCE(c.cnt, 0) AS count
  FROM days d
  LEFT JOIN counts c ON c.day = d.day
  ORDER BY d.day;
$$;

COMMENT ON FUNCTION public.get_stiri_stats_by_week(DATE) IS 'Daily count of stiri for Monday-Friday of the given ISO week (Europe/Bucharest)';

-- Monthly distribution for a given year across Jan-Dec (default: current year)
CREATE OR REPLACE FUNCTION public.get_stiri_stats_by_year(
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
    SELECT
      EXTRACT(MONTH FROM (created_at AT TIME ZONE 'Europe/Bucharest'))::INT AS month,
      COUNT(*) AS cnt
    FROM public.stiri
    WHERE EXTRACT(YEAR FROM (created_at AT TIME ZONE 'Europe/Bucharest'))::INT = p_year
    GROUP BY 1
  )
  SELECT m.month, COALESCE(c.cnt, 0) AS count
  FROM months m
  LEFT JOIN counts c ON c.month = m.month
  ORDER BY m.month;
$$;

COMMENT ON FUNCTION public.get_stiri_stats_by_year(INT) IS 'Monthly count of stiri for the given year (Europe/Bucharest)';


