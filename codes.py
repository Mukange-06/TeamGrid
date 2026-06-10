import pandas as pd

df = pd.read_parquet("team_3.parquet")

# Convert datetime column properly
df['datetime'] = pd.to_datetime(df['datetime'])

# Extract year and month
df['year'] = df['datetime'].dt.year
df['month'] = df['datetime'].dt.month

# Partition parquet files
df.to_parquet(
    "output",
    engine="pyarrow",
    partition_cols=['year', 'month']
)

print("Partitioning complete!")