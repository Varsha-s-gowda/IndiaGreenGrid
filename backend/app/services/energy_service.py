"""Renewable and conventional energy statistics aggregation (D1)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.green_grid import (
    DataSource,
    EnergySource,
    EnvironmentalImpact,
    NationalEnergyStatistic,
)

RENEWABLE_CODES = {"HYDRO", "SOLAR", "WIND", "BIOMASS", "SMALL_HYDRO", "OTHER_RE"}

ENERGY_SOURCE_SEED = [
    ("COAL", "Coal", "Conventional", "#475569", 10, False),
    ("LIGNITE", "Lignite", "Conventional", "#78716c", 20, False),
    ("GAS", "Natural Gas", "Conventional", "#a8a29e", 30, False),
    ("DIESEL", "Diesel", "Conventional", "#d6d3d1", 40, False),
    ("NUCLEAR", "Nuclear", "Conventional", "#7c3aed", 50, False),
    ("HYDRO", "Large Hydro", "Renewable", "#0284c7", 60, True),
    ("SOLAR", "Solar", "Renewable", "#f59e0b", 70, True),
    ("WIND", "Wind", "Renewable", "#0d9488", 80, True),
    ("BIOMASS", "Biomass & Bagasse", "Renewable", "#65a30d", 90, True),
    ("SMALL_HYDRO", "Small Hydro", "Renewable", "#06b6d4", 100, True),
    ("OTHER_RE", "Other Renewables", "Renewable", "#84cc16", 110, True),
]


def ensure_energy_sources(db: Session) -> dict[str, EnergySource]:
    existing = {source.code: source for source in db.scalars(select(EnergySource)).all()}
    for code, name, category, colour, order, renewable in ENERGY_SOURCE_SEED:
        source = existing.get(code)
        if source is None:
            source = EnergySource(
                code=code,
                name=name,
                category=category,
                color=colour,
                display_order=order,
                is_renewable=renewable,
            )
            db.add(source)
            existing[code] = source
        else:
            source.name = name
            source.category = category
            source.color = colour
            source.display_order = order
            source.is_renewable = renewable
    db.flush()
    return existing


def recompute_shares(db: Session, years: set[int] | None = None) -> None:
    """Recalculate capacity and generation shares from stored MW/GWh values."""

    if years is None:
        years = set(db.scalars(select(NationalEnergyStatistic.year).distinct()).all())

    for year in years:
        rows = db.scalars(
            select(NationalEnergyStatistic).where(NationalEnergyStatistic.year == year)
        ).all()
        total_capacity = sum(row.installed_capacity_mw for row in rows)
        total_generation = sum(row.generation_gwh for row in rows)
        for row in rows:
            row.capacity_share_pct = (
                round(row.installed_capacity_mw / total_capacity * 100, 3)
                if total_capacity
                else 0.0
            )
            row.generation_share_pct = (
                round(row.generation_gwh / total_generation * 100, 3)
                if total_generation
                else 0.0
            )
    db.flush()


def _source_meta(db: Session) -> dict[int, EnergySource]:
    return {source.id: source for source in db.scalars(select(EnergySource)).all()}


def _dataset_timestamp(db: Session) -> datetime | None:
    values = db.scalars(
        select(NationalEnergyStatistic.retrieved_at).where(
            NationalEnergyStatistic.retrieved_at.is_not(None)
        )
    ).all()
    return max(values) if values else None


def _source_freshness(db: Session) -> list[dict[str, Any]]:
    sources = db.scalars(
        select(DataSource).where(
            DataSource.code.in_(
                ["cea_installed_capacity", "grid_india_generation", "mnre_state_capacity", "cpcb_air_quality"]
            )
        )
    ).all()
    return [
        {
            "code": source.code,
            "name": source.name,
            "organization": source.organization,
            "status": source.status,
            "is_demo": source.is_demo,
            "last_success_at": source.last_success_at,
            "freshness_hours": source.freshness_hours,
            "record_count": source.record_count,
        }
        for source in sources
    ]


def energy_overview(db: Session, year: int | None = None) -> dict[str, Any]:
    years = sorted(
        set(db.scalars(select(NationalEnergyStatistic.year).distinct()).all())
    )
    if not years:
        return {
            "has_data": False,
            "available_years": [],
            "latest_year": None,
            "note": "No national energy statistics have been ingested yet.",
        }

    selected_year = year if year in years else years[-1]
    meta = _source_meta(db)
    rows = db.scalars(
        select(NationalEnergyStatistic).where(
            NationalEnergyStatistic.year == selected_year
        )
    ).all()
    rows.sort(key=lambda row: meta[row.energy_source_id].display_order if row.energy_source_id in meta else 999)

    def serialise(row: NationalEnergyStatistic) -> dict[str, Any]:
        source = meta.get(row.energy_source_id)
        return {
            "source_code": source.code if source else "UNKNOWN",
            "source_name": source.name if source else "Unknown",
            "category": source.category if source else "Unknown",
            "color": source.color if source else "#94a3b8",
            "is_renewable": bool(source.is_renewable) if source else False,
            "installed_capacity_mw": round(row.installed_capacity_mw, 2),
            "generation_gwh": round(row.generation_gwh, 2),
            "capacity_share_pct": row.capacity_share_pct,
            "generation_share_pct": row.generation_share_pct,
            "is_estimated": row.is_estimated,
        }

    source_rows = [serialise(row) for row in rows]
    renewable_capacity = sum(
        row["installed_capacity_mw"] for row in source_rows if row["is_renewable"]
    )
    conventional_capacity = sum(
        row["installed_capacity_mw"] for row in source_rows if not row["is_renewable"]
    )
    renewable_generation = sum(
        row["generation_gwh"] for row in source_rows if row["is_renewable"]
    )
    conventional_generation = sum(
        row["generation_gwh"] for row in source_rows if not row["is_renewable"]
    )
    total_capacity = renewable_capacity + conventional_capacity
    total_generation = renewable_generation + conventional_generation

    capacity_series: list[dict[str, Any]] = []
    generation_series: list[dict[str, Any]] = []
    for trend_year in years:
        trend_rows = db.scalars(
            select(NationalEnergyStatistic).where(
                NationalEnergyStatistic.year == trend_year
            )
        ).all()
        re_cap = conv_cap = re_gen = conv_gen = 0.0
        for row in trend_rows:
            source = meta.get(row.energy_source_id)
            renewable = bool(source.is_renewable) if source else False
            if renewable:
                re_cap += row.installed_capacity_mw
                re_gen += row.generation_gwh
            else:
                conv_cap += row.installed_capacity_mw
                conv_gen += row.generation_gwh
        capacity_series.append(
            {
                "year": trend_year,
                "renewable_mw": round(re_cap, 2),
                "conventional_mw": round(conv_cap, 2),
                "total_mw": round(re_cap + conv_cap, 2),
                "renewable_share_pct": round(
                    re_cap / (re_cap + conv_cap) * 100, 2
                )
                if (re_cap + conv_cap)
                else 0.0,
            }
        )
        generation_series.append(
            {
                "year": trend_year,
                "renewable_gwh": round(re_gen, 2),
                "conventional_gwh": round(conv_gen, 2),
                "total_gwh": round(re_gen + conv_gen, 2),
                "renewable_share_pct": round(
                    re_gen / (re_gen + conv_gen) * 100, 2
                )
                if (re_gen + conv_gen)
                else 0.0,
            }
        )

    previous_year = years[years.index(selected_year) - 1] if selected_year != years[0] else None
    previous_capacity_growth = None
    previous_generation_growth = None
    if previous_year is not None:
        previous_rows = db.scalars(
            select(NationalEnergyStatistic).where(
                NationalEnergyStatistic.year == previous_year
            )
        ).all()
        previous_capacity = sum(row.installed_capacity_mw for row in previous_rows)
        previous_generation = sum(row.generation_gwh for row in previous_rows)
        if previous_capacity:
            previous_capacity_growth = round(
                (total_capacity - previous_capacity) / previous_capacity * 100, 2
            )
        if previous_generation:
            previous_generation_growth = round(
                (total_generation - previous_generation) / previous_generation * 100, 2
            )

    generation_by_source: dict[str, dict[str, Any]] = {}
    for trend_year in years:
        for row in db.scalars(
            select(NationalEnergyStatistic).where(
                NationalEnergyStatistic.year == trend_year
            )
        ).all():
            source = meta.get(row.energy_source_id)
            if source is None:
                continue
            bucket = generation_by_source.setdefault(
                source.code,
                {
                    "source_code": source.code,
                    "source_name": source.name,
                    "color": source.color,
                    "is_renewable": bool(source.is_renewable),
                    "values": [],
                },
            )
            bucket["values"].append(
                {"year": trend_year, "generation_gwh": round(row.generation_gwh, 2)}
            )

    latest_impact = db.scalar(
        select(EnvironmentalImpact)
        .where(EnvironmentalImpact.year == selected_year)
        .order_by(EnvironmentalImpact.region)
    )

    return {
        "has_data": True,
        "selected_year": selected_year,
        "latest_year": years[-1],
        "available_years": years,
        "totals": {
            "installed_capacity_mw": round(total_capacity, 2),
            "renewable_capacity_mw": round(renewable_capacity, 2),
            "conventional_capacity_mw": round(conventional_capacity, 2),
            "renewable_capacity_share_pct": round(
                renewable_capacity / total_capacity * 100, 2
            )
            if total_capacity
            else 0.0,
            "generation_gwh": round(total_generation, 2),
            "renewable_generation_gwh": round(renewable_generation, 2),
            "conventional_generation_gwh": round(conventional_generation, 2),
            "renewable_generation_share_pct": round(
                renewable_generation / total_generation * 100, 2
            )
            if total_generation
            else 0.0,
            "capacity_growth_pct": previous_capacity_growth,
            "generation_growth_pct": previous_generation_growth,
        },
        "sources": source_rows,
        "renewable_sources": [row for row in source_rows if row["is_renewable"]],
        "conventional_sources": [row for row in source_rows if not row["is_renewable"]],
        "capacity_series": capacity_series,
        "generation_series": generation_series,
        "generation_by_source": sorted(
            generation_by_source.values(), key=lambda item: item["source_name"]
        ),
        "comparison": {
            "previous_year": previous_year,
            "capacity_growth_pct": previous_capacity_growth,
            "generation_growth_pct": previous_generation_growth,
        },
        "environmental_context": {
            "co2_avoided_tonnes": latest_impact.co2_avoided_tonnes
            if latest_impact
            else None,
            "trees_equivalent": latest_impact.trees_equivalent if latest_impact else None,
        },
        "data": {
            "last_updated": _dataset_timestamp(db),
            "sources": _source_freshness(db),
            "is_sample": True,
            "disclaimer": (
                "Sample dataset curated from public CEA/MNRE aggregates. "
                "Values are rounded and are not a live official feed."
            ),
        },
        "generated_at": datetime.now(timezone.utc),
    }


def energy_source_history(db: Session, source_code: str) -> list[dict[str, Any]]:
    source = db.scalar(select(EnergySource).where(EnergySource.code == source_code.upper()))
    if source is None:
        return []
    rows = db.scalars(
        select(NationalEnergyStatistic)
        .where(NationalEnergyStatistic.energy_source_id == source.id)
        .order_by(NationalEnergyStatistic.year)
    ).all()
    return [
        {
            "year": row.year,
            "installed_capacity_mw": round(row.installed_capacity_mw, 2),
            "generation_gwh": round(row.generation_gwh, 2),
        }
        for row in rows
    ]
