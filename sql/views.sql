-- =====================================================
-- views.sql
-- Materialized + regular views for the Air Quality schema
-- Designed against the 50 queries in query.sql
-- =====================================================
--
-- Run order: run indexes.sql FIRST, then this file. The materialized
-- views below pre-compute the full-table aggregations that no index can
-- avoid (queries 6, 24, 33 scan every row otherwise).
-- =====================================================


-- =====================================================
-- A: MATERIALIZED VIEWS (heavy aggregations)
-- =====================================================

-- ---------- City x Pollutant summary (queries 5, 6, 16, 22) ----------
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_city_pollution AS
SELECT
    s.city,
    f.pollutant,
    AVG(f.value)  AS avg_pollution,
    MAX(f.value)  AS peak_pollution,
    COUNT(*)      AS total_measurements
FROM fact_air_quality f
JOIN dim_station s ON f.station_key = s.station_key
GROUP BY s.city, f.pollutant;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_city_pollution
    ON mv_city_pollution (city, pollutant);


-- ---------- Pollutant statistical profile ----------
-- Replaces queries 6, 10, 24, 32, 33 in a single pass.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_pollutant_profile AS
SELECT
    pollutant,
    COUNT(*)                                              AS readings,
    MIN(value)                                            AS min_value,
    MAX(value)                                            AS max_value,
    AVG(value)                                            AS avg_value,
    STDDEV(value)                                         AS std_dev,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY value)   AS p25,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY value)   AS median,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY value)   AS p75,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value)   AS p95,
    AVG(at_c)                                             AS avg_temperature,
    AVG(rh_percent)                                       AS avg_humidity,
    AVG(ws_m_s)                                           AS avg_wind_speed,
    CORR(value, at_c)                                     AS temp_corr,
    CORR(value, rh_percent)                               AS humidity_corr,
    CORR(value, ws_m_s)                                   AS wind_corr
FROM fact_air_quality
GROUP BY pollutant;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_pollutant_profile
    ON mv_pollutant_profile (pollutant);


-- ---------- Station profile with rank + health status ----------
-- Replaces queries 5, 7, 23, 26, 29, 35. Grouped by station_key so the
-- unique index is genuinely unique (station names can repeat).
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_station_profile AS
SELECT
    s.station_key,
    s.station_name,
    s.city,
    AVG(f.value)                                  AS avg_pollution,
    COUNT(*)                                      AS total_measurements,
    RANK() OVER (ORDER BY AVG(f.value) DESC)      AS pollution_rank,
    CASE
        WHEN AVG(f.value) <= 50  THEN 'Good'
        WHEN AVG(f.value) <= 100 THEN 'Moderate'
        WHEN AVG(f.value) <= 150 THEN 'Unhealthy for Sensitive Groups'
        WHEN AVG(f.value) <= 200 THEN 'Unhealthy'
        ELSE 'Hazardous'
    END                                           AS health_status
FROM fact_air_quality f
JOIN dim_station s ON f.station_key = s.station_key
GROUP BY s.station_key, s.station_name, s.city;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_station_profile
    ON mv_station_profile (station_key);


-- ---------- Monthly trend (queries 8, 19, 30, 34, 43) ----------
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_monthly_trend AS
SELECT
    d.year,
    d.month,
    f.pollutant,
    AVG(f.value) AS avg_pollution,
    MAX(f.value) AS max_pollution,
    MIN(f.value) AS min_pollution,
    COUNT(*)     AS readings
FROM fact_air_quality f
JOIN dim_date d ON f.date_key = d.date_key
GROUP BY d.year, d.month, f.pollutant;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_monthly_trend
    ON mv_monthly_trend (year, month, pollutant);


-- ---------- Daily trend (queries 11, 21) ----------
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_trend AS
SELECT
    DATE(d.datetime) AS day,
    AVG(f.value)     AS avg_pollution,
    MAX(f.value)     AS peak_pollution,
    COUNT(*)         AS readings
FROM fact_air_quality f
JOIN dim_date d ON f.date_key = d.date_key
GROUP BY DATE(d.datetime);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_trend
    ON mv_daily_trend (day);


-- ---------- Hourly profile (query 9) ----------
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_hourly_profile AS
SELECT
    d.hour,
    AVG(f.value) AS avg_pollution,
    COUNT(*)     AS readings
FROM fact_air_quality f
JOIN dim_date d ON f.date_key = d.date_key
GROUP BY d.hour;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_hourly_profile
    ON mv_hourly_profile (hour);


-- =====================================================
-- B: REGULAR (LIVE) VIEWS
-- =====================================================
-- Not materialized: either they must stay fresh, or they are one-off
-- diagnostics where a stale snapshot would mislead.

-- ---------- Live 24h dashboard (query 50) ----------
-- Must be live. Relies on idx_dim_date_datetime from indexes.sql.
CREATE OR REPLACE VIEW vw_realtime_dashboard AS
SELECT
    s.city,
    f.pollutant,
    AVG(f.value) AS avg_pollution,
    MAX(f.value) AS peak_pollution,
    COUNT(*)     AS readings
FROM fact_air_quality f
JOIN dim_station s ON f.station_key = s.station_key
JOIN dim_date   d ON f.date_key    = d.date_key
WHERE d.datetime >= NOW() - INTERVAL '24 hours'
GROUP BY s.city, f.pollutant;

-- ---------- Duplicate detection (query 36) ----------
CREATE OR REPLACE VIEW vw_duplicates AS
SELECT
    station_key,
    date_key,
    pollutant,
    COUNT(*) AS duplicate_count
FROM fact_air_quality
GROUP BY station_key, date_key, pollutant
HAVING COUNT(*) > 1;

-- ---------- Z-score outliers (query 49) ----------
CREATE OR REPLACE VIEW vw_outliers AS
WITH stats AS (
    SELECT AVG(value) AS mean, STDDEV(value) AS stddev
    FROM fact_air_quality
)
SELECT
    f.measurement_id,
    f.pollutant,
    f.value,
    (f.value - s.mean) / NULLIF(s.stddev, 0) AS z_score
FROM fact_air_quality f, stats s
WHERE s.stddev > 0
  AND ABS((f.value - s.mean) / s.stddev) > 3;


-- =====================================================
-- C: REFRESH HELPER
-- =====================================================
-- Run on a schedule (cron / pg_cron) after new data loads.
-- CONCURRENTLY avoids locking readers and works because every
-- materialized view above has a UNIQUE index.

CREATE OR REPLACE PROCEDURE refresh_all_analytics()
LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_city_pollution;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_pollutant_profile;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_station_profile;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_trend;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_trend;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_hourly_profile;
END;
$$;

-- Usage:  CALL refresh_all_analytics();
