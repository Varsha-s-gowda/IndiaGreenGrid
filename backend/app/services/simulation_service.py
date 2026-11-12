"""Simulation orchestration, persistence and query services for SolarTwin."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import NotFoundError
from app.models.apartment import Apartment
from app.models.common_consumption import CommonAreaCategory, CommonConsumption
from app.models.meter_reading import MeterReading
from app.models.simulation_run import SimulationRun, SimulationStatus
from app.models.solar_generation import SolarGeneration
from app.services import apartment_service, consumption_service, solar_service

DEFAULT_CAPACITY_KWP = 50.0
DEFAULT_SIMULATION_DAYS = 30
DEFAULT_SIMULATION_SEED = 360
MAX_SIMULATION_DAYS = 366


@dataclass(frozen=True)
class SimulationConfig:
    capacity_kwp: float
    start_date: date
    days: int
    seed: int

    @property
    def end_date(self) -> date:
        return self.start_date + timedelta(days=self.days - 1)


@dataclass(frozen=True)
class GenerationResult:
    run: SimulationRun
    solar_created: int
    meter_created: int
    common_created: int
    reused: bool
    message: str


@dataclass(frozen=True)
class PageResult:
    items: list[object]
    total: int


def validate_config(config: SimulationConfig) -> None:
    if config.capacity_kwp <= 0:
        raise ValueError("Solar capacity must be greater than zero.")
    if config.days <= 0 or config.days > MAX_SIMULATION_DAYS:
        raise ValueError(
            f"Simulation days must be between 1 and {MAX_SIMULATION_DAYS}."
        )
    if config.seed < 0:
        raise ValueError("Random seed must be non-negative.")


def _capacity_decimal(capacity_kwp: float) -> Decimal:
    return Decimal(str(round(float(capacity_kwp), 2)))


def _bulk_insert(db: Session, model, rows: list[dict[str, object]], chunk_size: int = 2000) -> int:
    if not rows:
        return 0
    for start in range(0, len(rows), chunk_size):
        db.execute(insert(model), rows[start : start + chunk_size])
    return len(rows)


def _run_counts(db: Session, run_id: int) -> dict[str, int]:
    return {
        "solar_records": int(
            db.scalar(
                select(func.count())
                .select_from(SolarGeneration)
                .where(SolarGeneration.simulation_run_id == run_id)
            )
            or 0
        ),
        "meter_records": int(
            db.scalar(
                select(func.count())
                .select_from(MeterReading)
                .where(MeterReading.simulation_run_id == run_id)
            )
            or 0
        ),
        "common_records": int(
            db.scalar(
                select(func.count())
                .select_from(CommonConsumption)
                .where(CommonConsumption.simulation_run_id == run_id)
            )
            or 0
        ),
    }


def _expected_counts(db: Session, run: SimulationRun) -> dict[str, int]:
    apartment_count = int(
        db.scalar(select(func.count()).select_from(Apartment)) or 0
    )
    return {
        "solar_records": solar_service.expected_solar_hours(run.days),
        "meter_records": consumption_service.expected_apartment_readings(
            apartment_count, run.days
        ),
        "common_records": consumption_service.expected_common_readings(run.days),
    }


def run_status(db: Session, run: SimulationRun) -> dict[str, object]:
    counts = _run_counts(db, run.id)
    expected = _expected_counts(db, run)
    ratios = [
        (counts[key] / expected[key]) if expected[key] else 0.0
        for key in expected
    ]
    progress = round(min(1.0, sum(ratios) / len(ratios)) * 100.0, 1)

    return {
        "id": run.id,
        "status": run.status,
        "solar_capacity_kwp": float(run.solar_capacity_kwp),
        "start_date": run.start_date,
        "end_date": run.end_date,
        "days": run.days,
        "random_seed": run.random_seed,
        "created_at": run.created_at,
        "completed_at": run.completed_at,
        "error_message": run.error_message,
        **counts,
        "expected_records": expected,
        "progress_percentage": progress,
    }


def get_run(db: Session, run_id: int) -> SimulationRun:
    run = db.get(SimulationRun, run_id)
    if run is None:
        raise NotFoundError(f"Simulation run {run_id} was not found.")
    return run


def latest_run(db: Session) -> SimulationRun | None:
    return db.scalar(select(SimulationRun).order_by(SimulationRun.id.desc()).limit(1))


def resolve_run(db: Session, run_id: int | None) -> SimulationRun:
    if run_id is not None:
        return get_run(db, run_id)
    run = latest_run(db)
    if run is None:
        raise NotFoundError(
            "No simulation data exists yet. Generate a simulation first."
        )
    return run


def list_runs(db: Session, *, limit: int = 50, offset: int = 0) -> PageResult:
    total = int(db.scalar(select(func.count()).select_from(SimulationRun)) or 0)
    items = list(
        db.scalars(
            select(SimulationRun)
            .order_by(SimulationRun.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return PageResult(items=items, total=total)


def find_matching_run(
    db: Session,
    config: SimulationConfig,
    *,
    require_complete: bool = True,
) -> SimulationRun | None:
    stmt = select(SimulationRun).where(
        SimulationRun.start_date == config.start_date,
        SimulationRun.end_date == config.end_date,
        SimulationRun.days == config.days,
        SimulationRun.random_seed == config.seed,
        SimulationRun.solar_capacity_kwp == _capacity_decimal(config.capacity_kwp),
    )
    if require_complete:
        stmt = stmt.where(SimulationRun.status == SimulationStatus.COMPLETED)
    else:
        stmt = stmt.where(SimulationRun.status != SimulationStatus.FAILED)
    return db.scalar(stmt.order_by(SimulationRun.id.desc()).limit(1))


def _create_run(db: Session, config: SimulationConfig) -> SimulationRun:
    run = SimulationRun(
        status=SimulationStatus.RUNNING,
        solar_capacity_kwp=_capacity_decimal(config.capacity_kwp),
        start_date=config.start_date,
        end_date=config.end_date,
        days=config.days,
        random_seed=config.seed,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def _delete_run_children(db: Session, run_id: int) -> None:
    db.execute(delete(SolarGeneration).where(SolarGeneration.simulation_run_id == run_id))
    db.execute(delete(MeterReading).where(MeterReading.simulation_run_id == run_id))
    db.execute(
        delete(CommonConsumption).where(
            CommonConsumption.simulation_run_id == run_id
        )
    )


def delete_run(db: Session, run_id: int) -> None:
    run = get_run(db, run_id)
    _delete_run_children(db, run.id)
    db.delete(run)
    db.commit()


def _mark_failed(db: Session, run_id: int, error: Exception) -> None:
    db.rollback()
    run = db.get(SimulationRun, run_id)
    if run is None:
        return
    run.status = SimulationStatus.FAILED
    run.error_message = str(error)[:2000]
    run.completed_at = None
    db.commit()


def _refresh_status(db: Session, run: SimulationRun) -> None:
    counts = _run_counts(db, run.id)
    expected = _expected_counts(db, run)
    complete = all(counts[key] >= expected[key] for key in expected if expected[key])
    any_data = any(counts.values())
    if complete:
        run.status = SimulationStatus.COMPLETED
        run.completed_at = datetime.now(timezone.utc)
        run.error_message = None
    elif any_data:
        run.status = SimulationStatus.PARTIAL
        run.completed_at = None
    else:
        run.status = SimulationStatus.PENDING
        run.completed_at = None


def ensure_apartments(db: Session) -> apartment_service.ApartmentSeedResult:
    """Seed the 60-flat inventory if it is missing or incomplete."""

    specs = apartment_service.build_apartment_specs()
    expected_numbers = [str(spec["flat_number"]) for spec in specs]
    present = int(
        db.scalar(
            select(func.count())
            .select_from(Apartment)
            .where(Apartment.flat_number.in_(expected_numbers))
        )
        or 0
    )
    if present >= apartment_service.APARTMENT_COUNT:
        total = int(db.scalar(select(func.count()).select_from(Apartment)) or 0)
        return apartment_service.ApartmentSeedResult(
            created=0, existing=total, total=total
        )
    return apartment_service.seed_apartments(db)


def _apartments(db: Session) -> list[Apartment]:
    return list(db.scalars(select(Apartment).order_by(Apartment.id)).all())


def _solar_rows(run: SimulationRun) -> list[dict[str, object]]:
    return solar_service.solar_records(
        run.id,
        float(run.solar_capacity_kwp),
        run.start_date,
        run.days,
        run.random_seed,
    )


def _meter_rows(run: SimulationRun, apartments: list[Apartment]) -> list[dict[str, object]]:
    return consumption_service.apartment_records(
        run.id,
        apartments,
        run.start_date,
        run.days,
        run.random_seed,
    )


def _common_rows(run: SimulationRun) -> list[dict[str, object]]:
    return consumption_service.common_records(
        run.id,
        run.start_date,
        run.days,
        run.random_seed,
    )


def generate_full_simulation(
    db: Session,
    config: SimulationConfig,
    *,
    regenerate: bool = False,
) -> GenerationResult:
    """Generate solar, apartment and common-area data as one atomic run."""

    validate_config(config)
    ensure_apartments(db)
    apartments = _apartments(db)
    if not apartments:
        raise ValueError("No apartments are available for consumption simulation.")

    existing = find_matching_run(db, config, require_complete=True)
    if existing is not None and not regenerate:
        counts = _run_counts(db, existing.id)
        return GenerationResult(
            run=existing,
            solar_created=0,
            meter_created=0,
            common_created=0,
            reused=True,
            message=(
                "An identical completed simulation already exists; it was "
                "returned instead of creating duplicate records."
            ),
        )

    if existing is not None and regenerate:
        delete_run(db, existing.id)

    run = _create_run(db, config)
    try:
        solar_created = _bulk_insert(db, SolarGeneration, _solar_rows(run))
        meter_created = _bulk_insert(db, MeterReading, _meter_rows(run, apartments))
        common_created = _bulk_insert(db, CommonConsumption, _common_rows(run))
        _refresh_status(db, run)
        db.commit()
        db.refresh(run)
        return GenerationResult(
            run=run,
            solar_created=solar_created,
            meter_created=meter_created,
            common_created=common_created,
            reused=False,
            message="Simulation generation completed.",
        )
    except Exception as exc:  # noqa: BLE001 - persisted as run diagnostics
        _mark_failed(db, run.id, exc)
        raise


def generate_solar(
    db: Session,
    config: SimulationConfig,
    *,
    run_id: int | None = None,
    regenerate: bool = False,
) -> GenerationResult:
    """Generate only the solar series for a run (idempotent by default)."""

    validate_config(config)
    if run_id is not None:
        run = get_run(db, run_id)
        config = SimulationConfig(
            capacity_kwp=float(run.solar_capacity_kwp),
            start_date=run.start_date,
            days=run.days,
            seed=run.random_seed,
        )
    else:
        run = find_matching_run(db, config, require_complete=False)
        if run is None:
            run = _create_run(db, config)

    existing_count = _run_counts(db, run.id)["solar_records"]
    if existing_count and not regenerate:
        return GenerationResult(
            run=run,
            solar_created=0,
            meter_created=0,
            common_created=0,
            reused=True,
            message=(
                "Solar generation already exists for this run. Use "
                "regenerate=true to replace it."
            ),
        )

    if existing_count and regenerate:
        db.execute(
            delete(SolarGeneration).where(
                SolarGeneration.simulation_run_id == run.id
            )
        )
        db.commit()

    try:
        created = _bulk_insert(db, SolarGeneration, _solar_rows(run))
        _refresh_status(db, run)
        db.commit()
        db.refresh(run)
        return GenerationResult(
            run=run,
            solar_created=created,
            meter_created=0,
            common_created=0,
            reused=False,
            message="Solar generation completed.",
        )
    except Exception as exc:  # noqa: BLE001
        _mark_failed(db, run.id, exc)
        raise


def generate_consumption(
    db: Session,
    config: SimulationConfig,
    *,
    run_id: int | None = None,
    regenerate: bool = False,
    include_common: bool = True,
) -> GenerationResult:
    """Generate apartment consumption and common-area consumption for a run."""

    validate_config(config)
    ensure_apartments(db)
    apartments = _apartments(db)
    if not apartments:
        raise ValueError("No apartments are available for consumption simulation.")

    if run_id is not None:
        run = get_run(db, run_id)
        config = SimulationConfig(
            capacity_kwp=float(run.solar_capacity_kwp),
            start_date=run.start_date,
            days=run.days,
            seed=run.random_seed,
        )
    else:
        run = find_matching_run(db, config, require_complete=False)
        if run is None:
            run = _create_run(db, config)

    counts = _run_counts(db, run.id)
    has_data = counts["meter_records"] > 0 or counts["common_records"] > 0
    if has_data and not regenerate:
        return GenerationResult(
            run=run,
            solar_created=0,
            meter_created=0,
            common_created=0,
            reused=True,
            message=(
                "Consumption data already exists for this run. Use "
                "regenerate=true to replace it."
            ),
        )

    if has_data and regenerate:
        db.execute(delete(MeterReading).where(MeterReading.simulation_run_id == run.id))
        db.execute(
            delete(CommonConsumption).where(
                CommonConsumption.simulation_run_id == run.id
            )
        )
        db.commit()

    try:
        meter_created = _bulk_insert(db, MeterReading, _meter_rows(run, apartments))
        common_created = (
            _bulk_insert(db, CommonConsumption, _common_rows(run))
            if include_common
            else 0
        )
        _refresh_status(db, run)
        db.commit()
        db.refresh(run)
        return GenerationResult(
            run=run,
            solar_created=0,
            meter_created=meter_created,
            common_created=common_created,
            reused=False,
            message="Apartment and common-area consumption generation completed.",
        )
    except Exception as exc:  # noqa: BLE001
        _mark_failed(db, run.id, exc)
        raise


def _date_conditions(
    column,
    date_from: date | None,
    date_to: date | None,
) -> list[object]:
    conditions: list[object] = []
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


def list_solar_generation(
    db: Session,
    run_id: int,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 1000,
    offset: int = 0,
) -> PageResult:
    filters = [SolarGeneration.simulation_run_id == run_id]
    filters.extend(
        _date_conditions(SolarGeneration.reading_time, date_from, date_to)
    )

    total = int(
        db.scalar(select(func.count()).select_from(SolarGeneration).where(*filters))
        or 0
    )
    items = list(
        db.scalars(
            select(SolarGeneration)
            .where(*filters)
            .order_by(SolarGeneration.reading_time)
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return PageResult(items=items, total=total)


def list_meter_readings(
    db: Session,
    run_id: int,
    *,
    apartment_id: int | None = None,
    flat_number: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 1000,
    offset: int = 0,
) -> PageResult:
    filters = [MeterReading.simulation_run_id == run_id]
    if apartment_id is not None:
        filters.append(MeterReading.apartment_id == apartment_id)
    if flat_number:
        apartment = db.scalar(
            select(Apartment).where(Apartment.flat_number == flat_number)
        )
        if apartment is None:
            raise NotFoundError(f"Apartment {flat_number!r} was not found.")
        filters.append(MeterReading.apartment_id == apartment.id)
    filters.extend(
        _date_conditions(MeterReading.reading_time, date_from, date_to)
    )

    total = int(
        db.scalar(select(func.count()).select_from(MeterReading).where(*filters)) or 0
    )
    items = list(
        db.scalars(
            select(MeterReading)
            .options(selectinload(MeterReading.apartment))
            .where(*filters)
            .order_by(MeterReading.reading_time, MeterReading.apartment_id)
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return PageResult(items=items, total=total)


def list_common_consumption(
    db: Session,
    run_id: int,
    *,
    category: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 1000,
    offset: int = 0,
) -> PageResult:
    filters = [CommonConsumption.simulation_run_id == run_id]
    if category:
        normalized = category.strip().lower()
        if normalized not in CommonAreaCategory.ALL:
            raise ValueError(
                f"Unknown common-area category {category!r}. "
                f"Choose from {', '.join(CommonAreaCategory.ALL)}."
            )
        filters.append(CommonConsumption.category == normalized)
    filters.extend(
        _date_conditions(CommonConsumption.reading_time, date_from, date_to)
    )

    total = int(
        db.scalar(
            select(func.count()).select_from(CommonConsumption).where(*filters)
        )
        or 0
    )
    items = list(
        db.scalars(
            select(CommonConsumption)
            .where(*filters)
            .order_by(CommonConsumption.reading_time, CommonConsumption.category)
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return PageResult(items=items, total=total)


def common_category_totals(
    db: Session,
    run_id: int,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict[str, float]:
    filters = [CommonConsumption.simulation_run_id == run_id]
    filters.extend(
        _date_conditions(CommonConsumption.reading_time, date_from, date_to)
    )
    rows = db.execute(
        select(
            CommonConsumption.category,
            func.sum(CommonConsumption.consumption_kwh),
        )
        .where(*filters)
        .group_by(CommonConsumption.category)
    ).all()
    return {str(category): round(float(total), 4) for category, total in rows}
