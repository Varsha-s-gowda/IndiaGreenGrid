"""Modular public-data ingestion.

The platform ships with curated sample extracts from public sources.  Each
source is described in :data:`SOURCE_DEFINITIONS` and can be refreshed from
the Admin portal.  Where a live API requires credentials or is unavailable,
the source is explicitly marked ``unavailable`` and no data is fabricated.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError
from app.models.green_grid import (
    AirQualityReading,
    DataSource,
    EnergySource,
    EnvironmentalImpact,
    IngestionRun,
    NationalEnergyStatistic,
    StateEnergyStatistic,
    WeatherForecast,
)
from app.services.energy_service import ensure_energy_sources, recompute_shares

logger = logging.getLogger(__name__)

SEED_DIR = Path(__file__).resolve().parents[3] / "data" / "seed"

ESTIMATED_SOURCE_CODES = {"mnre_policy_assumptions"}
UNAVAILABLE_SOURCE_CODES = {"iea_renewables_outlook"}
SAMPLE_SOURCE_CODES = {"manual_admin_catalogue"}

DATASET_STATUSES = ("LIVE", "SAMPLE", "ESTIMATED", "UNAVAILABLE", "STALE")


@dataclass(frozen=True)
class SourceDefinition:
    code: str
    name: str
    organization: str
    url: str
    dataset_name: str
    description: str
    ingestion_kind: str | None
    dataset_file: str | None
    freshness_hours: int
    notes: str = ""


SOURCE_DEFINITIONS: tuple[SourceDefinition, ...] = (
    SourceDefinition(
        code="cea_installed_capacity",
        name="CEA Installed Capacity Review",
        organization="Central Electricity Authority (CEA)",
        url="https://cea.nic.in",
        dataset_name="National installed capacity & generation - curated sample extract",
        description=(
            "National installed capacity and gross generation by energy source. "
            "Sample values compiled from publicly reported CEA/MNRE aggregates."
        ),
        ingestion_kind="national_energy",
        dataset_file="national_energy.json",
        freshness_hours=24 * 30,
        notes=(
            "No public CEA machine API is configured. The bundled sample extract "
            "can be replaced through Admin > Data sources without code changes."
        ),
    ),
    SourceDefinition(
        code="grid_india_generation",
        name="Grid-India Operational Generation",
        organization="Grid Controller of India (Grid-India / POSOCO)",
        url="https://grid-india.in",
        dataset_name="Operational generation - curated sample extract",
        description=(
            "Generation totals used for renewable-share analysis. Curated sample "
            "extract; not a live operational feed."
        ),
        ingestion_kind="national_energy",
        dataset_file="national_energy.json",
        freshness_hours=24,
        notes=(
            "Grid-India reports are available as downloadable files. Automated "
            "download requires an approved endpoint and is not configured."
        ),
    ),
    SourceDefinition(
        code="mnre_state_capacity",
        name="MNRE State Renewable Capacity",
        organization="Ministry of New and Renewable Energy (MNRE)",
        url="https://mnre.gov.in",
        dataset_name="State renewable capacity & avoided emissions - curated sample",
        description=(
            "State-level solar, wind and total renewable capacity with estimated "
            "avoided emissions."
        ),
        ingestion_kind="state_impact",
        dataset_file="regional_impact.json",
        freshness_hours=24 * 30,
        notes="Sample extract from public state capacity summaries.",
    ),
    SourceDefinition(
        code="cpcb_air_quality",
        name="CPCB Air Quality",
        organization="Central Pollution Control Board (CPCB)",
        url="https://cpcb.nic.in",
        dataset_name="City air quality - sample readings",
        description=(
            "City-level AQI, PM2.5 and PM10 readings used in the environmental "
            "impact dashboard."
        ),
        ingestion_kind="air_quality",
        dataset_file="regional_impact.json",
        freshness_hours=24,
        notes=(
            "CPCB publishes via web pages and state boards. A live API key/feed is "
            "not configured; displayed readings are explicitly labelled sample."
        ),
    ),
    SourceDefinition(
        code="iea_renewables_outlook",
        name="IEA Renewables Market Outlook",
        organization="International Energy Agency (IEA)",
        url="https://www.iea.org",
        dataset_name="Global renewables outlook (not configured)",
        description=(
            "Optional international benchmark data. Requires IEA API credentials "
            "or a licensed data subscription."
        ),
        ingestion_kind=None,
        dataset_file=None,
        freshness_hours=24 * 180,
        notes=(
            "UNAVAILABLE: IEA API credentials are not configured. No IEA figures "
            "are displayed or invented by this platform."
        ),
    ),
    SourceDefinition(
        code="mnre_policy_assumptions",
        name="MNRE Rooftop Solar Policy Assumptions",
        organization="Ministry of New and Renewable Energy (MNRE)",
        url="https://pmsuryaghar.gov.in",
        dataset_name="Rooftop calculator assumptions (indicative)",
        description=(
            "Documented assumptions for the rooftop solar calculator, including "
            "subsidy bands and indicative installation costs."
        ),
        ingestion_kind=None,
        dataset_file=None,
        freshness_hours=24 * 365,
        notes=(
            "Assumption sheet maintained in the Python service and labelled "
            "indicative. Verify subsidy eligibility on the national portal."
        ),
    ),
    SourceDefinition(
        code="manual_admin_catalogue",
        name="Platform opportunity catalogue",
        organization="India Green Grid administrators",
        url="https://pmsuryaghar.gov.in",
        dataset_name="Jobs, finance schemes and recycler directory",
        description=(
            "Administrator-maintained jobs, finance and recycler records. Sample "
            "records ship with the platform and are labelled sample."
        ),
        ingestion_kind=None,
        dataset_file=None,
        freshness_hours=24 * 7,
        notes="Curated by administrators; not an official government feed.",
    ),
)


def ensure_data_sources(db: Session) -> dict[str, DataSource]:
    existing = {source.code: source for source in db.scalars(select(DataSource)).all()}
    for definition in SOURCE_DEFINITIONS:
        source = existing.get(definition.code)
        if source is None:
            source = DataSource(
                code=definition.code,
                name=definition.name,
                organization=definition.organization,
                url=definition.url,
                dataset_name=definition.dataset_name,
                description=definition.description,
                freshness_hours=definition.freshness_hours,
                notes=definition.notes,
                status="unavailable" if definition.ingestion_kind is None else "sample",
                is_demo=True,
            )
            db.add(source)
            existing[definition.code] = source
        else:
            source.name = definition.name
            source.organization = definition.organization
            source.url = definition.url
            source.dataset_name = definition.dataset_name
            source.description = definition.description
            source.freshness_hours = definition.freshness_hours
            source.notes = definition.notes
    db.flush()
    return existing


def _definition(code: str) -> SourceDefinition:
    for definition in SOURCE_DEFINITIONS:
        if definition.code == code:
            return definition
    raise BadRequestError("Unknown data source.", details={"code": code})


def _load_json(filename: str) -> dict[str, Any]:
    path = SEED_DIR / filename
    if not path.exists():
        raise BadRequestError(
            "The bundled dataset file is missing.",
            details={"file": str(path)},
        )
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError) as exc:
        raise BadRequestError(
            "The bundled dataset could not be read.",
            details={"file": filename},
        ) from exc


def _number(value: Any, field: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise BadRequestError(
            f"Invalid numeric value for {field}.", details={"field": field}
        ) from exc
    if number < 0:
        raise BadRequestError(
            f"{field} must not be negative.", details={"field": field}
        )
    return number


def _ingest_national_energy(
    db: Session, source: DataSource, payload: dict[str, Any]
) -> int:
    energy_sources = ensure_energy_sources(db)
    rows = payload.get("rows") or []
    if not isinstance(rows, list) or not rows:
        raise BadRequestError("National energy dataset contains no rows.")

    now = datetime.now(timezone.utc)
    touched_years: set[int] = set()
    count = 0
    for item in rows:
        code = str(item.get("source", "")).upper()
        energy_source = energy_sources.get(code)
        if energy_source is None:
            raise BadRequestError(
                "Dataset references an unknown energy source.",
                details={"source": code},
            )
        year = int(item.get("year", 0))
        if year < 2000 or year > 2100:
            raise BadRequestError(
                "Dataset year is outside the supported range.",
                details={"year": year},
            )
        capacity = _number(item.get("capacity_mw", 0), "capacity_mw")
        generation = _number(item.get("generation_gwh", 0), "generation_gwh")
        record = db.scalar(
            select(NationalEnergyStatistic).where(
                NationalEnergyStatistic.year == year,
                NationalEnergyStatistic.energy_source_id == energy_source.id,
            )
        )
        if record is None:
            record = NationalEnergyStatistic(
                year=year, energy_source_id=energy_source.id
            )
            db.add(record)
        record.installed_capacity_mw = capacity
        record.generation_gwh = generation
        record.is_estimated = True
        record.data_source_id = source.id
        record.retrieved_at = now
        touched_years.add(year)
        count += 1

    recompute_shares(db, touched_years)
    return count


def _ingest_state_impact(
    db: Session, source: DataSource, payload: dict[str, Any]
) -> int:
    rows = payload.get("rows") or []
    if not isinstance(rows, list) or not rows:
        raise BadRequestError("State impact dataset contains no rows.")
    year = int(payload.get("_meta", {}).get("year", datetime.now().year))
    count = 0
    for item in rows:
        state = str(item.get("state", "")).strip()
        if not state:
            raise BadRequestError("State row is missing a state name.")
        record = db.scalar(
            select(StateEnergyStatistic).where(
                StateEnergyStatistic.state == state,
                StateEnergyStatistic.year == year,
            )
        )
        if record is None:
            record = StateEnergyStatistic(state=state, year=year)
            db.add(record)
        record.solar_capacity_mw = _number(item.get("solar_capacity_mw", 0), "solar_capacity_mw")
        record.wind_capacity_mw = _number(item.get("wind_capacity_mw", 0), "wind_capacity_mw")
        record.total_renewable_mw = _number(
            item.get("total_renewable_mw", 0), "total_renewable_mw"
        )
        record.co2_avoided_tonnes = _number(
            item.get("co2_avoided_tonnes", 0), "co2_avoided_tonnes"
        )
        record.air_quality_index = item.get("air_quality_index")
        record.pm25 = item.get("pm25")
        record.is_estimated = True
        record.data_source_id = source.id
        count += 1

    ensure_energy_sources(db)
    for year_row in db.scalars(
        select(NationalEnergyStatistic.year).distinct().order_by(NationalEnergyStatistic.year)
    ).all():
        rows_for_year = db.scalars(
            select(NationalEnergyStatistic)
            .join(EnergySource)
            .where(
                NationalEnergyStatistic.year == year_row,
                EnergySource.is_renewable.is_(True),
            )
        ).all()
        renewable_generation = sum(row.generation_gwh for row in rows_for_year)
        impact = db.scalar(
            select(EnvironmentalImpact).where(
                EnvironmentalImpact.region == "India",
                EnvironmentalImpact.year == year_row,
            )
        )
        if impact is None:
            impact = EnvironmentalImpact(region="India", year=year_row)
            db.add(impact)
        impact.renewable_generation_gwh = round(renewable_generation, 2)
        impact.co2_avoided_tonnes = round(renewable_generation * 0.71, 2)
        impact.trees_equivalent = round(renewable_generation * 0.71 / 21.77, 2)
        impact.is_estimated = True
        impact.data_source_id = source.id
    return count


def _ingest_air_quality(
    db: Session, source: DataSource, payload: dict[str, Any]
) -> int:
    rows = payload.get("air_quality") or []
    if not isinstance(rows, list) or not rows:
        raise BadRequestError("Air quality dataset contains no rows.")
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    count = 0
    for item in rows:
        city = str(item.get("city", "")).strip()
        state = str(item.get("state", "")).strip()
        if not city or not state:
            raise BadRequestError("Air quality row is missing city or state.")
        record = db.scalar(
            select(AirQualityReading).where(
                AirQualityReading.city == city,
                AirQualityReading.measured_at == now,
            )
        )
        if record is None:
            record = AirQualityReading(city=city, state=state, measured_at=now)
            db.add(record)
        record.aqi = _number(item.get("aqi", 0), "aqi")
        record.pm25 = item.get("pm25")
        record.pm10 = item.get("pm10")
        record.category = str(item.get("category", "Unclassified"))
        record.is_sample = True
        record.data_source_id = source.id
        count += 1
    return count


def dataset_status(source: DataSource, now: datetime | None = None) -> str:
    """Derive an honest LIVE/SAMPLE/ESTIMATED/UNAVAILABLE/STALE label."""

    if source.code in UNAVAILABLE_SOURCE_CODES:
        return "UNAVAILABLE"
    if source.code in ESTIMATED_SOURCE_CODES:
        return "ESTIMATED"
    if source.code in SAMPLE_SOURCE_CODES:
        return "SAMPLE"
    if source.last_success_at is None:
        return "SAMPLE" if source.status == "sample" else "UNAVAILABLE"
    now = now or datetime.now(timezone.utc)
    last_success = source.last_success_at
    if last_success.tzinfo is None:
        last_success = last_success.replace(tzinfo=timezone.utc)
    age_hours = (now - last_success).total_seconds() / 3600
    if age_hours > source.freshness_hours:
        return "STALE"
    if source.status == "sample" or source.is_demo:
        return "SAMPLE"
    return "LIVE"


def _record_run(
    db: Session,
    source: DataSource | None,
    *,
    code: str,
    status: str,
    dataset_state: str,
    records: int,
    message: str,
    trigger: str,
    started_at: datetime,
    finished_at: datetime | None = None,
) -> None:
    finished_at = finished_at or datetime.now(timezone.utc)
    db.add(
        IngestionRun(
            source_id=source.id if source is not None else None,
            source_code=code,
            status=status,
            dataset_status=dataset_state,
            records=records,
            message=message,
            trigger=trigger,
            started_at=started_at,
            finished_at=finished_at,
            duration_ms=max(
                0, int((finished_at - started_at).total_seconds() * 1000)
            ),
        )
    )
    db.commit()


def ingestion_runs(db: Session, limit: int = 100) -> dict[str, Any]:
    runs = db.scalars(
        select(IngestionRun)
        .order_by(IngestionRun.started_at.desc(), IngestionRun.id.desc())
        .limit(limit)
    ).all()
    return {
        "items": [
            {
                "id": run.id,
                "source_code": run.source_code,
                "source_id": run.source_id,
                "status": run.status,
                "dataset_status": run.dataset_status,
                "records": run.records,
                "message": run.message,
                "trigger": run.trigger,
                "started_at": run.started_at,
                "finished_at": run.finished_at,
                "duration_ms": run.duration_ms,
            }
            for run in runs
        ],
        "total": len(runs),
        "statuses": DATASET_STATUSES,
    }


def ingest_source(
    db: Session, source: DataSource, trigger: str = "manual"
) -> dict[str, Any]:
    """Refresh one source idempotently and update its provenance metadata."""

    definition = _definition(source.code)
    started_at = datetime.now(timezone.utc)
    source.last_retrieved_at = started_at

    if definition.ingestion_kind is None or definition.dataset_file is None:
        source.status = "unavailable"
        source.notes = definition.notes or (
            "This source requires credentials or approved access that is not configured."
        )
        db.commit()
        message = (
            "Source is not configured. No data was changed and no values were "
            "fabricated. See the source notes for required credentials."
        )
        _record_run(
            db,
            source,
            code=source.code,
            status="unavailable",
            dataset_state=dataset_status(source),
            records=0,
            message=message,
            trigger=trigger,
            started_at=started_at,
        )
        return {
            "source": source.code,
            "status": "unavailable",
            "dataset_status": dataset_status(source),
            "records": 0,
            "message": message,
        }

    payload = _load_json(definition.dataset_file)
    try:
        if definition.ingestion_kind == "national_energy":
            records = _ingest_national_energy(db, source, payload)
        elif definition.ingestion_kind == "state_impact":
            records = _ingest_state_impact(db, source, payload)
        elif definition.ingestion_kind == "air_quality":
            records = _ingest_air_quality(db, source, payload)
        else:
            raise BadRequestError("Unsupported ingestion kind.")
    except Exception as exc:
        db.rollback()
        source = db.scalar(select(DataSource).where(DataSource.code == definition.code))
        if source is not None:
            source.status = "degraded"
            source.last_retrieved_at = started_at
            db.commit()
        _record_run(
            db,
            source,
            code=definition.code,
            status="failed",
            dataset_state="UNAVAILABLE",
            records=0,
            message=f"Ingestion failed: {exc}",
            trigger=trigger,
            started_at=started_at,
        )
        raise

    source.status = "sample"
    source.is_demo = True
    source.record_count = records
    source.last_success_at = datetime.now(timezone.utc)
    source.notes = definition.notes
    db.commit()
    state = dataset_status(source)
    message = (
        "Bundled sample dataset refreshed. Displayed values remain labelled "
        "as sample data."
        if state == "SAMPLE"
        else "Dataset refreshed."
    )
    _record_run(
        db,
        source,
        code=source.code,
        status="success",
        dataset_state=state,
        records=records,
        message=message,
        trigger=trigger,
        started_at=started_at,
    )
    logger.info("Ingested %s records from %s", records, source.code)
    return {
        "source": source.code,
        "status": "success",
        "dataset_status": state,
        "records": records,
        "last_success_at": source.last_success_at,
        "message": message,
    }


def ingest_all(db: Session, trigger: str = "manual") -> list[dict[str, Any]]:
    sources = ensure_data_sources(db)
    results: list[dict[str, Any]] = []
    for definition in SOURCE_DEFINITIONS:
        source = sources[definition.code]
        if definition.ingestion_kind is None:
            source.status = "unavailable"
            continue
        results.append(ingest_source(db, source, trigger=trigger))
    return results


def seed_weather_forecasts(db: Session, source: DataSource) -> int:
    """Create a 7-day sample forecast from the weather template file."""

    payload = _load_json("weather_templates.json")
    locations = payload.get("locations") or []
    if not locations:
        raise BadRequestError("Weather template contains no locations.")
    today = date.today()
    count = 0
    for location in locations:
        for offset in range(7):
            forecast_date = today + timedelta(days=offset)
            record = db.scalar(
                select(WeatherForecast).where(
                    WeatherForecast.location == location["location"],
                    WeatherForecast.forecast_date == forecast_date,
                )
            )
            if record is None:
                record = WeatherForecast(
                    location=location["location"],
                    state=location["state"],
                    forecast_date=forecast_date,
                )
                db.add(record)
            wave = ((offset * 7 + len(location["location"])) % 9) / 20
            record.temperature_c = round(
                float(location.get("base_temp", 30)) + (offset % 4) * 0.6 - 0.9, 1
            )
            record.irradiance_kwh_m2_day = round(
                float(location.get("base_irradiance", 5)) + wave - 0.2, 2
            )
            record.wind_speed_ms = round(
                float(location.get("base_wind", 4)) + ((offset * 3) % 5) / 10, 2
            )
            record.cloud_cover_pct = min(
                90, int(location.get("cloud", 25)) + (offset * 5) % 25
            )
            record.source_id = source.id
            record.is_sample = True
            count += 1
    db.commit()
    return count


def seed_weather_data(db: Session) -> int:
    sources = ensure_data_sources(db)
    source = sources["grid_india_generation"]
    db.commit()
    return seed_weather_forecasts(db, source)


def data_freshness_snapshot(db: Session) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    items = []
    for source in db.scalars(select(DataSource).order_by(DataSource.name)).all():
        if source.last_success_at is None:
            freshness = "unknown"
            age_hours = None
        else:
            last_success = source.last_success_at
            if last_success.tzinfo is None:
                last_success = last_success.replace(tzinfo=timezone.utc)
            age_hours = round((now - last_success).total_seconds() / 3600, 1)
            freshness = (
                "fresh" if age_hours <= source.freshness_hours else "stale"
            )
        items.append(
            {
                "id": source.id,
                "code": source.code,
                "name": source.name,
                "organization": source.organization,
                "url": source.url,
                "dataset_name": source.dataset_name,
                "description": source.description,
                "status": source.status,
                "dataset_status": dataset_status(source, now),
                "is_demo": source.is_demo,
                "freshness": freshness,
                "age_hours": age_hours,
                "freshness_hours": source.freshness_hours,
                "record_count": source.record_count,
                "last_retrieved_at": source.last_retrieved_at,
                "last_success_at": source.last_success_at,
                "notes": source.notes,
            }
        )
    return items


def clear_source_data(db: Session, code: str) -> None:
    """Testing/maintenance helper: remove rows owned by one source."""

    definition = _definition(code)
    if definition.ingestion_kind == "national_energy":
        db.execute(
            delete(NationalEnergyStatistic).where(
                NationalEnergyStatistic.data_source_id
                == select(DataSource.id).where(DataSource.code == code).scalar_subquery()
            )
        )
        db.commit()
