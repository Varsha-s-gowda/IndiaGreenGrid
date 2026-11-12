"""Shared fixtures for fair-allocation integration tests."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Callable

import pandas as pd
from sqlalchemy import select

from app.models.apartment import Apartment
from app.models.common_consumption import CommonAreaCategory, CommonConsumption
from app.models.electricity_tariff import ElectricityTariff
from app.models.meter_reading import MeterReading
from app.models.simulation_run import SimulationRun, SimulationStatus
from app.models.solar_generation import SolarGeneration
from app.models.user import UserRole
from app.services import apartment_service
from app.services.allocation_setup_service import seed_ownership_shares
from tests.helpers import create_user

START_DATE = date(2026, 3, 1)
DEFAULT_TARIFF = Decimal("7.5000")


def setup_world(
    db,
    *,
    with_ownership: bool = True,
    with_tariff: bool = True,
) -> list[Apartment]:
    """Seed the 60-flat inventory, ownership ledger and default tariff."""

    apartment_service.seed_apartments(db, seed=42)
    if with_ownership:
        seed_ownership_shares(db)
    if with_tariff:
        db.add(
            ElectricityTariff(
                price_per_kwh=DEFAULT_TARIFF,
                effective_from=date(2025, 1, 1),
                effective_to=None,
            )
        )
        db.commit()
    return list(db.scalars(select(Apartment).order_by(Apartment.id)).all())


def _hour_times(
    start: date, days: int
) -> list[datetime]:
    index = pd.date_range(
        start=pd.Timestamp(start).tz_localize("UTC"), periods=days * 24, freq="h"
    )
    return [timestamp.to_pydatetime() for timestamp in index]


def create_run(
    db,
    apartments: list[Apartment],
    *,
    start: date = START_DATE,
    days: int = 1,
    solar_per_hour: float | Callable[[int], float] = 24.0,
    common_per_hour: float | Callable[[int], float] = 0.0,
    demand: float | Callable[[int, Apartment], float] = 1.0,
    status: str = SimulationStatus.COMPLETED,
    omit_meter: Callable[[int, Apartment], bool] | None = None,
    omit_common: Callable[[int, str], bool] | None = None,
    omit_solar: Callable[[int], bool] | None = None,
) -> SimulationRun:
    """Create a deterministic, complete SolarTwin run with controlled values."""

    end = start + timedelta(days=days - 1)
    run = SimulationRun(
        status=status,
        solar_capacity_kwp=Decimal("50.00"),
        start_date=start,
        end_date=end,
        days=days,
        random_seed=1,
        completed_at=datetime.now(timezone.utc)
        if status == SimulationStatus.COMPLETED
        else None,
    )
    db.add(run)
    db.flush()

    times = _hour_times(start, days)
    solar_rows: list[dict[str, object]] = []
    meter_rows: list[dict[str, object]] = []
    common_rows: list[dict[str, object]] = []

    for hour_index, timestamp in enumerate(times):
        solar_value = (
            float(solar_per_hour(hour_index))
            if callable(solar_per_hour)
            else float(solar_per_hour)
        )
        common_value = (
            float(common_per_hour(hour_index))
            if callable(common_per_hour)
            else float(common_per_hour)
        )
        if not omit_solar or not omit_solar(hour_index):
            solar_rows.append(
                {
                    "simulation_run_id": run.id,
                    "reading_time": timestamp,
                    "generation_kwh": Decimal(str(round(solar_value, 4))),
                    "capacity_kwp": Decimal("50.00"),
                    "weather_factor": Decimal("1.0000"),
                }
            )

        for category in CommonAreaCategory.ALL:
            if omit_common and omit_common(hour_index, category):
                continue
            common_rows.append(
                {
                    "simulation_run_id": run.id,
                    "category": category,
                    "reading_time": timestamp,
                    "consumption_kwh": Decimal(
                        str(round(common_value / len(CommonAreaCategory.ALL), 4))
                    ),
                }
            )

        for apartment in apartments:
            if omit_meter and omit_meter(hour_index, apartment):
                continue
            demand_value = (
                float(demand(hour_index, apartment))
                if callable(demand)
                else float(demand)
            )
            meter_rows.append(
                {
                    "simulation_run_id": run.id,
                    "apartment_id": apartment.id,
                    "reading_time": timestamp,
                    "consumption_kwh": Decimal(str(round(demand_value, 4))),
                }
            )

    for model, rows in (
        (SolarGeneration, solar_rows),
        (MeterReading, meter_rows),
        (CommonConsumption, common_rows),
    ):
        for start_index in range(0, len(rows), 4000):
            db.execute(model.__table__.insert(), rows[start_index : start_index + 4000])
    db.commit()
    db.refresh(run)
    return run


def create_linked_resident(db, *, email: str, flat_number: str):
    apartment = db.scalar(
        select(Apartment).where(Apartment.flat_number == flat_number)
    )
    assert apartment is not None
    user = create_user(db, email=email, role=UserRole.RESIDENT)
    user.apartment_id = apartment.id
    db.commit()
    db.refresh(user)
    return user
