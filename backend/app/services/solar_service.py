"""Physical rooftop solar generation simulation.

The model is a clear-sky solar geometry approximation combined with seeded
weather variability.  It is deliberately conservative and bounded by the
installed capacity; it never produces nighttime or negative generation.
"""

from __future__ import annotations

from datetime import date, datetime

import numpy as np
import pandas as pd

SOLAR_LATITUDE_DEGREES = 13.08  # representative latitude for a South-Indian city
SOLAR_NOON_HOUR = 12.1
PANEL_LOSS_FACTOR = 0.66
MIN_GENERATION_KWH = 0.00005


def _as_utc_timestamp(value: date) -> pd.Timestamp:
    timestamp = pd.Timestamp(value)
    if timestamp.tzinfo is None:
        return timestamp.tz_localize("UTC")
    return timestamp.tz_convert("UTC")


def build_hourly_index(start_date: date, days: int) -> pd.DatetimeIndex:
    """Return a UTC hourly index covering ``days`` complete days."""

    if days <= 0:
        raise ValueError("Simulation days must be positive.")
    start = _as_utc_timestamp(start_date)
    return pd.date_range(start=start, periods=days * 24, freq="h", tz="UTC")


def _solar_geometry(times: pd.DatetimeIndex) -> tuple[np.ndarray, np.ndarray]:
    """Return the daylight elevation factor and the sunrise/sunset window."""

    day_of_year = times.dayofyear.to_numpy(dtype=float)
    declination = np.radians(
        23.45 * np.sin(np.radians(360.0 * (284.0 + day_of_year) / 365.0))
    )
    latitude = np.radians(SOLAR_LATITUDE_DEGREES)
    cos_hour_angle = np.clip(
        -np.tan(latitude) * np.tan(declination), -1.0, 1.0
    )
    daylight_hours = 2.0 * np.degrees(np.arccos(cos_hour_angle)) / 15.0
    sunrise = SOLAR_NOON_HOUR - daylight_hours / 2.0
    sunset = SOLAR_NOON_HOUR + daylight_hours / 2.0

    hour_midpoint = times.hour.to_numpy(dtype=float) + 0.5
    position = (hour_midpoint - sunrise) / (sunset - sunrise)
    elevation = np.sin(np.pi * np.clip(position, 0.0, 1.0))
    elevation = np.where(
        (hour_midpoint > sunrise) & (hour_midpoint < sunset),
        np.clip(elevation, 0.0, 1.0),
        0.0,
    )
    return elevation, daylight_hours


def _seasonal_weather_factor(month: int) -> float:
    # June-September is the monsoon period; November-February is clearer.
    if month in (6, 7, 8, 9):
        return 0.78
    if month in (11, 12, 1, 2):
        return 1.02
    return 1.0


def simulate_solar_generation(
    capacity_kwp: float,
    start_date: date,
    days: int = 30,
    seed: int = 360,
) -> pd.DataFrame:
    """Simulate hourly alternating-current solar generation in kWh.

    Returns a frame with ``reading_time``, ``generation_kwh``,
    ``capacity_kwp`` and ``weather_factor`` columns.  Generation is clipped to
    ``[0, capacity_kwp]`` and is exactly zero outside daylight hours.
    """

    if capacity_kwp <= 0:
        raise ValueError("Solar capacity must be greater than zero.")
    if days <= 0:
        raise ValueError("Simulation days must be positive.")
    if seed < 0:
        raise ValueError("Random seed must be non-negative.")

    times = build_hourly_index(start_date, days)
    rng = np.random.default_rng(seed)
    elevation, _ = _solar_geometry(times)

    first_day = times[0].normalize()
    day_index = (times.normalize() - first_day).days.to_numpy(dtype=int)
    months = times.month.to_numpy()

    # One weather draw per simulated day, then a smooth intra-day variation.
    daily_cloud = 0.50 + 0.50 * rng.beta(2.2, 1.3, size=days)
    daily_cloud = np.clip(daily_cloud, 0.35, 1.0)
    season = np.array(
        [_seasonal_weather_factor(int(month)) for month in pd.unique(months)],
        dtype=float,
    )
    month_lookup = {int(month): index for index, month in enumerate(pd.unique(months))}
    season_by_hour = np.array(
        [season[month_lookup[int(month)]] for month in months], dtype=float
    )

    hourly_noise = np.clip(
        rng.normal(loc=1.0, scale=0.045, size=len(times)), 0.84, 1.08
    )
    # Short passing-cloud dips on a minority of daylight hours.
    dip_mask = (rng.random(len(times)) < 0.10) & (elevation > 0)
    hourly_noise = np.where(dip_mask, hourly_noise * rng.uniform(0.65, 0.92), hourly_noise)

    weather_factor = np.clip(
        daily_cloud[day_index] * season_by_hour * hourly_noise, 0.0, 1.15
    )
    generation = capacity_kwp * PANEL_LOSS_FACTOR * np.power(
        np.clip(elevation, 0.0, 1.0), 1.25
    ) * weather_factor
    generation = np.where(elevation > 0, generation, 0.0)
    generation = np.clip(generation, 0.0, capacity_kwp)
    generation = np.where(generation < MIN_GENERATION_KWH, 0.0, generation)

    return pd.DataFrame(
        {
            "reading_time": times.to_pydatetime(),
            "generation_kwh": np.round(generation, 4),
            "capacity_kwp": float(capacity_kwp),
            "weather_factor": np.round(weather_factor, 4),
        }
    )


def solar_records(
    simulation_run_id: int,
    capacity_kwp: float,
    start_date: date,
    days: int,
    seed: int,
) -> list[dict[str, object]]:
    """Build bulk-insert dictionaries for the generation table."""

    frame = simulate_solar_generation(capacity_kwp, start_date, days, seed)
    return [
        {
            "simulation_run_id": simulation_run_id,
            "reading_time": row.reading_time.to_pydatetime()
            if isinstance(row.reading_time, pd.Timestamp)
            else row.reading_time,
            "generation_kwh": float(row.generation_kwh),
            "capacity_kwp": float(row.capacity_kwp),
            "weather_factor": float(row.weather_factor),
        }
        for row in frame.itertuples(index=False)
    ]


def expected_solar_hours(days: int) -> int:
    return days * 24


def is_nighttime(value: datetime) -> bool:
    """Convenience predicate used by tests and diagnostics (UTC hours)."""

    return value.hour < 6 or value.hour >= 18
