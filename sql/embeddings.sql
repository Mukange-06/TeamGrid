-- =====================================================
-- embeddings.sql
-- Covers queries 38 to 42 in query.sql
-- =====================================================
--
-- IMPORTANT: the base schema in your CREATE TABLE has NO embedding and
-- NO search_vector column. Queries 38 to 42 cannot run until you add
-- them here. This file is independent of indexes.sql / views.sql and is
-- only needed if you actually want vector or full-text search.
-- =====================================================


-- =====================================================
-- A: FULL-TEXT SEARCH (queries 41, 42)
-- =====================================================

ALTER TABLE fact_air_quality
    ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- One-time backfill of existing rows.
UPDATE fact_air_quality
SET search_vector = to_tsvector(
    COALESCE(pollutant, '') || ' ' || COALESCE(CAST(value AS TEXT), '')
)
WHERE search_vector IS NULL;

CREATE INDEX IF NOT EXISTS idx_fact_search_vector
    ON fact_air_quality USING GIN (search_vector);

-- Optional: keep search_vector current on new inserts/updates via a
-- generated column instead of manual backfill (Postgres 12+):
--   ALTER TABLE fact_air_quality DROP COLUMN search_vector;
--   ALTER TABLE fact_air_quality ADD COLUMN search_vector tsvector
--     GENERATED ALWAYS AS (
--       to_tsvector('simple',
--         COALESCE(pollutant,'') || ' ' || COALESCE(CAST(value AS TEXT),''))
--     ) STORED;
--   CREATE INDEX idx_fact_search_vector
--     ON fact_air_quality USING GIN (search_vector);


-- =====================================================
-- B: VECTOR SEARCH / pgvector (queries 38 to 40)
-- =====================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- 384 dims to match the multilingual-e5-small style embeddings.
-- Adjust the dimension to your actual embedding model.
ALTER TABLE fact_air_quality
    ADD COLUMN IF NOT EXISTS embedding vector(384);

-- ivfflat needs the column populated and an ANALYZE before it helps.
-- Rule of thumb: lists ~= sqrt(row_count). For ~4.5M rows that is ~2000,
-- not the 100 in your original query.sql.
--
-- IMPORTANT: choose the operator class to match how you query.
--   query 38/40 use the <-> (L2 distance) operator -> use vector_l2_ops
--   if you switch to cosine distance (<=>) -> use vector_cosine_ops
-- They are not interchangeable; the index is only used for its operator.

CREATE INDEX IF NOT EXISTS idx_fact_embedding
    ON fact_air_quality USING ivfflat (embedding vector_l2_ops)
    WITH (lists = 2000);

-- After populating embeddings, run:
--   ANALYZE fact_air_quality;
-- and tune probes at query time for recall vs speed, e.g.:
--   SET ivfflat.probes = 10;
