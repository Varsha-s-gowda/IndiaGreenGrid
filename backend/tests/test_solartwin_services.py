"""SolarTwin service, simulation and energy-balance tests."""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

import pandas as pd
import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.models import (
    Apartment,
    CommonAreaCategory,
    CommonConsumption,
    MeterReading,
    SimulationRun,
    SolarGeneration,
)
from app.services import (
    apartment_service,
    consumption_service,
    energy_balance,
    simulation_service,
    solar_service,
)

FIXED_START = date(2026, 3, 1)


def _seed_and_load_apartments(db) -> list[Apartment]:
    apartment_service.seed_apartments(db, seed=42)
    return list(db.scalars(select(Apartment).order_by(Apartment.id)).all())


def test_apartment_seed_is_idempotent_and_complete(db):
    first = apartment_service.seed_apartments(db, seed=42)
    second = apartment_service.seed_apartments(db, seed=42)

    assert first.created == 60
    assert first.total == 60
    assert second.created == 0
    assert second.existing == 60
    assert second.total == 60

    apartments = list(db.scalars(select(Apartment).order_by(Apartment.flat_number)).all())
    assert [apartment.flat_number for apartment in apartments] == [
        f"A-{number}" for number in range(101, 161)
    ]
    assert {apartment.floor_number for apartment in apartments} == {1, 2, 3, 4, 5, 6}
    assert {apartment.consumption_profile for apartment in apartments} == {
        "LOW",
        "MEDIUM",
        "HIGH",
        "WORK_FROM_HOME",
        "NIGHT_HEAVY",
    }
    assert all(1 <= apartment.residents_count <= 6 for apartment in apartments)


def test_apartment_specs_are_reproducible():
    first = apartment_service.build_apartment_specs(seed=7)
    second = apartment_service.build_apartment_specs(seed=7)
    different = apartment_service.build_apartment_specs(seed=8)

    assert first == second
    assert first != different


def test_solar_generation_is_physical_and_reproducible():
    frame = solar_service.simulate_solar_generation(50.0, FIXED_START, 30, seed=42)
    repeated = solar_service.simulate_solar_generation(50.0, FIXED_START, 30, seed=42)

    assert len(frame) == 30 * 24
    assert (frame["generation_kwh"] >= 0).all()
    assert frame["generation_kwh"].max() <= 50.0
    assert frame["generation_kwh"].sum() > 0
    pd.testing.assert_frame_equal(frame, repeated)

    night_hours = frame[frame["reading_time"].dt.hour.isin([0, 1, 2, 3, 4, 5, 19, 20, 21, 22, 23])]
    assert night_hours["generation_kwh"].sum() == 0

    by_hour = frame.groupby(frame["reading_time"].dt.hour)["generation_kwh"].mean()
    assert 11 <= int(by_hour.idxmax()) <= 13


def test_solar_capacity_scales_generation():
    small = solar_service.simulate_solar_generation(25.0, FIXED_START, 5, seed=11)
    large = solar_service.simulate_solar_generation(50.0, FIXED_START, 5, seed=11)

    assert large["generation_kwh"].sum() == pytest.approx(
        small["generation_kwh"].sum() * 2, rel=1e-6
    )
    assert large["generation_kwh"].max() <= 50.0


def test_solar_has_daily_weather_and_seasonal_variation():
    winter = solar_service.simulate_solar_generation(
        50.0, date(2026, 1, 15), 5, seed=7
    )
    monsoon = solar_service.simulate_solar_generation(
        50.0, date(2026, 7, 15), 5, seed=7
    )
    month = solar_service.simulate_solar_generation(
        50.0, FIXED_START, 30, seed=42
    )

    assert winter["generation_kwh"].sum() > monsoon["generation_kwh"].sum()
    daily = month.groupby(month["reading_time"].dt.date)["generation_kwh"].sum()
    assert daily.nunique() > 1
    assert daily.min() < daily.max()


def test_apartment_consumption_patterns_are_unique_and_non_negative(db):
    apartments = _seed_and_load_apartments(db)
    frame = consumption_service.simulate_apartment_consumption(
        apartments, FIXED_START, 3, seed=42
    )

    assert len(frame) == 60 * 3 * 24
    assert (frame["consumption_kwh"] >= 0).all()
    assert frame["consumption_kwh"].sum() > 0
    assert frame.groupby("apartment_id")["consumption_kwh"].sum().nunique() > 50

    frame["hour"] = frame["reading_time"].dt.hour
    evening = frame[frame["hour"].isin([19, 20, 21])]["consumption_kwh"].mean()
    night = frame[frame["hour"].isin([1, 2, 3, 4])]["consumption_kwh"].mean()
    assert evening > night


def test_common_area_consumption_has_each_category_and_realistic_shapes():
    frame = consumption_service.simulate_common_consumption(FIXED_START, 3, seed=42)

    assert len(frame) == 4 * 3 * 24
    assert set(frame["category"]) == set(CommonAreaCategory.ALL)
    assert (frame["consumption_kwh"] >= 0).all()
    assert frame.groupby("category")["consumption_kwh"].sum().gt(0).all()

    frame["hour"] = frame["reading_time"].dt.hour
    corridor = frame[frame["category"] == CommonAreaCategory.CORRIDOR_LIGHTS]
    corridor_night = corridor[corridor["hour"].isin([1, 2, 3])]["consumption_kwh"].mean()
    corridor_day = corridor[corridor["hour"].isin([10, 11, 12])]["consumption_kwh"].mean()
    assert corridor_night > corridor_day

    lifts = frame[frame["category"] == CommonAreaCategory.LIFTS]
    lift_evening = lifts[lifts["hour"].isin([18, 19, 20])]["consumption_kwh"].mean()
    lift_night = lifts[lifts["hour"].isin([1, 2, 3])]["consumption_kwh"].mean()
    assert lift_evening > lift_night


def _run(db, *, days: int = 1, capacity: float = 10.0) -> SimulationRun:
    run = SimulationRun(
        status="COMPLETED",
        solar_capacity_kwp=Decimal(str(capacity)),
        start_date=FIXED_START,
        end_date=FIXED_START,
        days=days,
        random_seed=42,
    )
    db.add(run)
    db.flush()
    return run


def _apartment(db) -> Apartment:
    apartment = Apartment(
        flat_number="A-101",
        floor_number=1,
        residents_count=3,
        apartment_category="2BHK",
        consumption_profile="MEDIUM",
    )
    db.add(apartment)
    db.flush()
    return apartment


def test_negative_solar_reading_is_rejected(db):
    run = _run(db)
    db.add(
        SolarGeneration(
            simulation_run_id=run.id,
            reading_time=datetime(2026, 3, 1, 12, tzinfo=timezone.utc),
            generation_kwh=Decimal("-0.5"),
            capacity_kwp=Decimal("10.00"),
            weather_factor=Decimal("0.5"),
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_negative_meter_reading_is_rejected(db):
    run = _run(db)
    apartment = _apartment(db)
    db.add(
        MeterReading(
            simulation_run_id=run.id,
            apartment_id=apartment.id,
            reading_time=datetime(2026, 3, 1, 12, tzinfo=timezone.utc),
            consumption_kwh=Decimal("-1.0"),
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_negative_common_reading_is_rejected(db):
    run = _run(db)
    db.add(
        CommonConsumption(
            simulation_run_id=run.id,
            category=CommonAreaCategory.LIFTS,
            reading_time=datetime(2026, 3, 1, 12, tzinfo=timezone.utc),
            consumption_kwh=Decimal("-1.0"),
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_duplicate_solar_reading_is_rejected(db):
    run = _run(db)
    reading = {
        "simulation_run_id": run.id,
        "reading_time": datetime(2026, 3, 1, 12, tzinfo=timezone.utc),
        "generation_kwh": Decimal("5.0"),
        "capacity_kwp": Decimal("10.00"),
        "weather_factor": Decimal("0.5"),
    }
    db.add(SolarGeneration(**reading))
    db.flush()
    db.add(SolarGeneration(**reading))

    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_duplicate_meter_reading_is_rejected(db):
    run = _run(db)
    apartment = _apartment(db)
    reading = {
        "simulation_run_id": run.id,
        "apartment_id": apartment.id,
        "reading_time": datetime(2026, 3, 1, 12, tzinfo=timezone.utc),
        "consumption_kwh": Decimal("1.0"),
    }
    db.add(MeterReading(**reading))
    db.flush()
    db.add(MeterReading(**reading))

    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_energy_balance_pure_calculation_and_conservation():
    times = pd.date_range("2026-03-01T00:00:00Z", periods=3, freq="h")
    solar = pd.DataFrame({"reading_time": times, "energy_kwh": [10.0, 5.0, 0.0]})
    apartments = pd.DataFrame({"reading_time": times, "energy_kwh": [4.0, 8.0, 2.0]})
    common = pd.DataFrame({"reading_time": times, "energy_kwh": [3.0, 2.0, 1.0]})

    frame = energy_balance.build_balance_frame(solar, apartments, common)
    totals = energy_balance.summarise_balance(frame)

    assert list(frame["common_solar_kwh"]) == [3.0, 2.0, 0.0]
    assert list(frame["remaining_after_common_kwh"]) == [7.0, 3.0, 0.0]
    assert list(frame["apartment_solar_kwh"]) == [4.0, 3.0, 0.0]
    assert list(frame["surplus_kwh"]) == [3.0, 0.0, 0.0]
    assert list(frame["grid_import_kwh"]) == [0.0, 5.0, 3.0]

    assert totals["total_solar_generation_kwh"] == 15.0
    assert totals["total_apartment_consumption_kwh"] == 14.0
    assert totals["total_common_consumption_kwh"] == 6.0
    assert totals["total_building_demand_kwh"] == 20.0
    assert totals["common_solar_utilization_kwh"] == 5.0
    assert totals["solar_to_apartments_kwh"] == 7.0
    assert totals["total_solar_utilized_kwh"] == 12.0
    assert totals["surplus_solar_kwh"] == 3.0
    assert totals["grid_import_kwh"] == 8.0
    assert totals["solar_utilization_percentage"] == 80.0
    assert totals["apartment_solar_coverage_percentage"] == 50.0
    assert totals["common_solar_coverage_percentage"] == 83.33
    assert totals["conservation_ok"] is True
    assert totals["max_conservation_error_kwh"] == 0.0


def test_daily_and_monthly_balance_grouping():
    times = pd.date_range("2026-03-31T22:00:00Z", periods=4, freq="h")
    solar = pd.DataFrame({"reading_time": times, "energy_kwh": [0.0, 0.0, 4.0, 6.0]})
    apartments = pd.DataFrame({"reading_time": times, "energy_kwh": [1.0, 1.0, 2.0, 2.0]})
    common = pd.DataFrame({"reading_time": times, "energy_kwh": [0.5, 0.5, 1.0, 1.0]})
    frame = energy_balance.build_balance_frame(solar, apartments, common)

    daily = energy_balance.grouped_balance(frame, "daily")
    monthly = energy_balance.grouped_balance(frame, "monthly")

    assert [row["period"] for row in daily] == ["2026-03-31", "2026-04-01"]
    assert [row["period"] for row in monthly] == ["2026-03", "2026-04"]
    assert sum(row["total_building_demand_kwh"] for row in daily) == pytest.approx(9.0)


def test_full_simulation_persists_expected_counts_and_balance(db):
    config = simulation_service.SimulationConfig(
        capacity_kwp=20.0,
        start_date=FIXED_START,
        days=1,
        seed=42,
    )
    result = simulation_service.generate_full_simulation(db, config)

    assert result.reused is False
    assert result.solar_created == 24
    assert result.meter_created == 60 * 24
    assert result.common_created == 4 * 24
    assert result.run.status == "COMPLETED"

    counts = {
        "solar": db.scalar(select(func.count()).select_from(SolarGeneration)),
        "meter": db.scalar(select(func.count()).select_from(MeterReading)),
        "common": db.scalar(select(func.count()).select_from(CommonConsumption)),
    }
    assert counts == {"solar": 24, "meter": 1440, "common": 96}

    frame = energy_balance.load_balance_frame(db, result.run.id)
    totals = energy_balance.summarise_balance(frame)
    assert totals["conservation_ok"] is True
    assert totals["total_solar_generation_kwh"] > 0
    assert totals["total_building_demand_kwh"] > 0
    assert totals["grid_import_kwh"] >= 0
    assert totals["surplus_solar_kwh"] >= 0


def test_duplicate_full_generation_is_idempotent_and_regeneration_replaces(db):
    config = simulation_service.SimulationConfig(
        capacity_kwp=20.0,
        start_date=FIXED_START,
        days=1,
        seed=42,
    )
    first = simulation_service.generate_full_simulation(db, config)
    duplicate = simulation_service.generate_full_simulation(db, config)

    assert duplicate.reused is True
    assert duplicate.solar_created == 0
    assert duplicate.run.id == first.run.id
    assert db.scalar(select(func.count()).select_from(SimulationRun)) == 1
    assert db.scalar(select(func.count()).select_from(MeterReading)) == 1440

    regenerated = simulation_service.generate_full_simulation(
        db, config, regenerate=True
    )
    assert regenerated.reused is False
    assert regenerated.solar_created == 24
    assert db.scalar(select(func.count()).select_from(SimulationRun)) == 1
    assert db.scalar(select(func.count()).select_from(MeterReading)) == 1440
    assert db.scalar(select(func.count()).select_from(SolarGeneration)) == 24
