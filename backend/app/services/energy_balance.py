"""Hourly energy-balance engine for SolarTwin.

Flow rule (no battery in this phase):

1. Common-area demand is served by solar first.
2. The remaining solar is offered to apartments.
3. Any solar left after both is surplus.
4. Any demand left after solar is imported from the grid.

The engine is a pure pandas calculation over records loaded from PostgreSQL, so
every reported number is derived from the stored readings rather than from
hard-coded assumptions.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.common_consumption import CommonConsumption
from app.models.meter_reading import MeterReading
from app.models.solar_generation import SolarGeneration

BALANCE_VALUE_COLUMNS = (
    "total_solar_generation_kwh",
    "total_apartment_consumption_kwh",
    "total_common_consumption_kwh",
    "total_building_demand_kwh",
    "common_solar_utilization_kwh",
    "remaining_solar_after_common_kwh",
    "solar_to_apartments_kwh",
    "total_solar_utilized_kwh",
    "surplus_solar_kwh",
    "grid_import_kwh",
    "solar_utilization_percentage",
    "apartment_solar_coverage_percentage",
    "common_solar_coverage_percentage",
)

INTERNAL_COLUMNS = (
    "reading_time",
    "solar_kwh",
    "apartment_kwh",
    "common_kwh",
    "common_solar_kwh",
    "remaining_after_common_kwh",
    "apartment_solar_kwh",
    "utilized_kwh",
    "surplus_kwh",
    "grid_import_kwh",
    "solar_utilization_pct",
    "apartment_solar_coverage_pct",
    "common_solar_coverage_pct",
)

CONSERVATION_TOLERANCE_KWH = 1e-6


def _energy_frame(rows: list[Any], label: str) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame({"reading_time": pd.Series(dtype="datetime64[ns, UTC]"), "energy_kwh": pd.Series(dtype=float)})
    frame = pd.DataFrame(rows, columns=["reading_time", "energy_kwh"])
    frame["reading_time"] = pd.to_datetime(frame["reading_time"], utc=True)
    frame["energy_kwh"] = frame["energy_kwh"].astype(float)
    frame = frame.rename(columns={"energy_kwh": label})
    return frame


def _safe_percentage(numerator: pd.Series | np.ndarray, denominator: pd.Series | np.ndarray) -> np.ndarray:
    numerator_array = np.asarray(numerator, dtype=float)
    denominator_array = np.asarray(denominator, dtype=float)
    result = np.zeros_like(numerator_array, dtype=float)
    np.divide(
        numerator_array * 100.0,
        denominator_array,
        out=result,
        where=denominator_array > 1e-12,
    )
    return np.clip(result, 0.0, 100.0)


def _prepare_series(frame: pd.DataFrame, label: str) -> pd.DataFrame:
    """Normalise an hourly frame to ``reading_time`` + a named energy column."""

    if "reading_time" not in frame.columns:
        raise ValueError("Energy frames must include a reading_time column.")
    if label in frame.columns:
        values = frame[label]
    elif "energy_kwh" in frame.columns:
        values = frame["energy_kwh"]
    else:
        raise ValueError(f"Energy frame must include {label!r} or 'energy_kwh'.")
    prepared = pd.DataFrame(
        {
            "reading_time": pd.to_datetime(frame["reading_time"], utc=True),
            label: pd.to_numeric(values, errors="coerce").fillna(0.0).astype(float),
        }
    )
    return prepared


def build_balance_frame(
    solar: pd.DataFrame,
    apartments: pd.DataFrame,
    common: pd.DataFrame,
) -> pd.DataFrame:
    """Merge already-aggregated hourly frames and apply the energy-flow rule.

    Each input frame must contain ``reading_time`` plus either ``energy_kwh`` or
    the specific ``solar_kwh`` / ``apartment_kwh`` / ``common_kwh`` column.
    The result contains one row per interval present in any source.
    """

    solar_frame = _prepare_series(solar, "solar_kwh")
    apartment_frame = _prepare_series(apartments, "apartment_kwh")
    common_frame = _prepare_series(common, "common_kwh")

    merged = solar_frame.merge(apartment_frame, on="reading_time", how="outer")
    merged = merged.merge(common_frame, on="reading_time", how="outer")

    if merged.empty:
        return pd.DataFrame(columns=INTERNAL_COLUMNS)

    merged = merged.sort_values("reading_time").reset_index(drop=True)
    for column in ("solar_kwh", "apartment_kwh", "common_kwh"):
        merged[column] = merged[column].fillna(0.0).astype(float)
        if (merged[column] < -CONSERVATION_TOLERANCE_KWH).any():
            raise ValueError(f"Negative energy reading encountered in {column}.")

    solar_values = merged["solar_kwh"].to_numpy(dtype=float)
    apartment_values = merged["apartment_kwh"].to_numpy(dtype=float)
    common_values = merged["common_kwh"].to_numpy(dtype=float)

    common_solar = np.minimum(common_values, solar_values)
    remaining_after_common = solar_values - common_solar
    apartment_solar = np.minimum(apartment_values, remaining_after_common)
    surplus = remaining_after_common - apartment_solar
    utilized = common_solar + apartment_solar
    grid_import = (common_values - common_solar) + (apartment_values - apartment_solar)

    merged["common_solar_kwh"] = common_solar
    merged["remaining_after_common_kwh"] = remaining_after_common
    merged["apartment_solar_kwh"] = apartment_solar
    merged["utilized_kwh"] = utilized
    merged["surplus_kwh"] = surplus
    merged["grid_import_kwh"] = grid_import
    merged["solar_utilization_pct"] = _safe_percentage(utilized, solar_values)
    merged["apartment_solar_coverage_pct"] = _safe_percentage(
        apartment_solar, apartment_values
    )
    merged["common_solar_coverage_pct"] = _safe_percentage(common_solar, common_values)
    return merged[list(INTERNAL_COLUMNS)]


def empty_balance_frame() -> pd.DataFrame:
    return pd.DataFrame(columns=INTERNAL_COLUMNS)


def _summarise_frame(frame: pd.DataFrame) -> dict[str, float | int | bool]:
    if frame.empty:
        solar = np.array([], dtype=float)
        apartment = np.array([], dtype=float)
        common = np.array([], dtype=float)
        utilized = np.array([], dtype=float)
        surplus = np.array([], dtype=float)
        grid_import = np.array([], dtype=float)
        common_solar = np.array([], dtype=float)
        apartment_solar = np.array([], dtype=float)
        remaining_after_common = np.array([], dtype=float)
    else:
        solar = frame["solar_kwh"].to_numpy(dtype=float)
        apartment = frame["apartment_kwh"].to_numpy(dtype=float)
        common = frame["common_kwh"].to_numpy(dtype=float)
        utilized = frame["utilized_kwh"].to_numpy(dtype=float)
        surplus = frame["surplus_kwh"].to_numpy(dtype=float)
        grid_import = frame["grid_import_kwh"].to_numpy(dtype=float)
        common_solar = frame["common_solar_kwh"].to_numpy(dtype=float)
        apartment_solar = frame["apartment_solar_kwh"].to_numpy(dtype=float)
        remaining_after_common = frame["remaining_after_common_kwh"].to_numpy(
            dtype=float
        )

    total_solar = float(solar.sum())
    total_apartment = float(apartment.sum())
    total_common = float(common.sum())
    total_building = total_apartment + total_common
    utilized_total = float(utilized.sum())
    surplus_total = float(surplus.sum())
    grid_total = float(grid_import.sum())

    solar_error = (
        float(np.max(np.abs(solar - utilized - surplus))) if solar.size else 0.0
    )
    demand_error = (
        float(np.max(np.abs((apartment + common) - utilized - grid_import)))
        if solar.size
        else 0.0
    )
    max_error = max(solar_error, demand_error)

    return {
        "total_solar_generation_kwh": round(total_solar, 4),
        "total_apartment_consumption_kwh": round(total_apartment, 4),
        "total_common_consumption_kwh": round(total_common, 4),
        "total_building_demand_kwh": round(total_building, 4),
        "common_solar_utilization_kwh": round(float(common_solar.sum()), 4),
        "remaining_solar_after_common_kwh": round(
            float(remaining_after_common.sum()), 4
        ),
        "solar_to_apartments_kwh": round(float(apartment_solar.sum()), 4),
        "total_solar_utilized_kwh": round(utilized_total, 4),
        "surplus_solar_kwh": round(surplus_total, 4),
        "grid_import_kwh": round(grid_total, 4),
        "solar_utilization_percentage": round(
            float(_safe_percentage(np.array([utilized_total]), np.array([total_solar]))[0]),
            2,
        ),
        "apartment_solar_coverage_percentage": round(
            float(
                _safe_percentage(
                    np.array([float(apartment_solar.sum())]),
                    np.array([total_apartment]),
                )[0]
            ),
            2,
        ),
        "common_solar_coverage_percentage": round(
            float(
                _safe_percentage(
                    np.array([float(common_solar.sum())]), np.array([total_common])
                )[0]
            ),
            2,
        ),
        "hour_count": int(len(frame)),
        "conservation_ok": bool(
            max_error <= CONSERVATION_TOLERANCE_KWH
            and abs(total_solar - utilized_total - surplus_total)
            <= CONSERVATION_TOLERANCE_KWH
            and abs(total_building - utilized_total - grid_total)
            <= CONSERVATION_TOLERANCE_KWH
        ),
        "max_conservation_error_kwh": round(max_error, 9),
    }


def summarise_balance(frame: pd.DataFrame) -> dict[str, float | int | bool]:
    """Return totals, percentages and conservation checks for a balance frame."""

    return _summarise_frame(frame)


def balance_points(frame: pd.DataFrame) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []
    for row in frame.itertuples(index=False):
        points.append(
            {
                "reading_time": row.reading_time,
                "total_solar_generation_kwh": round(float(row.solar_kwh), 4),
                "total_apartment_consumption_kwh": round(float(row.apartment_kwh), 4),
                "total_common_consumption_kwh": round(float(row.common_kwh), 4),
                "total_building_demand_kwh": round(
                    float(row.apartment_kwh + row.common_kwh), 4
                ),
                "common_solar_utilization_kwh": round(
                    float(row.common_solar_kwh), 4
                ),
                "remaining_solar_after_common_kwh": round(
                    float(row.remaining_after_common_kwh), 4
                ),
                "solar_to_apartments_kwh": round(float(row.apartment_solar_kwh), 4),
                "total_solar_utilized_kwh": round(float(row.utilized_kwh), 4),
                "surplus_solar_kwh": round(float(row.surplus_kwh), 4),
                "grid_import_kwh": round(float(row.grid_import_kwh), 4),
                "solar_utilization_percentage": round(
                    float(row.solar_utilization_pct), 2
                ),
                "apartment_solar_coverage_percentage": round(
                    float(row.apartment_solar_coverage_pct), 2
                ),
                "common_solar_coverage_percentage": round(
                    float(row.common_solar_coverage_pct), 2
                ),
            }
        )
    return points


def grouped_balance(frame: pd.DataFrame, granularity: str) -> list[dict[str, Any]]:
    """Aggregate a balance frame into daily or monthly periods."""

    if frame.empty:
        return []
    working = frame.copy()
    if granularity == "daily":
        working["period"] = working["reading_time"].dt.strftime("%Y-%m-%d")
    elif granularity == "monthly":
        working["period"] = working["reading_time"].dt.strftime("%Y-%m")
    else:
        raise ValueError("granularity must be 'daily' or 'monthly'")

    results: list[dict[str, Any]] = []
    for period, group in working.groupby("period", sort=True):
        summary = _summarise_frame(group)
        summary.pop("hour_count", None)
        summary.pop("conservation_ok", None)
        summary.pop("max_conservation_error_kwh", None)
        results.append({"period": str(period), **summary})
    return results


def _conditions_for(
    column,
    date_from: date | None,
    date_to: date | None,
) -> list[Any]:
    conditions: list[Any] = []
    if date_from is not None:
        conditions.append(
            column >= datetime.combine(date_from, time.min, tzinfo=timezone.utc)
        )
    if date_to is not None:
        conditions.append(
            column
            < datetime.combine(
                date_to + timedelta(days=1), time.min, tzinfo=timezone.utc
            )
        )
    return conditions


def load_balance_frame(
    db: Session,
    run_id: int,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> pd.DataFrame:
    """Load and aggregate actual stored readings for a simulation run."""

    solar_stmt = (
        select(
            SolarGeneration.reading_time,
            func.sum(SolarGeneration.generation_kwh).label("energy_kwh"),
        )
        .where(SolarGeneration.simulation_run_id == run_id)
        .group_by(SolarGeneration.reading_time)
        .order_by(SolarGeneration.reading_time)
    )
    apartment_stmt = (
        select(
            MeterReading.reading_time,
            func.sum(MeterReading.consumption_kwh).label("energy_kwh"),
        )
        .where(MeterReading.simulation_run_id == run_id)
        .group_by(MeterReading.reading_time)
        .order_by(MeterReading.reading_time)
    )
    common_stmt = (
        select(
            CommonConsumption.reading_time,
            func.sum(CommonConsumption.consumption_kwh).label("energy_kwh"),
        )
        .where(CommonConsumption.simulation_run_id == run_id)
        .group_by(CommonConsumption.reading_time)
        .order_by(CommonConsumption.reading_time)
    )

    solar_conditions = _conditions_for(
        SolarGeneration.reading_time, date_from, date_to
    )
    apartment_conditions = _conditions_for(
        MeterReading.reading_time, date_from, date_to
    )
    common_conditions = _conditions_for(
        CommonConsumption.reading_time, date_from, date_to
    )
    if solar_conditions:
        solar_stmt = solar_stmt.where(*solar_conditions)
    if apartment_conditions:
        apartment_stmt = apartment_stmt.where(*apartment_conditions)
    if common_conditions:
        common_stmt = common_stmt.where(*common_conditions)

    solar = _energy_frame(db.execute(solar_stmt).all(), "solar_kwh")
    apartments = _energy_frame(db.execute(apartment_stmt).all(), "apartment_kwh")
    common = _energy_frame(db.execute(common_stmt).all(), "common_kwh")
    return build_balance_frame(solar, apartments, common)


def period_bounds(
    frame: pd.DataFrame,
) -> tuple[datetime | None, datetime | None]:
    if frame.empty:
        return None, None
    times = pd.to_datetime(frame["reading_time"], utc=True)
    return times.min().to_pydatetime(), times.max().to_pydatetime()
