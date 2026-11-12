"""Renewable forecasting and battery storage planner (D8).

Forecasts are *estimated* from the bundled sample weather dataset.  They are
never presented as measured generation.  Actual data can only come from a
future approved grid/meter integration.
"""

from __future__ import annotations

import math
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import distinct, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import BadRequestError, NotFoundError
from app.models.green_grid import GenerationForecast, StorageRecommendation, WeatherForecast
from app.models.user import User, UserRole
from app.services import weather_provider
from app.services.audit_service import record_audit
from app.services.ingestion.service import seed_weather_data

SOLAR_PERFORMANCE_RATIO = 0.75
WIND_CUT_IN_MS = 3.0
WIND_RATED_MS = 12.0
WIND_CUT_OUT_MS = 25.0
WIND_MAX_CAPACITY_FACTOR = 0.42
BATTERY_ROUND_TRIP_EFFICIENCY = 0.92
BATTERY_DEPTH_OF_DISCHARGE = 0.90
BATTERY_RESERVE_FRACTION = 0.10
BATTERY_COST_PER_KWH = 18000.0
DAYTIME_DEMAND_SHARE = 0.45
NIGHT_DEMAND_SHARE = 0.55


def locations(db: Session) -> dict[str, Any]:
    rows = db.execute(
        select(
            WeatherForecast.location,
            WeatherForecast.state,
        )
        .distinct()
        .order_by(WeatherForecast.location)
    ).all()
    return {
        "items": [
            {"location": location, "state": state}
            for location, state in rows
        ],
        "total": len(rows),
        "live_weather": {
            "provider": weather_provider.SOURCE_NAME,
            "provider_url": weather_provider.SOURCE_URL,
            "enabled": settings.forecast_live_weather_enabled,
            "supported_locations": [
                item["location"] for item in weather_provider.supported_locations()
            ],
            "note": (
                "Live daily weather is requested from Open-Meteo at forecast time. "
                "If the provider is unreachable the response falls back to the "
                "bundled sample template and is labelled SAMPLE_TEMPLATE."
            ),
        },
        "is_sample": True,
        "note": "Bundled sample weather templates, not a live weather service.",
    }


def _wind_capacity_factor(speed: float) -> float:
    if speed < WIND_CUT_IN_MS or speed > WIND_CUT_OUT_MS:
        return 0.0
    ratio = (speed - WIND_CUT_IN_MS) / (WIND_RATED_MS - WIND_CUT_IN_MS)
    return min(1.0, ratio**3) * WIND_MAX_CAPACITY_FACTOR


def _weather_rows(db: Session, location: str) -> list[WeatherForecast]:
    today = date.today()
    rows = db.scalars(
        select(WeatherForecast)
        .where(
            WeatherForecast.location == location,
            WeatherForecast.forecast_date >= today,
        )
        .order_by(WeatherForecast.forecast_date)
        .limit(7)
    ).all()
    return rows


def _forecast_series(
    rows: list[Any], solar_kwp: float, wind_kwp: float
) -> list[dict[str, Any]]:
    series = []
    for row in rows:
        solar_generation = (
            solar_kwp
            * row.irradiance_kwh_m2_day
            * SOLAR_PERFORMANCE_RATIO
        )
        wind_generation = (
            wind_kwp * _wind_capacity_factor(row.wind_speed_ms) * 24
        )
        series.append(
            {
                "date": row.forecast_date,
                "temperature_c": row.temperature_c,
                "irradiance_kwh_m2_day": row.irradiance_kwh_m2_day,
                "wind_speed_ms": row.wind_speed_ms,
                "cloud_cover_pct": row.cloud_cover_pct,
                "solar_generation_kwh": round(solar_generation, 2),
                "wind_generation_kwh": round(wind_generation, 2),
                "total_generation_kwh": round(solar_generation + wind_generation, 2),
                "is_estimated": True,
            }
        )
    return series


def _resolve_weather(
    db: Session, location: str
) -> tuple[list[Any], str, dict[str, Any], list[str]]:
    """Return (days, basis, source_block, notes).

    Live weather is attempted first.  Any failure falls back to the bundled
    sample template, and the caller labels the result accordingly.
    """

    notes: list[str] = []
    live = weather_provider.fetch_live_weather(location)
    if live is not None:
        return (
            live.days,
            "LIVE_WEATHER",
            {
                "name": live.source_name,
                "url": live.source_url,
                "status": "LIVE",
                "retrieved_at": live.retrieved_at,
                "request_url": live.request_url,
                "note": "Daily weather retrieved from Open-Meteo.",
            },
            list(live.notes),
        )

    rows = _weather_rows(db, location)
    reason = (
        "Live weather is disabled in configuration."
        if not settings.forecast_live_weather_enabled
        else "The live weather provider was unavailable for this request."
    )
    notes.append(reason)
    return (
        rows,
        "SAMPLE_TEMPLATE",
        {
            "name": "Bundled sample weather template",
            "url": None,
            "status": "SAMPLE",
            "retrieved_at": None,
            "request_url": None,
            "note": (
                "Illustrative climatology-style template shipped with the "
                "platform. Not a numerical weather prediction."
            ),
        },
        notes,
    )


def estimate(
    db: Session,
    user: User,
    payload: dict[str, Any],
) -> dict[str, Any]:
    location = str(payload.get("location", "")).strip()
    solar_kwp = float(payload.get("solar_kwp", 0))
    wind_kwp = float(payload.get("wind_kwp", 0))
    daily_consumption = float(payload["daily_consumption_kwh"])
    desired_backup_hours = float(payload.get("backup_hours", 4))

    if not location:
        raise BadRequestError("Select a forecast location.")
    if solar_kwp < 0 or wind_kwp < 0:
        raise BadRequestError("Installed capacity cannot be negative.")
    if solar_kwp == 0 and wind_kwp == 0:
        raise BadRequestError("Enter at least one solar or wind capacity.")
    if daily_consumption <= 0:
        raise BadRequestError("Daily consumption must be greater than zero.")
    if desired_backup_hours < 0 or desired_backup_hours > 24:
        raise BadRequestError("Backup hours must be between 0 and 24.")

    rows, forecast_basis, data_source, weather_notes = _resolve_weather(db, location)
    if not rows:
        raise NotFoundError(
            "No forecast is available for this location.",
            details={
                "location": location,
                "live_weather_enabled": settings.forecast_live_weather_enabled,
            },
        )

    state = getattr(rows[0], "state", "") or ""
    series = _forecast_series(rows, solar_kwp, wind_kwp)
    dates = [row.forecast_date for row in rows]
    existing = db.scalars(
        select(GenerationForecast).where(
            GenerationForecast.user_id == user.id,
            GenerationForecast.location == location,
            GenerationForecast.forecast_date.in_(dates),
            GenerationForecast.solar_kwp == solar_kwp,
            GenerationForecast.wind_kwp == wind_kwp,
        )
    ).all()
    for item in existing:
        db.delete(item)

    for item in series:
        db.add(
            GenerationForecast(
                user_id=user.id,
                location=location,
                state=state,
                forecast_date=item["date"],
                solar_kwp=solar_kwp,
                wind_kwp=wind_kwp,
                solar_generation_kwh=item["solar_generation_kwh"],
                wind_generation_kwh=item["wind_generation_kwh"],
                method=(
                    "live_weather_open_meteo"
                    if forecast_basis == "LIVE_WEATHER"
                    else "sample_weather_template"
                ),
                is_estimated=True,
            )
        )

    average_daily_generation = sum(
        item["total_generation_kwh"] for item in series
    ) / len(series)
    daytime_demand = daily_consumption * DAYTIME_DEMAND_SHARE
    night_demand = daily_consumption * NIGHT_DEMAND_SHARE
    solar_surplus = max(0.0, average_daily_generation - daytime_demand)
    average_hourly_load = daily_consumption / 24
    backup_energy = average_hourly_load * desired_backup_hours

    energy_target = max(backup_energy, night_demand * 0.60)
    usable_required = energy_target / (
        BATTERY_DEPTH_OF_DISCHARGE * BATTERY_ROUND_TRIP_EFFICIENCY
    )
    usable_required = usable_required / (1 - BATTERY_RESERVE_FRACTION)
    recommended_battery = max(0.5, math.ceil(usable_required * 2) / 2)
    backup_duration = (
        recommended_battery
        * BATTERY_DEPTH_OF_DISCHARGE
        * BATTERY_ROUND_TRIP_EFFICIENCY
        * (1 - BATTERY_RESERVE_FRACTION)
        / average_hourly_load
    )
    backup_duration = round(min(24.0, backup_duration), 2)
    stored_energy = min(
        solar_surplus * BATTERY_ROUND_TRIP_EFFICIENCY,
        recommended_battery
        * BATTERY_DEPTH_OF_DISCHARGE
        * (1 - BATTERY_RESERVE_FRACTION),
    )
    evening_grid_import_without = night_demand
    evening_grid_import_with = max(0.0, night_demand - stored_energy)
    estimated_cost = recommended_battery * BATTERY_COST_PER_KWH
    coverage_pct = (
        min(
            100.0,
            (daytime_demand + min(solar_surplus, night_demand))
            / average_daily_generation
            * 100,
        )
        if average_daily_generation
        else 0.0
    )

    assumptions = {
        "solar_performance_ratio": SOLAR_PERFORMANCE_RATIO,
        "wind_power_curve": {
            "cut_in_ms": WIND_CUT_IN_MS,
            "rated_ms": WIND_RATED_MS,
            "cut_out_ms": WIND_CUT_OUT_MS,
            "max_capacity_factor": WIND_MAX_CAPACITY_FACTOR,
        },
        "battery_round_trip_efficiency": BATTERY_ROUND_TRIP_EFFICIENCY,
        "battery_depth_of_discharge": BATTERY_DEPTH_OF_DISCHARGE,
        "battery_reserve_fraction": BATTERY_RESERVE_FRACTION,
        "battery_cost_per_kwh_inr": BATTERY_COST_PER_KWH,
        "daytime_demand_share": DAYTIME_DEMAND_SHARE,
        "night_demand_share": NIGHT_DEMAND_SHARE,
        "forecast_basis": forecast_basis,
        "forecast_method": (
            "Open-Meteo daily weather + engineering performance model"
            if forecast_basis == "LIVE_WEATHER"
            else "Bundled sample weather template (estimated)"
        ),
        "disclaimer": (
            "Estimated only. Weather inputs are "
            + (
                "live daily Open-Meteo data, but the generation conversion is an "
                "engineering model rather than metered output."
                if forecast_basis == "LIVE_WEATHER"
                else "a bundled sample template, not a live numerical weather "
                "prediction. Actual generation and backup duration will differ."
            )
        ),
    }

    record = StorageRecommendation(
        user_id=user.id,
        location=location,
        state=state,
        daily_consumption_kwh=daily_consumption,
        solar_kwp=solar_kwp,
        wind_kwp=wind_kwp,
        recommended_battery_kwh=round(recommended_battery, 2),
        backup_hours=backup_duration,
        estimated_cost=round(estimated_cost, 2),
        assumptions=assumptions,
        is_estimate=True,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    record_audit(
        db,
        user,
        action="storage_recommendation_created",
        module="forecast",
        entity_type="StorageRecommendation",
        entity_id=record.id,
        description=(
            f"Storage estimate for {location}: "
            f"{recommended_battery:.1f} kWh / {backup_duration:.1f} h backup."
        ),
    )

    return {
        "id": record.id,
        "location": location,
        "state": state,
        "inputs": {
            "solar_kwp": solar_kwp,
            "wind_kwp": wind_kwp,
            "daily_consumption_kwh": daily_consumption,
            "desired_backup_hours": desired_backup_hours,
        },
        "forecast": series,
        "forecast_type": "ESTIMATED",
        "forecast_type_note": (
            "Generation is an engineering estimate in all cases. Forecast basis "
            "records whether the weather inputs were live or template-based."
        ),
        "forecast_basis": forecast_basis,
        "forecast_period": {
            "start": dates[0],
            "end": dates[-1],
            "days": len(dates),
            "description": "Seven-day daily generation estimate",
        },
        "data_source": data_source,
        "methodology": {
            "solar": (
                "installed_kwp x daily_irradiance_kwh_m2_day x performance_ratio"
            ),
            "wind": (
                "installed_kwp x wind_power_curve_capacity_factor x 24 hours"
            ),
            "battery": (
                "usable_energy = backup_energy / (depth_of_discharge x "
                "round_trip_efficiency x (1 - reserve_fraction))"
            ),
            "weather_notes": weather_notes,
        },
        "forecast_summary": {
            "average_daily_generation_kwh": round(average_daily_generation, 2),
            "peak_daily_generation_kwh": round(
                max(item["total_generation_kwh"] for item in series), 2
            ),
            "average_solar_generation_kwh": round(
                sum(item["solar_generation_kwh"] for item in series) / len(series), 2
            ),
            "average_wind_generation_kwh": round(
                sum(item["wind_generation_kwh"] for item in series) / len(series), 2
            ),
            "daily_consumption_kwh": daily_consumption,
            "self_sufficiency_pct": round(
                min(100.0, average_daily_generation / daily_consumption * 100), 2
            ),
            "daytime_demand_kwh": round(daytime_demand, 2),
            "night_demand_kwh": round(night_demand, 2),
            "solar_surplus_kwh": round(solar_surplus, 2),
            "estimated_solar_coverage_pct": round(coverage_pct, 2),
        },
        "generation_estimates": {
            "daily": [
                {
                    "date": item["date"],
                    "solar_generation_kwh": item["solar_generation_kwh"],
                    "wind_generation_kwh": item["wind_generation_kwh"],
                    "total_generation_kwh": item["total_generation_kwh"],
                }
                for item in series
            ],
            "seven_day_total_kwh": round(
                sum(item["total_generation_kwh"] for item in series), 2
            ),
            "seven_day_solar_kwh": round(
                sum(item["solar_generation_kwh"] for item in series), 2
            ),
            "seven_day_wind_kwh": round(
                sum(item["wind_generation_kwh"] for item in series), 2
            ),
            "unit": "kWh",
        },
        "storage": {
            "recommended_battery_kwh": round(recommended_battery, 2),
            "usable_energy_kwh": round(
                recommended_battery
                * BATTERY_DEPTH_OF_DISCHARGE
                * (1 - BATTERY_RESERVE_FRACTION),
                2,
            ),
            "backup_hours": backup_duration,
            "depth_of_discharge": BATTERY_DEPTH_OF_DISCHARGE,
            "round_trip_efficiency": BATTERY_ROUND_TRIP_EFFICIENCY,
            "reserve_fraction": BATTERY_RESERVE_FRACTION,
            "reserve_capacity_kwh": round(
                recommended_battery * BATTERY_RESERVE_FRACTION, 2
            ),
            "estimated_cost": round(estimated_cost, 2),
            "cost_per_kwh": BATTERY_COST_PER_KWH,
            "stored_solar_energy_kwh": round(stored_energy, 2),
            "evening_grid_import_without_storage_kwh": round(
                evening_grid_import_without, 2
            ),
            "evening_grid_import_with_storage_kwh": round(
                evening_grid_import_with, 2
            ),
            "evening_grid_reduction_pct": round(
                (evening_grid_import_without - evening_grid_import_with)
                / evening_grid_import_without
                * 100,
                2,
            )
            if evening_grid_import_without
            else 0.0,
        },
        "assumptions": assumptions,
        "is_estimated": True,
        "created_at": record.created_at,
    }


def history(db: Session, user: User, limit: int = 10) -> dict[str, Any]:
    statement = (
        select(StorageRecommendation)
        .order_by(StorageRecommendation.created_at.desc())
        .limit(limit)
    )
    if user.role != UserRole.ADMIN:
        statement = statement.where(StorageRecommendation.user_id == user.id)
    records = db.scalars(statement).all()
    return {
        "items": [
            {
                "id": record.id,
                "location": record.location,
                "state": record.state,
                "daily_consumption_kwh": record.daily_consumption_kwh,
                "solar_kwp": record.solar_kwp,
                "wind_kwp": record.wind_kwp,
                "recommended_battery_kwh": record.recommended_battery_kwh,
                "backup_hours": record.backup_hours,
                "estimated_cost": record.estimated_cost,
                "forecast_basis": (record.assumptions or {}).get("forecast_basis"),
                "is_estimate": record.is_estimate,
                "created_at": record.created_at,
            }
            for record in records
        ],
        "total": len(records),
    }


def refresh_sample_forecasts(db: Session) -> dict[str, Any]:
    count = seed_weather_data(db)
    return {
        "status": "success",
        "records": count,
        "message": (
            "Sample 7-day forecast refreshed. Data remains clearly labelled "
            "as estimated/sample."
        ),
        "refreshed_at": datetime.now(timezone.utc),
    }
