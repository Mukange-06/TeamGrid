import os
import math
import numpy as np
import pandas as pd
import polars as pl
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# ── Load parquet once at startup ──────────────────────────────────────────────
PARQUET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "team_3.parquet")
df = pl.read_parquet(PARQUET).to_pandas()
# Normalise to tz-naive UTC so all comparisons work without timezone errors
df["datetime"] = pd.to_datetime(df["datetime"], utc=True).dt.tz_convert(None)
df["date"] = df["datetime"].dt.date
print(f"Loaded {len(df):,} rows from {PARQUET}")

app = FastAPI(title="Air Quality API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ── Helper: clean up NaN / inf before returning JSON ─────────────────────────
def to_records(frame: pd.DataFrame):
    frame = frame.replace([np.inf, -np.inf], np.nan)
    return [
        {k: (None if (isinstance(v, float) and math.isnan(v)) else v)
         for k, v in row.items()}
        for row in frame.to_dict(orient="records")
    ]


def health_label(avg):
    if avg <= 50:  return "Good"
    if avg <= 100: return "Moderate"
    if avg <= 150: return "Unhealthy for Sensitive Groups"
    if avg <= 200: return "Unhealthy"
    return "Hazardous"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/api/overview")
def overview():
    station_avg = df.groupby("station_id")["value"].mean()
    return {
        "totalStations":  int(df["station_id"].nunique()),
        "totalReadings":  int(len(df)),
        "totalCities":    int(df["city"].nunique()),
        "hazardousCount": int((station_avg > 200).sum()),
        "unhealthyCount": int(((station_avg > 150) & (station_avg <= 200)).sum()),
    }


@app.get("/api/realtime")
def realtime():
    latest = df["date"].max()
    recent = df[df["date"] == latest]
    grp = recent.groupby(["city", "pollutant"])["value"].agg(
        avg_value="mean", peak_value="max"
    ).reset_index()
    grp["avg_value"]  = grp["avg_value"].round(2)
    grp["peak_value"] = grp["peak_value"].round(2)
    return to_records(grp.sort_values("avg_value", ascending=False))


@app.get("/api/hourly-profile")
def hourly_profile(pollutant: str = Query("pm25")):
    sub = df[df["pollutant"] == pollutant].copy()
    sub["hour"] = sub["datetime"].dt.hour
    grp = sub.groupby("hour")["value"].agg(avg_value="mean", reading_count="count").reset_index()
    grp["avg_value"] = grp["avg_value"].round(2)
    return to_records(grp.sort_values("hour"))


@app.get("/api/monthly-trend")
def monthly_trend(pollutant: str = Query("pm25")):
    sub = df[df["pollutant"] == pollutant].copy()
    sub["year"]  = sub["datetime"].dt.year
    sub["month"] = sub["datetime"].dt.month
    grp = sub.groupby(["year", "month"])["value"].agg(
        avg_value="mean", max_value="max", min_value="min", reading_count="count"
    ).reset_index()
    for col in ["avg_value", "max_value", "min_value"]:
        grp[col] = grp[col].round(2)
    return to_records(grp.sort_values(["year", "month"]))


@app.get("/api/daily-trend")
def daily_trend(pollutant: str = Query("pm25"), days: int = Query(30)):
    sub = df[df["pollutant"] == pollutant]
    latest = sub["date"].max()
    # Use tz-naive Timestamp to match the normalised datetime column
    cutoff = pd.Timestamp(latest) - pd.Timedelta(days=days)
    sub = sub[sub["datetime"] >= cutoff]
    grp = sub.groupby("date")["value"].agg(
        avg_value="mean", peak_value="max", reading_count="count"
    ).reset_index()
    grp["avg_value"]  = grp["avg_value"].round(2)
    grp["peak_value"] = grp["peak_value"].round(2)
    grp["date"]       = grp["date"].astype(str)
    return to_records(grp.sort_values("date"))


@app.get("/api/station-profile")
def station_profile():
    grp = df.groupby(["station_name", "city", "state"])["value"].agg(
        avg_value="mean", reading_count="count"
    ).reset_index()
    grp["avg_value"]     = grp["avg_value"].round(2)
    grp["health_status"] = grp["avg_value"].apply(health_label)
    grp["pollution_rank"] = grp["avg_value"].rank(ascending=False, method="min").astype(int)
    return to_records(grp.sort_values("pollution_rank"))


@app.get("/api/pollutant-profile")
def pollutant_profile():
    rows = []
    for pollutant, sub in df.groupby("pollutant"):
        vals = sub["value"].dropna()
        row = {
            "pollutant":      pollutant,
            "avg":            round(float(vals.mean()),   2),
            "min":            round(float(vals.min()),    2),
            "max":            round(float(vals.max()),    2),
            "stddev":         round(float(vals.std()),    2),
            "p50":            round(float(vals.quantile(0.50)), 2),
            "p95":            round(float(vals.quantile(0.95)), 2),
            "corr_temp":      None,
            "corr_humidity":  None,
            "corr_wind":      None,
        }
        for col, key in [("at_c", "corr_temp"), ("rh_percent", "corr_humidity"), ("ws_m_s", "corr_wind")]:
            try:
                pair = sub[["value", col]].dropna()
                if len(pair) > 1:
                    c = pair["value"].corr(pair[col])
                    row[key] = None if (math.isnan(c) or math.isinf(c)) else round(float(c), 4)
            except Exception:
                pass
        rows.append(row)
    return sorted(rows, key=lambda r: r["pollutant"])


@app.get("/api/city-pollution")
def city_pollution():
    grp = df.groupby(["city", "pollutant"])["value"].agg(
        avg_value="mean", peak_value="max", total_measurements="count"
    ).reset_index()
    grp["avg_value"]  = grp["avg_value"].round(2)
    grp["peak_value"] = grp["peak_value"].round(2)
    return to_records(grp.sort_values("avg_value", ascending=False))


@app.get("/api/weather-scatter")
def weather_scatter(pollutant: str = Query("pm25")):
    sub = df[df["pollutant"] == pollutant][["at_c", "ws_m_s", "value"]].dropna()
    if len(sub) > 5000:
        sub = sub.sample(5000, random_state=42)
    sub = sub.round(2)
    return to_records(sub.reset_index(drop=True))


# ── Serve dashboard static files ──────────────────────────────────────────────
DASHBOARD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboard")
app.mount("/", StaticFiles(directory=DASHBOARD, html=True), name="dashboard")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=3000, reload=False)
