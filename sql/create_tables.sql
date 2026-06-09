-- =========================================
-- DIMENSION TABLE: STATION
-- =========================================

CREATE TABLE dim_station (
    station_key INT PRIMARY KEY,
    station_id VARCHAR(50),
    station_name TEXT,
    station TEXT,
    city TEXT,
    state TEXT
);

-- =========================================
-- DIMENSION TABLE: DATE
-- =========================================

CREATE TABLE dim_date (
    date_key INT PRIMARY KEY,
    datetime TIMESTAMP,
    year INT,
    month INT,
    day INT,
    hour INT
);

-- =========================================
-- FACT TABLE: AIR QUALITY
-- =========================================

CREATE TABLE fact_air_quality (

    measurement_id BIGINT PRIMARY KEY,

    station_key INT,
    date_key INT,

    pollutant TEXT,
    value FLOAT,

    at_c FLOAT,
    rh_percent FLOAT,
    ws_m_s FLOAT,
    wd_deg FLOAT,
    rf_mm FLOAT,
    tot_rf_mm FLOAT,
    sr_w_mt2 FLOAT,
    bp_mmhg FLOAT,
    vws_m_s FLOAT,

    CONSTRAINT fk_station
        FOREIGN KEY (station_key)
        REFERENCES dim_station(station_key),

    CONSTRAINT fk_date
        FOREIGN KEY (date_key)
        REFERENCES dim_date(date_key)
);
