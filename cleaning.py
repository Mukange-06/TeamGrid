import pandas as pd
import numpy as np

DATA_PATH = r"C:\Users\USER\Desktop\TEAM GRID\team_3.parquet"
MISSING_THRESHOLD = 0.50

df = pd.read_parquet(DATA_PATH)
total_rows = len(df)

print("=" * 55)
print("DATASET OVERVIEW")
print("=" * 55)
print(df.head())
print(df.info())
print(f"\nTotal rows: {total_rows}")


# =========================================================
# 1. UNIQUENESS
# =========================================================
print("\n" + "=" * 55)
print("1. UNIQUENESS")
print("=" * 55)

dupes = df.duplicated().sum()
print(f"Duplicate rows found: {dupes}")
df = df.drop_duplicates()
print(f"Rows after removing duplicates: {len(df)}")


# =========================================================
# 2. VALIDITY
# =========================================================
print("\n" + "=" * 55)
print("2. VALIDITY")
print("=" * 55)

print(f"datetime dtype: {df['datetime'].dtype}")
df["datetime"] = pd.to_datetime(df["datetime"], errors="coerce", utc=True)
invalid_dates = df["datetime"].isnull().sum()
print(f"Unparseable datetime values: {invalid_dates}")

expected_pollutants = {
    "benzene", "no", "no2", "ozone", "pm10", "pm25", "toluene",
    "xylene", "co", "nh3", "mp_xylene", "eth_benzene", "so2",
}
found = set(df["pollutant"].str.strip().str.lower().unique())
unexpected = found - expected_pollutants
print(f"Unexpected pollutant labels: {unexpected if unexpected else 'none'}")


# =========================================================
# 3. CONSISTENCY
# =========================================================
print("\n" + "=" * 55)
print("3. CONSISTENCY")
print("=" * 55)

text_cols = ["state", "city", "pollutant", "station_name", "station", "station_id"]
for col in text_cols:
    if col in df.columns:
        df[col] = df[col].astype("string").str.strip().str.lower()

date_mismatch = (
    (df["datetime"].dt.year != df["year"])
    | (df["datetime"].dt.month != df["month"])
    | (df["datetime"].dt.day != df["day"])
    | (df["datetime"].dt.hour != df["hour"])
).sum()
print(f"Rows where year/month/day/hour disagree with datetime: {date_mismatch}")


# =========================================================
# 4. ACCURACY
# =========================================================
print("\n" + "=" * 55)
print("4. ACCURACY")
print("=" * 55)

def clip_to_nan(series, low=None, high=None):
    mask = pd.Series(False, index=series.index)
    if low is not None:
        mask |= series < low
    if high is not None:
        mask |= series > high
    return series.mask(mask)

range_rules = {
    "rh_percent": (0, 100),
    "wd_deg":     (0, 360),
    "ws_m_s":     (0, None),
    "vws_m_s":    (None, None),
    "rf_mm":      (0, None),
    "tot_rf_mm":  (0, None),
    "sr_w_mt2":   (0, None),
    "value":      (0, None),
    "at_c":       (-30, 60),
    "bp_mmhg":    (850, 1100),
}

for col, (low, high) in range_rules.items():
    if col in df.columns:
        before_na = df[col].isnull().sum()
        df[col] = clip_to_nan(df[col], low, high)
        flagged = df[col].isnull().sum() - before_na
        if flagged > 0:
            print(f"  {col}: {flagged} out-of-range values set to NaN")


# =========================================================
# 5. COMPLETENESS
# =========================================================
print("\n" + "=" * 55)
print("5. COMPLETENESS")
print("=" * 55)

missing_before = df.isnull().sum()
numeric_cols = df.select_dtypes(include=["float64"]).columns

for col in numeric_cols:
    missing_frac = df[col].isnull().mean()
    if missing_frac == 0:
        continue
    if missing_frac > MISSING_THRESHOLD:
        print(f"  {col}: {missing_frac:.0%} missing -> left as NaN (too sparse to impute)")
        continue
    df[col] = df[col].fillna(df.groupby(["station_id", "month"])[col].transform("median"))
    df[col] = df[col].fillna(df.groupby("station_id")[col].transform("median"))
    df[col] = df[col].fillna(df[col].median())
    print(f"  {col}: {missing_frac:.0%} missing -> imputed (station+month median)")

missing_after = df.isnull().sum()
print("\nMissing values before vs after:")
completeness = pd.DataFrame({"before": missing_before, "after": missing_after})
print(completeness)


# =========================================================
# 6. TIMELINESS
# =========================================================
print("\n" + "=" * 55)
print("6. TIMELINESS")
print("=" * 55)

earliest = df["datetime"].min()
latest = df["datetime"].max()
span_days = (latest - earliest).days
staleness_days = (pd.Timestamp.now(tz="UTC") - latest).days

print(f"Earliest record: {earliest}")
print(f"Latest record:   {latest}")
print(f"Span:            {span_days} days")
print(f"Latest record is {staleness_days} days old")


# =========================================================
# SAVE + PARTITION
# =========================================================
print("\n" + "=" * 55)
print("SAVING")
print("=" * 55)

df.to_parquet("cleaned_air_quality.parquet", engine="pyarrow")
df.to_parquet(
    "partitioned_output",
    engine="pyarrow",
    partition_cols=["year", "month"],
)

print("Data cleaning and partitioning completed successfully!")