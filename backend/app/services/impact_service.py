"""Environmental impact dashboard (D7)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.green_grid import (
    AirQualityReading,
    DataSource,
    EnvironmentalImpact,
    StateEnergyStatistic,
)
from app.services import ecosystem_analytics
from app.services.energy_service import energy_overview

TREES_PER_TONNE_CO2 = 1 / 21.77
CARS_OFF_ROAD_PER_TONNE_CO2 = 1 / 4.6

IMPACT_METHODOLOGY = {
    "co2_avoided": {
        "formula": "renewable_generation_mwh x emission_factor_tonnes_per_mwh",
        "emission_factor_tonnes_per_mwh": 0.71,
        "factor_source": (
            "Planning central grid emission factor used for indicative estimates; "
            "CEA publishes periodic grid emission factors that should be used for "
            "formal reporting."
        ),
        "classification": "ESTIMATED",
        "limitations": [
            "Uses an annual planning factor rather than hourly marginal emissions.",
            "Does not net off lifecycle emissions of renewable equipment.",
            "State figures are planning estimates, not metered measurements.",
        ],
    },
    "trees_equivalent": {
        "formula": "co2_avoided_tonnes / 21.77 kg CO2 per mature tree per year",
        "classification": "ESTIMATED_COMMUNICATION_ONLY",
    },
    "cars_off_road_equivalent": {
        "formula": "co2_avoided_tonnes / 4.6 tonnes CO2 per car per year",
        "classification": "ESTIMATED_COMMUNICATION_ONLY",
    },
    "air_quality": {
        "classification": "SAMPLE_OBSERVATION",
        "limitations": [
            "Bundled sample readings, not a live CPCB feed.",
            "City-level readings are not adjusted for local meteorology.",
        ],
    },
}


def overview(db: Session) -> dict[str, Any]:
    energy = energy_overview(db)
    impact_rows = db.scalars(
        select(EnvironmentalImpact)
        .where(EnvironmentalImpact.region == "India")
        .order_by(EnvironmentalImpact.year)
    ).all()
    series = [
        {
            "year": row.year,
            "co2_avoided_tonnes": round(row.co2_avoided_tonnes, 2),
            "renewable_generation_gwh": round(row.renewable_generation_gwh, 2),
            "trees_equivalent": round(row.trees_equivalent, 2),
            "is_estimated": row.is_estimated,
        }
        for row in impact_rows
    ]
    latest = series[-1] if series else None
    previous = series[-2] if len(series) > 1 else None
    growth_pct = None
    if latest and previous and previous["co2_avoided_tonnes"]:
        growth_pct = round(
            (
                latest["co2_avoided_tonnes"]
                - previous["co2_avoided_tonnes"]
            )
            / previous["co2_avoided_tonnes"]
            * 100,
            2,
        )

    latest_state_year = db.scalar(
        select(StateEnergyStatistic.year).order_by(StateEnergyStatistic.year.desc())
    )
    regional_rows = (
        db.scalars(
            select(StateEnergyStatistic)
            .where(StateEnergyStatistic.year == latest_state_year)
            .order_by(StateEnergyStatistic.total_renewable_mw.desc())
        ).all()
        if latest_state_year
        else []
    )
    regional = [
        {
            "state": row.state,
            "year": row.year,
            "solar_capacity_mw": round(row.solar_capacity_mw, 2),
            "wind_capacity_mw": round(row.wind_capacity_mw, 2),
            "total_renewable_mw": round(row.total_renewable_mw, 2),
            "co2_avoided_tonnes": round(row.co2_avoided_tonnes, 2),
            "air_quality_index": row.air_quality_index,
            "pm25": row.pm25,
            "is_estimated": row.is_estimated,
        }
        for row in regional_rows
    ]

    air_rows = db.scalars(
        select(AirQualityReading).order_by(AirQualityReading.measured_at.desc())
    ).all()
    seen: set[str] = set()
    air_quality: list[dict[str, Any]] = []
    for row in air_rows:
        if row.city in seen:
            continue
        seen.add(row.city)
        air_quality.append(
            {
                "city": row.city,
                "state": row.state,
                "aqi": row.aqi,
                "pm25": row.pm25,
                "pm10": row.pm10,
                "category": row.category,
                "measured_at": row.measured_at,
                "is_sample": row.is_sample,
            }
        )
    air_quality.sort(key=lambda item: item["aqi"], reverse=True)

    cpcb_source = db.scalar(
        select(DataSource).where(DataSource.code == "cpcb_air_quality")
    )
    latest_co2 = latest["co2_avoided_tonnes"] if latest else 0.0
    return {
        "summary": {
            "co2_avoided_tonnes": round(latest_co2, 2),
            "co2_avoided_million_tonnes": round(latest_co2 / 1_000_000, 3),
            "growth_pct": growth_pct,
            "renewable_generation_gwh": latest["renewable_generation_gwh"]
            if latest
            else 0.0,
            "renewable_share_pct": energy.get("totals", {}).get(
                "renewable_generation_share_pct"
            ),
            "renewable_capacity_share_pct": energy.get("totals", {}).get(
                "renewable_capacity_share_pct"
            ),
            "trees_equivalent": round(latest_co2 * TREES_PER_TONNE_CO2, 0)
            if latest
            else 0,
            "cars_off_road_equivalent": round(
                latest_co2 * CARS_OFF_ROAD_PER_TONNE_CO2, 0
            )
            if latest
            else 0,
            "regions_tracked": len(regional),
            "air_quality_cities": len(air_quality),
        },
        "historical": series,
        "regional": regional,
        "air_quality": air_quality,
        "air_quality_source": {
            "name": cpcb_source.name if cpcb_source else "CPCB",
            "status": cpcb_source.status if cpcb_source else "sample",
            "is_sample": True,
            "last_success_at": cpcb_source.last_success_at if cpcb_source else None,
            "disclaimer": (
                "Air-quality values are illustrative sample readings, not a live "
                "CPCB feed. Do not use for health or regulatory decisions."
            ),
        },
        "conversion_factors": {
            "co2_factor_tonnes_per_mwh": 0.71,
            "trees_per_tonne_co2": round(TREES_PER_TONNE_CO2, 6),
            "cars_off_road_per_tonne_co2": round(CARS_OFF_ROAD_PER_TONNE_CO2, 6),
        },
        "methodology": IMPACT_METHODOLOGY,
        "data_classification": {
            "co2_avoided_tonnes": "ESTIMATED",
            "renewable_generation_gwh": "SAMPLE",
            "renewable_share_pct": "SAMPLE",
            "state_indicators": "SAMPLE/ESTIMATED",
            "air_quality": "SAMPLE_OBSERVATION",
        },
        "measured_observations": {
            "air_quality_readings": len(air_quality),
            "description": (
                "Air-quality entries are the only observed measurements in this "
                "view. Emissions avoided, renewable generation and state "
                "indicators are calculated or supplied sample data."
            ),
        },
        "platform_ecosystem": ecosystem_analytics.snapshot(db),
        "is_estimated": True,
        "disclaimer": (
            "Avoided emissions are estimated from renewable generation using a "
            "planning emission factor. They are not measured or audited "
            "reductions. Air-quality readings are bundled sample observations, "
            "not a live CPCB feed."
        ),
        "generated_at": datetime.now(timezone.utc),
    }
