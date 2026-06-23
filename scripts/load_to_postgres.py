import pandas as pd
from sqlalchemy import create_engine

# ---------------------------------------------------
# DATABASE CONNECTION
# ---------------------------------------------------

USERNAME = "postgres"
PASSWORD = "Emm@nuel2006"
HOST = "localhost"
PORT = "5432"
DATABASE = "teamgrid1"  # Emmanuel's database name

engine = create_engine(
    f"postgresql+psycopg2://{USERNAME}:{PASSWORD}@{HOST}:{PORT}/{DATABASE}"
)
print("DATABASE CONNECTION SUCCESSFUL")

# ---------------------------------------------------
# LOAD DIM_STATION
# ---------------------------------------------------

dim_station = pd.read_csv(
    r'output/dim_station.csv'
)

dim_station.to_sql(
    'dim_station',
    engine,
    if_exists='append',
    index=False,
    method='multi'
)

print("dim_station LOADED")

# ---------------------------------------------------
# LOAD DIM_DATE
# ---------------------------------------------------

dim_date = pd.read_csv(
    r'output/dim_date.csv'
)

dim_date.to_sql(
    'dim_date',
    engine,
    if_exists='append',
    index=False,
    method='multi'
)

print("dim_date LOADED")

# ---------------------------------------------------
# LOAD FACT TABLE IN CHUNKS
# ---------------------------------------------------

chunk_size = 100000

for chunk in pd.read_csv(
    r'output/fact_air_quality.csv',
    chunksize=chunk_size
):

    chunk.to_sql(
        'fact_air_quality',
        engine,
        if_exists='append',
        index=False,
        method='multi'
    )

    print(f"{len(chunk)} rows loaded")

print("FACT TABLE LOADED")

print("ALL DATA SUCCESSFULLY LOADED")