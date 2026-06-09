-- =====================================================
-- indexes.sql
-- Indexes for the Air Quality star schema
-- Target: PostgreSQL
-- Designed against the 50 queries in query.sql
-- =====================================================
--
-- Run order: run this file FIRST, then views.sql.
-- (embeddings.sql is optional and independent.)
--
-- Conventions:
--   * CREATE INDEX IF NOT EXISTS, so this file is safe to re-run.
--   * Each index lists the query numbers it serves.
--   * Composite indexes are ordered so their leftmost prefix also
--     serves single-column lookups, so no redundant standalone index.
--   * ANALYZE at the end refreshes planner stats.
--
-- Honest caveats:
--   1. Full-table aggregations with no WHERE (queries 6, 24, 33) still
--      scan every row. Indexes only help there if covering (index-only
--      scan). The materialized views in views.sql are the real win.
--   2. Every index slows INSERT/UPDATE and costs disk. On ~4.5M rows
--      that is a real cost. Keep only what EXPLAIN ANALYZE proves you
--      use (check pg_stat_user_indexes, your query 47).
-- =====================================================


-- =====================================================
-- A: JOIN / FK NOTES (no standalone index needed)
-- =====================================================
-- Dimension PKs (station_key, date_key) are already indexed by their
-- PRIMARY KEY. Postgres does NOT auto-index the FK side, but the
-- composites in section C cover the fact-side joins via their leftmost
-- prefix, so plain (station_key) / (date_key) indexes are intentionally
-- omitted to avoid redundancy.


-- =====================================================
-- B: FILTER / GROUP-BY INDEXES
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
-- C: COMPOSITE / COVERING INDEXES (fact table)
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
-- D: NOTES ON QUERIES INDEXES CANNOT FIX WELL
-- =====================================================
-- Query 18 (OR across at_c / ws_m_s / rh_percent): one index cannot
-- serve an OR over different columns. If hot, use three partial indexes
-- and let the planner BitmapOr, for example:
--   CREATE INDEX idx_fact_hot_temp  ON fact_air_quality (value) WHERE at_c > 40;
--   CREATE INDEX idx_fact_high_wind ON fact_air_quality (value) WHERE ws_m_s > 20;
--   CREATE INDEX idx_fact_high_rh   ON fact_air_quality (value) WHERE rh_percent > 95;
--
-- Query 37 (partitioning): a table-design decision, not an index, and
-- cannot be retrofitted by ALTER. At ~4.5M rows on one node it is
-- usually optional; revisit past tens of millions of rows.


-- =====================================================
-- E: REFRESH PLANNER STATS
-- =====================================================
ANALYZE fact_air_quality;
ANALYZE dim_station;
ANALYZE dim_date;
