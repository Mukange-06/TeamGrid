import pandas as pd

# ---------------------------------------------------
# LOAD DATA
# ---------------------------------------------------

df = pd.read_parquet(
    r"C:\Users\User\OneDrive\Desktop\TeamGrid\cleaned_air_quality.parquet"
)

print("CLEANED DATA LOADED SUCCESSFULLY")



# ---------------------------------------------------
# CREATE STATION DIMENSION
# ---------------------------------------------------

dim_station = df[[
    'station_id',
    'station_name',
    'station',
    'city',
    'state'
]].drop_duplicates().reset_index(drop=True)

# Create surrogate key
dim_station['station_key'] = dim_station.index + 1

print("STATION DIMENSION CREATED")

# ---------------------------------------------------
# CREATE DATE DIMENSION
# ---------------------------------------------------

dim_date = df[[
    'datetime',
    'year',
    'month',
    'day',
    'hour'
]].drop_duplicates().reset_index(drop=True)

# Create surrogate key
dim_date['date_key'] = dim_date.index + 1

print("DATE DIMENSION CREATED")

# ---------------------------------------------------
# MERGE STATION KEY
# ---------------------------------------------------

df = df.merge(
    dim_station,
    on=[
        'station_id',
        'station_name',
        'station',
        'city',
        'state'
    ],
    how='left'
)

print("STATION KEY MERGED")

# ---------------------------------------------------
# MERGE DATE KEY
# ---------------------------------------------------

df = df.merge(
    dim_date,
    on=[
        'datetime',
        'year',
        'month',
        'day',
        'hour'
    ],
    how='left'
)

print("DATE KEY MERGED")

# ---------------------------------------------------
# CREATE FACT TABLE
# ---------------------------------------------------

fact_air_quality = df[[
    'station_key',
    'date_key',
    'pollutant',
    'value',
    'at_c',
    'rh_percent',
    'ws_m_s',
    'wd_deg',
    'rf_mm',
    'tot_rf_mm',
    'sr_w_mt2',
    'bp_mmhg',
    'vws_m_s'
]]

# Create measurement key
fact_air_quality = fact_air_quality.reset_index(drop=True)

fact_air_quality['measurement_id'] = (
    fact_air_quality.index + 1
)

print("FACT TABLE CREATED")

# ---------------------------------------------------
# SAVE FILES
# ---------------------------------------------------

dim_station.to_csv(
    r'output/dim_station.csv',
    index=False
)

dim_date.to_csv(
    r'output/dim_date.csv',
    index=False
)

fact_air_quality.to_csv(
    r'output/fact_air_quality.csv',
    index=False
)

print("CSV FILES SAVED")

# ---------------------------------------------------
# DISPLAY INFO
# ---------------------------------------------------

print("\nDIM STATION")
print(dim_station.head())

print("\nDIM DATE")
print(dim_date.head())

print("\nFACT TABLE")
print(fact_air_quality.head())

print("\nPROCESS COMPLETED SUCCESSFULLY")