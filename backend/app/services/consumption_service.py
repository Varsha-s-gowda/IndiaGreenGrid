"""Apartment and common-area electricity consumption simulation."""

from __future__ import annotations

from datetime import date
from typing import Sequence

import numpy as np
import pandas as pd

from app.models.apartment import CONSUMPTION_PROFILES, Apartment
from app.models.common_consumption import CommonAreaCategory
from app.services.solar_service import build_hourly_index

PROFILE_HOURLY_SHAPES: dict[str, tuple[float, ...]] = {
    "LOW": (
        0.28, 0.25, 0.22, 0.22, 0.25, 0.40, 0.85, 1.25,
        1.35, 1.05, 0.85, 0.80, 0.85, 0.80, 0.75, 0.80,
        0.95, 1.35, 1.90, 2.10, 1.95, 1.50, 0.85, 0.45,
    ),
    "MEDIUM": (
        0.38, 0.33, 0.30, 0.30, 0.34, 0.55, 1.15, 1.65,
        1.60, 1.15, 0.95, 0.95, 1.05, 0.95, 0.90, 1.00,
        1.20, 1.65, 2.25, 2.45, 2.25, 1.70, 1.00, 0.55,
    ),
    "HIGH": (
        0.48, 0.42, 0.38, 0.38, 0.42, 0.62, 1.15, 1.55,
        1.60, 1.45, 1.45, 1.55, 1.65, 1.55, 1.50, 1.50,
        1.60, 1.95, 2.35, 2.50, 2.35, 1.90, 1.20, 0.70,
    ),
    "WORK_FROM_HOME": (
        0.40, 0.35, 0.32, 0.32, 0.36, 0.55, 1.05, 1.45,
        1.80, 1.95, 2.00, 1.95, 1.85, 1.90, 1.95, 2.00,
        1.90, 1.85, 2.15, 2.30, 2.10, 1.60, 0.95, 0.55,
    ),
    "NIGHT_HEAVY": (
        1.55, 1.40, 1.20, 1.05, 0.85, 0.65, 0.70, 0.85,
        1.00, 0.95, 0.85, 0.80, 0.80, 0.80, 0.85, 0.95,
        1.15, 1.55, 2.00, 2.35, 2.55, 2.40, 2.15, 1.85,
    ),
}

PROFILE_DAILY_KWH = {
    "LOW": 4.0,
    "MEDIUM": 7.5,
    "HIGH": 13.0,
    "WORK_FROM_HOME": 10.0,
    "NIGHT_HEAVY": 8.5,
}

COMMON_HOURLY_SHAPES: dict[str, tuple[float, ...]] = {
    CommonAreaCategory.LIFTS: (
        0.15, 0.12, 0.10, 0.10, 0.12, 0.30,
        0.75, 1.70, 2.30, 2.10, 1.10, 0.75,
        0.70, 0.75, 0.85, 1.00, 1.35, 1.75,
        2.10, 2.20, 1.95, 1.55, 0.75, 0.30,
    ),
    CommonAreaCategory.WATER_PUMPS: (
        0.12, 0.10, 0.10, 0.10, 0.15, 0.45,
        1.80, 2.90, 3.10, 2.40, 0.65, 0.50,
        0.85, 0.90, 0.80, 0.55, 0.70, 1.90,
        2.35, 2.10, 1.35, 0.55, 0.25, 0.15,
    ),
    CommonAreaCategory.CORRIDOR_LIGHTS: (
        2.30, 2.25, 2.20, 2.20, 2.15, 1.60,
        1.15, 0.45, 0.30, 0.25, 0.25, 0.25,
        0.25, 0.25, 0.25, 0.30, 0.45, 1.00,
        1.70, 2.05, 2.15, 2.15, 2.20, 2.30,
    ),
    CommonAreaCategory.SECURITY_SYSTEMS: (
        1.05, 1.05, 1.05, 1.05, 1.05, 1.05,
        1.00, 0.95, 0.90, 0.90, 0.90, 0.95,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.05,
        1.10, 1.10, 1.10, 1.10, 1.10, 1.05,
    ),
}

COMMON_DAILY_KWH = {
    CommonAreaCategory.LIFTS: 32.0,
    CommonAreaCategory.WATER_PUMPS: 26.0,
    CommonAreaCategory.CORRIDOR_LIGHTS: 11.0,
    CommonAreaCategory.SECURITY_SYSTEMS: 9.0,
}

COMMON_WEEKEND_FACTOR = {
    CommonAreaCategory.LIFTS: 1.08,
    CommonAreaCategory.WATER_PUMPS: 1.03,
    CommonAreaCategory.CORRIDOR_LIGHTS: 1.0,
    CommonAreaCategory.SECURITY_SYSTEMS: 1.0,
}

MIN_READING_KWH = 0.0001


def _normalised(shape: Sequence[float], label: str) -> np.ndarray:
    array = np.asarray(shape, dtype=float)
    if array.shape != (24,):
        raise ValueError(f"Hourly shape for {label!r} must contain 24 values.")
    mean = float(array.mean())
    if mean <= 0:
        raise ValueError(f"Hourly shape for {label!r} must have a positive mean.")
    return array / mean


_NORMALISED_PROFILE_SHAPES = {
    profile: _normalised(shape, profile)
    for profile, shape in PROFILE_HOURLY_SHAPES.items()
}
_NORMALISED_COMMON_SHAPES = {
    category: _normalised(shape, category)
    for category, shape in COMMON_HOURLY_SHAPES.items()
}


def _weekend_factor(times: pd.DatetimeIndex) -> np.ndarray:
    hours = times.hour.to_numpy(dtype=int)
    day_of_week = times.dayofweek.to_numpy(dtype=int)
    weekend = day_of_week >= 5
    daytime = (hours >= 8) & (hours <= 22)
    factor = np.ones(len(times), dtype=float)
    factor = np.where(weekend, 1.05, factor)
    factor = np.where(weekend & daytime, 1.11, factor)
    factor = np.where(weekend & ~daytime, 1.02, factor)
    return factor


def _clean(values: np.ndarray) -> np.ndarray:
    values = np.clip(values, 0.0, None)
    values = np.where(values < MIN_READING_KWH, 0.0, values)
    return np.round(values, 4)


def simulate_apartment_consumption(
    apartments: Sequence[Apartment],
    start_date: date,
    days: int = 30,
    seed: int = 360,
) -> pd.DataFrame:
    """Simulate one hourly reading per apartment for every hour of the period."""

    if not apartments:
        raise ValueError("At least one apartment is required.")
    if days <= 0:
        raise ValueError("Simulation days must be positive.")
    if seed < 0:
        raise ValueError("Random seed must be non-negative.")

    times = build_hourly_index(start_date, days)
    hours = times.hour.to_numpy(dtype=int)
    weekend_factor = _weekend_factor(times)

    frames: list[pd.DataFrame] = []
    for position, apartment in enumerate(apartments):
        profile = (apartment.consumption_profile or "MEDIUM").upper()
        if profile not in CONSUMPTION_PROFILES:
            raise ValueError(f"Unsupported consumption profile: {profile!r}")

        rng = np.random.default_rng(seed + apartment.id * 9_973 + position)
        residents = max(1, int(apartment.residents_count))
        residents_factor = min(1.65, 0.62 + 0.18 * residents)
        household_factor = float(
            np.clip(rng.lognormal(mean=0.0, sigma=0.14), 0.72, 1.32)
        )
        daily_kwh = (
            PROFILE_DAILY_KWH[profile] * residents_factor * household_factor
        )

        hourly_shape = _NORMALISED_PROFILE_SHAPES[profile][hours]
        noise = np.clip(rng.lognormal(mean=0.0, sigma=0.09, size=len(times)), 0.65, 1.45)
        spikes = rng.random(len(times)) < 0.012
        noise = np.where(spikes, noise * rng.uniform(1.25, 1.70), noise)

        consumption = daily_kwh / 24.0 * hourly_shape * weekend_factor * noise
        frames.append(
            pd.DataFrame(
                {
                    "apartment_id": apartment.id,
                    "reading_time": times,
                    "consumption_kwh": _clean(consumption),
                }
            )
        )

    return pd.concat(frames, ignore_index=True)


def simulate_common_consumption(
    start_date: date,
    days: int = 30,
    seed: int = 360,
) -> pd.DataFrame:
    """Simulate hourly consumption for each common-area load category."""

    if days <= 0:
        raise ValueError("Simulation days must be positive.")
    if seed < 0:
        raise ValueError("Random seed must be non-negative.")

    times = build_hourly_index(start_date, days)
    hours = times.hour.to_numpy(dtype=int)
    weekend_factor = _weekend_factor(times)

    frames: list[pd.DataFrame] = []
    for offset, category in enumerate(CommonAreaCategory.ALL):
        rng = np.random.default_rng(seed + 50_000 + offset * 7_919)
        shape = _NORMALISED_COMMON_SHAPES[category][hours]
        noise = np.clip(rng.lognormal(mean=0.0, sigma=0.06, size=len(times)), 0.80, 1.25)
        category_weekend = np.where(
            weekend_factor > 1.0,
            COMMON_WEEKEND_FACTOR[category],
            1.0,
        )
        consumption = (
            COMMON_DAILY_KWH[category] / 24.0 * shape * category_weekend * noise
        )
        frames.append(
            pd.DataFrame(
                {
                    "category": category,
                    "reading_time": times,
                    "consumption_kwh": _clean(consumption),
                }
            )
        )

    return pd.concat(frames, ignore_index=True)


def apartment_records(
    simulation_run_id: int,
    apartments: Sequence[Apartment],
    start_date: date,
    days: int,
    seed: int,
) -> list[dict[str, object]]:
    frame = simulate_apartment_consumption(apartments, start_date, days, seed)
    return [
        {
            "simulation_run_id": simulation_run_id,
            "apartment_id": int(row.apartment_id),
            "reading_time": row.reading_time.to_pydatetime(),
            "consumption_kwh": float(row.consumption_kwh),
        }
        for row in frame.itertuples(index=False)
    ]


def common_records(
    simulation_run_id: int,
    start_date: date,
    days: int,
    seed: int,
) -> list[dict[str, object]]:
    frame = simulate_common_consumption(start_date, days, seed)
    return [
        {
            "simulation_run_id": simulation_run_id,
            "category": str(row.category),
            "reading_time": row.reading_time.to_pydatetime(),
            "consumption_kwh": float(row.consumption_kwh),
        }
        for row in frame.itertuples(index=False)
    ]


def expected_apartment_readings(apartment_count: int, days: int) -> int:
    return apartment_count * days * 24


def expected_common_readings(days: int) -> int:
    return len(CommonAreaCategory.ALL) * days * 24
