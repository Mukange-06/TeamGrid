-- =====================================================
-- indexes.sql
-- Indexes for the Air Quality star schema
-- Target: PostgreSQL
-- Designed against the 50 queries in query.sql
-- =====================================================
--
-- Run order: run this file FIRST, then views.sql.
-- (embeddings.sql is optional and independent.)
-- =====================================================

-- =====================================================
-- A: FILTER / GROUP-BY INDEXES
-- =====================================================

-- value sorted descending: ORDER BY value DESC LIMIT
-- (queries 13, 18, 20, 28, 49).
CREATE INDEX IF NOT EXISTS idx_fact_value_desc
    ON fact_air_quality (value DESC);

-- city: grouping / DISTINCT ON (queries 5, 7, 16, 22, 23, 50).
CREATE INDEX IF NOT EXISTS idx_dim_station_city
    ON dim_station (city);

-- state: monthly-by-state report (query 19).
CREATE INDEX IF NOT EXISTS idx_dim_station_state
    ON dim_station (state);

-- datetime: filter / order / daily grouping / gap detection / NOW()
-- window (queries 8, 9, 11, 21, 27, 31, 50).
CREATE INDEX IF NOT EXISTS idx_dim_date_datetime
    ON dim_date (datetime);

-- year + month: trend and per-year-month grouping
-- (queries 8, 19, 30, 34, 43).
CREATE INDEX IF NOT EXISTS idx_dim_date_year_month
    ON dim_date (year, month);

-- hour: hourly profile (query 9).
CREATE INDEX IF NOT EXISTS idx_dim_date_hour
    ON dim_date (hour);


-- =====================================================
-- B: COMPOSITE / COVERING INDEXES (fact table)
-- =====================================================
-- These enable index-only scans on the avg(value)-grouped queries and
-- serve the joins via their leftmost prefix.

-- (station_key, value): join on station_key AND aggregate value per
-- station/city. Queries 4, 5, 7, 23, 26, 35. Prefix covers plain joins.
CREATE INDEX IF NOT EXISTS idx_fact_station_value
    ON fact_air_quality (station_key, value);

-- (date_key, value): join on date_key AND aggregate value over time.
-- Queries 8, 9, 11, 21. Prefix covers plain date_key joins.
CREATE INDEX IF NOT EXISTS idx_fact_date_value
    ON fact_air_quality (date_key, value);

-- (pollutant, value): group by / filter pollutant + aggregate value.
-- Queries 6, 13, 24, 30, 33, 40, 42. Prefix covers plain pollutant use.
CREATE INDEX IF NOT EXISTS idx_fact_pollutant_value
    ON fact_air_quality (pollutant, value);

-- (station_key, date_key, pollutant): duplicate detection grain
-- (query 36) and window partitions (queries 27, 28).
CREATE INDEX IF NOT EXISTS idx_fact_grain
    ON fact_air_quality (station_key, date_key, pollutant);


-- =====================================================
-- C: REFRESH PLANNER STATS
-- =====================================================
ANALYZE fact_air_quality;
ANALYZE dim_station;
ANALYZE dim_date;
