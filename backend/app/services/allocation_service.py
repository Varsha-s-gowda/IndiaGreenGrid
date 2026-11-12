"""Fair solar allocation orchestration.

The service is the single audit boundary between SolarTwin readings and the
allocation API.  It:

* loads actual hourly solar, apartment and common-area readings from PostgreSQL;
* applies SolarTwin's common-first energy-balance rule;
* validates ownership shares and the electricity tariff;
* runs the shared capped weighted-allocation engine for every hour;
* aggregates apartment summaries, fairness metrics and comparisons;
* persists saved runs transactionally and prevents duplicates through an input
  hash plus a database unique constraint.

Preview calculations never write to the database.  What-if scenarios are applied
only in memory and can never be saved.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.models.allocation import (
    AllocationMethod,
    AllocationRecord,
    AllocationRun,
    AllocationRunStatus,
    AllocationSummary,
)
from app.models.apartment import Apartment
from app.models.common_consumption import CommonAreaCategory, CommonConsumption
from app.models.electricity_tariff import ElectricityTariff
from app.models.meter_reading import MeterReading
from app.models.ownership_share import OwnershipShare
from app.models.simulation_run import SimulationRun, SimulationStatus
from app.models.solar_generation import SolarGeneration
from app.models.user import User, UserRole
from app.services import energy_balance, simulation_service
from app.services.allocation_engine import (
    AllocationResult,
    weighted_capped_allocation,
)
from app.services.fairness_engine import (
    ApartmentBenefit,
    calculate_fairness,
    safe_percentage,
)

ALGORITHM_VERSION = "1.0.0"
OWNERSHIP_TOTAL_TOLERANCE = Decimal("0.001")
OWNERSHIP_PERCENTAGE_TOLERANCE = 0.0005
CONSERVATION_TOLERANCE_KWH = 1e-6
MIN_POLICY_LENGTH = 10
MAX_SCENARIO_MULTIPLIER = 10.0


@dataclass(frozen=True)
class OwnershipInfo:
    apartment_id: int
    flat_number: str
    apartment_category: str
    residents_count: int
    contribution_amount: float
    ownership_percentage: float


@dataclass(frozen=True)
class BaseHour:
    reading_time: datetime
    solar_kwh: float
    common_kwh: float
    apartment_consumption: dict[int, float]


@dataclass
class PreparedInputs:
    run: SimulationRun
    date_from: date
    date_to: date
    apartments: list[OwnershipInfo]
    hours: list[BaseHour]
    tariff_price: float
    tariff_id: int | None
    expected_hour_count: int
    complete_hour_count: int
    missing_report: dict[str, Any]
    incomplete_data: bool
    warnings: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class Scenario:
    solar_multiplier: float = 1.0
    demand_multiplier: float = 1.0
    ownership_overrides: dict[str, float] | None = None
    hypothetical: bool = False

    @property
    def active(self) -> bool:
        return (
            abs(self.solar_multiplier - 1.0) > 1e-12
            or abs(self.demand_multiplier - 1.0) > 1e-12
            or bool(self.ownership_overrides)
        )


@dataclass(frozen=True)
class ScenarioHour:
    reading_time: datetime
    solar_kwh: float
    common_kwh: float
    common_solar_kwh: float
    available_energy_kwh: float
    apartment_consumption: dict[int, float]


@dataclass
class MethodComputation:
    method: str
    totals: dict[str, Any]
    summaries: list[dict[str, Any]]
    records: list[dict[str, Any]]
    fairness: dict[str, Any]
    input_hash: str
    warnings: list[str]


def _utc(value: date | datetime) -> datetime:
    if isinstance(value, datetime):
        candidate = value
    else:
        candidate = datetime.combine(value, time.min)
    if candidate.tzinfo is None:
        return candidate.replace(tzinfo=timezone.utc)
    return candidate.astimezone(timezone.utc)


def _key(value: Any) -> str:
    if hasattr(value, "to_pydatetime"):
        value = value.to_pydatetime()
    return _utc(value).isoformat()


def _date_conditions(column, date_from: date, date_to: date) -> list[Any]:
    return [
        column >= _utc(date_from),
        column < _utc(date_to + timedelta(days=1)),
    ]


def _round(value: float, digits: int = 6) -> float:
    return round(float(value), digits)


def _decimal(value: float, digits: str = "0.000001") -> Decimal:
    return Decimal(str(round(float(value), 6))).quantize(Decimal(digits))


def validate_method(method: str) -> str:
    normalized = (method or "").strip().upper()
    if normalized not in AllocationMethod.ALL:
        raise BadRequestError(
            f"Unknown allocation method {method!r}. "
            f"Choose from {', '.join(AllocationMethod.ALL)}."
        )
    return normalized


def validate_scenario(
    *,
    solar_multiplier: float = 1.0,
    demand_multiplier: float = 1.0,
    ownership_overrides: dict[str, float] | None = None,
    hypothetical: bool = False,
) -> Scenario:
    for label, value in (
        ("solar_multiplier", solar_multiplier),
        ("demand_multiplier", demand_multiplier),
    ):
        numeric = float(value)
        if not math.isfinite(numeric):
            raise BadRequestError(f"{label} must be a finite number.")
        if numeric < 0 or numeric > MAX_SCENARIO_MULTIPLIER:
            raise BadRequestError(
                f"{label} must be between 0 and {MAX_SCENARIO_MULTIPLIER:g}."
            )

    cleaned: dict[str, float] | None = None
    if ownership_overrides:
        cleaned = {}
        for key, raw in ownership_overrides.items():
            try:
                percentage = float(raw)
            except (TypeError, ValueError) as exc:
                raise BadRequestError(
                    f"Ownership override for {key!r} must be numeric."
                ) from exc
            if not math.isfinite(percentage) or percentage < 0 or percentage > 100:
                raise BadRequestError(
                    f"Ownership override for {key!r} must be between 0 and 100."
                )
            cleaned[str(key).strip()] = percentage

    return Scenario(
        solar_multiplier=float(solar_multiplier),
        demand_multiplier=float(demand_multiplier),
        ownership_overrides=cleaned,
        hypothetical=bool(hypothetical),
    )


def _resolve_flats_for_overrides(
    apartments: list[OwnershipInfo],
    overrides: dict[str, float] | None,
) -> dict[int, float]:
    ownership = {
        apartment.apartment_id: apartment.ownership_percentage
        for apartment in apartments
    }
    if not overrides:
        return ownership

    by_flat = {apartment.flat_number.upper(): apartment for apartment in apartments}
    by_id = {str(apartment.apartment_id): apartment for apartment in apartments}

    for key, percentage in overrides.items():
        apartment = by_flat.get(key.upper()) or by_id.get(key)
        if apartment is None:
            raise BadRequestError(
                f"Ownership override references unknown flat {key!r}.",
                details={
                    "valid_examples": [item.flat_number for item in apartments[:5]]
                },
            )
        ownership[apartment.apartment_id] = percentage

    total = Decimal("0")
    invalid: list[str] = []
    for apartment in apartments:
        value = ownership[apartment.apartment_id]
        if value < 0 or value > 100:
            invalid.append(apartment.flat_number)
        total += Decimal(str(round(value, 3)))

    if invalid:
        raise BadRequestError(
            "Ownership percentages must be between 0 and 100.",
            details={"invalid_flats": invalid},
        )
    if abs(total - Decimal("100")) > OWNERSHIP_TOTAL_TOLERANCE:
        raise BadRequestError(
            "Ownership percentages must total 100.000%.",
            details={
                "total_percentage": str(total.quantize(Decimal("0.001"))),
                "tolerance": str(OWNERSHIP_TOTAL_TOLERANCE),
            },
        )
    return ownership


def _load_ownership(db: Session) -> list[OwnershipInfo]:
    rows = db.execute(
        select(
            Apartment.id,
            Apartment.flat_number,
            Apartment.apartment_category,
            Apartment.residents_count,
            OwnershipShare.contribution_amount,
            OwnershipShare.ownership_percentage,
        )
        .outerjoin(OwnershipShare, OwnershipShare.apartment_id == Apartment.id)
        .order_by(Apartment.flat_number)
    ).all()

    if not rows:
        raise NotFoundError(
            "No apartments exist. Generate the apartment inventory and "
            "simulation data first."
        )

    missing = [row.flat_number for row in rows if row.ownership_percentage is None]
    if missing:
        raise BadRequestError(
            "Ownership shares are missing for some apartments. Allocation "
            "cannot run without a complete ownership ledger.",
            details={"missing_flats": missing[:20], "missing_count": len(missing)},
        )

    apartments: list[OwnershipInfo] = []
    invalid: list[str] = []
    total = Decimal("0")
    for row in rows:
        percentage = Decimal(str(row.ownership_percentage))
        if percentage < 0 or percentage > 100:
            invalid.append(row.flat_number)
        total += percentage
        apartments.append(
            OwnershipInfo(
                apartment_id=int(row.id),
                flat_number=row.flat_number,
                apartment_category=row.apartment_category,
                residents_count=int(row.residents_count),
                contribution_amount=float(row.contribution_amount or 0),
                ownership_percentage=float(percentage),
            )
        )

    if invalid:
        raise BadRequestError(
            "Ownership percentages must be between 0 and 100.",
            details={"invalid_flats": invalid},
        )
    if abs(total - Decimal("100")) > OWNERSHIP_TOTAL_TOLERANCE:
        raise BadRequestError(
            "Ownership percentages must total 100.000%.",
            details={
                "total_percentage": str(total.quantize(Decimal("0.001"))),
                "tolerance": str(OWNERSHIP_TOTAL_TOLERANCE),
            },
        )
    return apartments


def _load_tariff(
    db: Session, date_from: date, date_to: date
) -> tuple[float, int | None, list[str]]:
    tariff = db.scalar(
        select(ElectricityTariff)
        .where(
            ElectricityTariff.effective_from <= date_to,
            (ElectricityTariff.effective_to.is_(None))
            | (ElectricityTariff.effective_to >= date_from),
        )
        .order_by(ElectricityTariff.effective_from.desc())
        .limit(1)
    )
    if tariff is None:
        return 0.0, None, [
            "No electricity tariff applies to this period; estimated solar "
            "credits are reported as zero."
        ]
    return float(tariff.price_per_kwh), tariff.id, []


def _resolve_run_and_dates(
    db: Session,
    simulation_run_id: int | None,
    date_from: date | None,
    date_to: date | None,
) -> tuple[SimulationRun, date, date]:
    run = simulation_service.resolve_run(db, simulation_run_id)
    resolved_from = date_from or run.start_date
    resolved_to = date_to or run.end_date
    if resolved_from > resolved_to:
        raise BadRequestError("date_from must be on or before date_to.")
    if resolved_from < run.start_date or resolved_to > run.end_date:
        raise BadRequestError(
            "Requested dates fall outside the simulation run period.",
            details={
                "run_start_date": str(run.start_date),
                "run_end_date": str(run.end_date),
                "requested_from": str(resolved_from),
                "requested_to": str(resolved_to),
            },
        )
    return run, resolved_from, resolved_to


def prepare_inputs(
    db: Session,
    simulation_run_id: int | None,
    date_from: date | None,
    date_to: date | None,
    *,
    allow_incomplete: bool = False,
    policy_note: str | None = None,
) -> PreparedInputs:
    run, resolved_from, resolved_to = _resolve_run_and_dates(
        db, simulation_run_id, date_from, date_to
    )
    apartments = _load_ownership(db)
    tariff_price, tariff_id, tariff_warnings = _load_tariff(
        db, resolved_from, resolved_to
    )

    apartment_ids = [apartment.apartment_id for apartment in apartments]
    day_count = (resolved_to - resolved_from).days + 1
    expected_hour_count = day_count * 24
    expected_keys = [
        _utc(datetime.combine(resolved_from, time.min) + timedelta(hours=offset))
        for offset in range(expected_hour_count)
    ]
    expected_key_set = {_key(value) for value in expected_keys}

    solar_keys = {
        _key(value)
        for value in db.scalars(
            select(SolarGeneration.reading_time).where(
                SolarGeneration.simulation_run_id == run.id,
                *_date_conditions(
                    SolarGeneration.reading_time, resolved_from, resolved_to
                ),
            )
        ).all()
    }
    common_rows = db.execute(
        select(
            CommonConsumption.reading_time,
            func.count(),
        )
        .where(
            CommonConsumption.simulation_run_id == run.id,
            *_date_conditions(
                CommonConsumption.reading_time, resolved_from, resolved_to
            ),
        )
        .group_by(CommonConsumption.reading_time)
    ).all()
    common_counts = {_key(row[0]): int(row[1]) for row in common_rows}

    meter_rows = db.execute(
        select(
            MeterReading.reading_time,
            MeterReading.apartment_id,
            MeterReading.consumption_kwh,
        ).where(
            MeterReading.simulation_run_id == run.id,
            *_date_conditions(MeterReading.reading_time, resolved_from, resolved_to),
        )
    ).all()
    meter_counts: dict[str, int] = {}
    demand_by_time: dict[str, dict[int, float]] = {}
    for reading_time, apartment_id, consumption in meter_rows:
        key = _key(reading_time)
        meter_counts[key] = meter_counts.get(key, 0) + 1
        demand_by_time.setdefault(key, {})[int(apartment_id)] = float(consumption)

    frame = energy_balance.load_balance_frame(
        db, run.id, date_from=resolved_from, date_to=resolved_to
    )

    complete_keys = {
        key
        for key in expected_key_set
        if key in solar_keys
        and common_counts.get(key, 0) >= len(CommonAreaCategory.ALL)
        and meter_counts.get(key, 0) >= len(apartment_ids)
    }
    incomplete_keys = expected_key_set - complete_keys

    missing_report = {
        "expected_hours": expected_hour_count,
        "complete_hours": len(complete_keys),
        "incomplete_hours": len(incomplete_keys),
        "missing_solar_hours": len(expected_key_set - solar_keys),
        "missing_common_hours": len(
            {
                key
                for key in expected_key_set
                if common_counts.get(key, 0) < len(CommonAreaCategory.ALL)
            }
        ),
        "missing_apartment_hours": len(
            {
                key
                for key in expected_key_set
                if meter_counts.get(key, 0) < len(apartment_ids)
            }
        ),
        "example_incomplete_hours": sorted(incomplete_keys)[:5],
    }
    incomplete_data = bool(incomplete_keys) or run.status != SimulationStatus.COMPLETED

    warnings = list(tariff_warnings)
    if incomplete_keys:
        if not allow_incomplete:
            raise BadRequestError(
                "The selected period has incomplete SolarTwin readings. "
                "Allocation was not finalized. An administrator may approve a "
                "documented incomplete-data policy for a partial run.",
                details=missing_report,
            )
        if not complete_keys:
            raise BadRequestError(
                "No complete hours exist in the selected period, so allocation "
                "cannot be calculated.",
                details=missing_report,
            )
        warnings.append(
            f"{len(incomplete_keys)} of {expected_hour_count} expected hours were "
            "excluded because one or more source readings were missing. "
            "No readings were interpolated or fabricated."
        )
    if run.status != SimulationStatus.COMPLETED:
        if not allow_incomplete:
            raise BadRequestError(
                f"Simulation run {run.id} has status {run.status}. A completed "
                "run is required unless an administrator approves a documented "
                "incomplete-data policy.",
                details={"simulation_run_id": run.id, "status": run.status},
            )
        warnings.append(
            f"Simulation run {run.id} has status {run.status}; only complete "
            "hours in the requested range were allocated."
        )
    if policy_note and incomplete_keys:
        warnings.append(f"Approved incomplete-data policy: {policy_note.strip()}")

    complete_datetimes: list[BaseHour] = []
    frame_by_key = {
        _key(row.reading_time): row for row in frame.itertuples(index=False)
    }
    for key in sorted(complete_keys):
        row = frame_by_key.get(key)
        if row is None:
            continue
        demands = {
            apartment_id: float(
                demand_by_time.get(key, {}).get(apartment_id, 0.0)
            )
            for apartment_id in apartment_ids
        }
        complete_datetimes.append(
            BaseHour(
                reading_time=_utc(row.reading_time),
                solar_kwh=float(row.solar_kwh),
                common_kwh=float(row.common_kwh),
                apartment_consumption=demands,
            )
        )

    if not complete_datetimes:
        raise BadRequestError(
            "No complete hourly readings were found for allocation.",
            details=missing_report,
        )

    return PreparedInputs(
        run=run,
        date_from=resolved_from,
        date_to=resolved_to,
        apartments=apartments,
        hours=complete_datetimes,
        tariff_price=tariff_price,
        tariff_id=tariff_id,
        expected_hour_count=expected_hour_count,
        complete_hour_count=len(complete_datetimes),
        missing_report=missing_report,
        incomplete_data=incomplete_data,
        warnings=warnings,
    )


def _scenario_hours(
    prepared: PreparedInputs, scenario: Scenario
) -> tuple[list[ScenarioHour], dict[int, float]]:
    ownership = _resolve_flats_for_overrides(
        prepared.apartments, scenario.ownership_overrides
    )
    hours: list[ScenarioHour] = []
    for base in prepared.hours:
        solar = base.solar_kwh * scenario.solar_multiplier
        common = base.common_kwh
        common_solar = min(common, solar)
        available = max(0.0, solar - common_solar)
        demands = {
            apartment_id: demand * scenario.demand_multiplier
            for apartment_id, demand in base.apartment_consumption.items()
        }
        hours.append(
            ScenarioHour(
                reading_time=base.reading_time,
                solar_kwh=solar,
                common_kwh=common,
                common_solar_kwh=common_solar,
                available_energy_kwh=available,
                apartment_consumption=demands,
            )
        )
    return hours, ownership


def _input_hash(
    prepared: PreparedInputs,
    method: str,
    scenario: Scenario,
    hours: list[ScenarioHour],
    ownership: dict[int, float],
) -> str:
    hasher = hashlib.sha256()
    header = {
        "algorithm_version": ALGORITHM_VERSION,
        "simulation_run_id": prepared.run.id,
        "date_from": str(prepared.date_from),
        "date_to": str(prepared.date_to),
        "method": method,
        "tariff": round(prepared.tariff_price, 4),
        "solar_multiplier": round(scenario.solar_multiplier, 6),
        "demand_multiplier": round(scenario.demand_multiplier, 6),
        "hypothetical": scenario.hypothetical,
        "ownership": {
            str(apartment_id): round(value, 3)
            for apartment_id, value in sorted(ownership.items())
        },
    }
    hasher.update(json.dumps(header, sort_keys=True).encode("utf-8"))
    for hour in hours:
        hasher.update(_key(hour.reading_time).encode("utf-8"))
        hasher.update(
            f"{hour.solar_kwh:.6f}|{hour.common_kwh:.6f}|"
            f"{hour.available_energy_kwh:.6f}".encode("utf-8")
        )
        for apartment_id in sorted(hour.apartment_consumption):
            hasher.update(
                f"{apartment_id}:{hour.apartment_consumption[apartment_id]:.6f};"
                .encode("utf-8")
            )
    return hasher.hexdigest()


def _weights_for(
    method: str,
    demands: dict[int, float],
    ownership: dict[int, float],
) -> dict[int, float]:
    if method == AllocationMethod.EQUAL_SHARE:
        return {
            apartment_id: (1.0 if demand > 0 else 0.0)
            for apartment_id, demand in demands.items()
        }
    if method == AllocationMethod.CONSUMPTION_BASED:
        return {
            apartment_id: (demand if demand > 0 else 0.0)
            for apartment_id, demand in demands.items()
        }
    if method == AllocationMethod.OWNERSHIP_BASED:
        return {
            apartment_id: (
                ownership.get(apartment_id, 0.0) if demand > 0 else 0.0
            )
            for apartment_id, demand in demands.items()
        }
    raise BadRequestError(f"Unknown allocation method {method!r}.")


def _eligible_weights(
    weights: dict[int, float], demands: dict[int, float]
) -> dict[int, float]:
    eligible = {
        apartment_id: weight
        for apartment_id, weight in weights.items()
        if weight > 0 and demands.get(apartment_id, 0.0) > 0
    }
    total = sum(eligible.values())
    if total <= 0:
        return {apartment_id: 0.0 for apartment_id in weights}
    return {
        apartment_id: (weight / total if weight > 0 else 0.0)
        for apartment_id, weight in weights.items()
    }


def _allocate_method(
    method: str,
    scenario_hours: list[ScenarioHour],
    prepared: PreparedInputs,
    ownership: dict[int, float],
    scenario: Scenario,
    input_hash: str,
) -> MethodComputation:
    apartments = prepared.apartments
    apartment_by_id = {
        apartment.apartment_id: apartment for apartment in apartments
    }
    totals = {
        "total_solar_generation_kwh": 0.0,
        "common_solar_consumption_kwh": 0.0,
        "available_for_apartments_kwh": 0.0,
        "total_allocated_kwh": 0.0,
        "surplus_kwh": 0.0,
        "total_apartment_consumption_kwh": 0.0,
        "grid_import_kwh": 0.0,
    }
    allocation_by_apartment: dict[int, float] = {
        apartment.apartment_id: 0.0 for apartment in apartments
    }
    consumption_by_apartment: dict[int, float] = {
        apartment.apartment_id: 0.0 for apartment in apartments
    }
    grid_by_apartment: dict[int, float] = {
        apartment.apartment_id: 0.0 for apartment in apartments
    }
    records: list[dict[str, Any]] = []
    max_conservation_error = 0.0
    total_rounds = 0

    for hour in scenario_hours:
        demands = hour.apartment_consumption
        weights = _weights_for(method, demands, ownership)
        result: AllocationResult = weighted_capped_allocation(
            hour.available_energy_kwh, demands, weights
        )
        total_rounds += result.rounds
        normalized = _eligible_weights(weights, demands)

        demand_total = sum(demands.values())
        allocated_total = float(result.total_allocated)
        surplus = hour.available_energy_kwh - allocated_total
        if surplus < -CONSERVATION_TOLERANCE_KWH:
            raise ConflictError(
                "Allocation exceeded available solar energy.",
                details={
                    "reading_time": _key(hour.reading_time),
                    "available_kwh": hour.available_energy_kwh,
                    "allocated_kwh": allocated_total,
                },
            )
        surplus = max(0.0, surplus)
        grid_total = demand_total - allocated_total
        if grid_total < -CONSERVATION_TOLERANCE_KWH:
            raise ConflictError(
                "Allocation exceeded apartment consumption.",
                details={"reading_time": _key(hour.reading_time)},
            )
        grid_total = max(0.0, grid_total)

        solar_error = abs(
            hour.solar_kwh
            - hour.common_solar_kwh
            - allocated_total
            - surplus
        )
        common_grid_total = max(0.0, hour.common_kwh - hour.common_solar_kwh)
        demand_error = abs(
            (hour.common_kwh + demand_total)
            - (
                hour.common_solar_kwh
                + allocated_total
                + common_grid_total
                + grid_total
            )
        )
        max_conservation_error = max(
            max_conservation_error, solar_error, demand_error
        )

        totals["total_solar_generation_kwh"] += hour.solar_kwh
        totals["common_solar_consumption_kwh"] += hour.common_solar_kwh
        totals["available_for_apartments_kwh"] += hour.available_energy_kwh
        totals["total_allocated_kwh"] += allocated_total
        totals["surplus_kwh"] += surplus
        totals["total_apartment_consumption_kwh"] += demand_total
        totals["grid_import_kwh"] += grid_total

        for apartment in apartments:
            apartment_id = apartment.apartment_id
            demand = float(demands.get(apartment_id, 0.0))
            allocated = float(result.allocations.get(apartment_id, 0.0))
            grid = max(0.0, demand - allocated)
            allocation_by_apartment[apartment_id] += allocated
            consumption_by_apartment[apartment_id] += demand
            grid_by_apartment[apartment_id] += grid
            records.append(
                {
                    "reading_time": hour.reading_time,
                    "apartment_id": apartment_id,
                    "flat_number": apartment.flat_number,
                    "consumption_kwh": _round(demand, 4),
                    "allocated_solar_kwh": _round(allocated, 6),
                    "grid_import_kwh": _round(grid, 6),
                    "ownership_percentage": round(
                        ownership.get(apartment_id, 0.0), 3
                    ),
                    "allocation_weight": round(
                        normalized.get(apartment_id, 0.0), 10
                    ),
                }
            )

    summaries: list[dict[str, Any]] = []
    benefits: list[ApartmentBenefit] = []
    for apartment in apartments:
        apartment_id = apartment.apartment_id
        consumption = consumption_by_apartment[apartment_id]
        allocated = allocation_by_apartment[apartment_id]
        grid = grid_by_apartment[apartment_id]
        coverage = safe_percentage(allocated, consumption)
        credit = round(allocated * prepared.tariff_price, 2)
        summary = {
            "apartment_id": apartment_id,
            "flat_number": apartment.flat_number,
            "apartment_category": apartment.apartment_category,
            "residents_count": apartment.residents_count,
            "ownership_percentage": round(
                ownership.get(apartment_id, 0.0), 3
            ),
            "total_consumption_kwh": _round(consumption, 4),
            "total_solar_allocation_kwh": _round(allocated, 6),
            "total_grid_import_kwh": _round(grid, 6),
            "solar_coverage_percentage": coverage,
            "estimated_solar_credit": credit,
        }
        summaries.append(summary)
        benefits.append(
            ApartmentBenefit(
                apartment_id=apartment_id,
                flat_number=apartment.flat_number,
                consumption_kwh=consumption,
                allocation_kwh=allocated,
                grid_import_kwh=grid,
                estimated_credit=credit,
                ownership_percentage=ownership.get(apartment_id, 0.0),
            )
        )

    fairness = calculate_fairness(
        benefits, tariff_price_per_kwh=prepared.tariff_price
    )

    solar_total = totals["total_solar_generation_kwh"]
    common_solar_total = totals["common_solar_consumption_kwh"]
    allocated_total = totals["total_allocated_kwh"]
    consumption_total = totals["total_apartment_consumption_kwh"]
    utilized_total = common_solar_total + allocated_total

    available_total = _round(totals["available_for_apartments_kwh"], 6)
    allocated_total = min(_round(allocated_total, 6), available_total)
    totals = {
        "total_solar_generation_kwh": _round(solar_total, 4),
        "common_solar_consumption_kwh": _round(common_solar_total, 4),
        "available_for_apartments_kwh": available_total,
        "total_allocated_kwh": allocated_total,
        "surplus_kwh": _round(totals["surplus_kwh"], 6),
        "total_apartment_consumption_kwh": _round(consumption_total, 4),
        "grid_import_kwh": _round(totals["grid_import_kwh"], 6),
        "solar_utilization_percentage": safe_percentage(
            utilized_total, solar_total
        ),
        "apartment_solar_coverage_percentage": safe_percentage(
            allocated_total, consumption_total
        ),
        "average_coverage_percentage": fairness["average_coverage_percentage"],
        "hour_count": len(scenario_hours),
        "conservation_ok": max_conservation_error <= CONSERVATION_TOLERANCE_KWH,
        "max_conservation_error_kwh": round(max_conservation_error, 12),
        "allocation_rounds": total_rounds,
        "tariff_price_per_kwh": round(prepared.tariff_price, 4),
    }

    if not totals["conservation_ok"]:
        raise ConflictError(
            "Energy conservation check failed for the allocation result.",
            details={
                "max_conservation_error_kwh": totals[
                    "max_conservation_error_kwh"
                ]
            },
        )

    warnings = list(prepared.warnings)
    if scenario.active or scenario.hypothetical:
        warnings.append(
            "Hypothetical what-if calculation. These values are not saved and "
            "do not modify SolarTwin or allocation records."
        )

    return MethodComputation(
        method=method,
        totals=totals,
        summaries=summaries,
        records=records,
        fairness=fairness,
        input_hash=input_hash,
        warnings=warnings,
    )


def compute_method(
    prepared: PreparedInputs,
    method: str,
    scenario: Scenario,
) -> MethodComputation:
    method = validate_method(method)
    scenario_hours, ownership = _scenario_hours(prepared, scenario)
    input_hash = _input_hash(
        prepared, method, scenario, scenario_hours, ownership
    )
    return _allocate_method(
        method,
        scenario_hours,
        prepared,
        ownership,
        scenario,
        input_hash,
    )


def _find_existing_run(
    db: Session,
    prepared: PreparedInputs,
    method: str,
    input_hash: str,
) -> AllocationRun | None:
    return db.scalar(
        select(AllocationRun)
        .where(
            AllocationRun.simulation_run_id == prepared.run.id,
            AllocationRun.method == method,
            AllocationRun.date_from == prepared.date_from,
            AllocationRun.date_to == prepared.date_to,
            AllocationRun.algorithm_version == ALGORITHM_VERSION,
            AllocationRun.input_hash == input_hash,
            AllocationRun.is_hypothetical.is_(False),
        )
        .order_by(AllocationRun.id.desc())
        .limit(1)
    )


def _persist_run(
    db: Session,
    prepared: PreparedInputs,
    computation: MethodComputation,
    actor: User,
    status: str,
    policy_note: str | None,
) -> AllocationRun:
    totals = computation.totals
    run = AllocationRun(
        simulation_run_id=prepared.run.id,
        method=computation.method,
        status=status,
        date_from=prepared.date_from,
        date_to=prepared.date_to,
        total_solar_generation_kwh=_decimal(
            totals["total_solar_generation_kwh"], "0.000001"
        ),
        common_solar_consumption_kwh=_decimal(
            totals["common_solar_consumption_kwh"], "0.000001"
        ),
        total_available_energy_kwh=_decimal(
            totals["available_for_apartments_kwh"], "0.000001"
        ),
        total_allocated_energy_kwh=_decimal(
            totals["total_allocated_kwh"], "0.000001"
        ),
        total_surplus_energy_kwh=_decimal(totals["surplus_kwh"], "0.000001"),
        total_consumption_kwh=_decimal(
            totals["total_apartment_consumption_kwh"], "0.000001"
        ),
        total_grid_import_kwh=_decimal(totals["grid_import_kwh"], "0.000001"),
        average_coverage_percentage=_decimal(
            totals["average_coverage_percentage"], "0.001"
        ),
        tariff_price_per_kwh=_decimal(prepared.tariff_price, "0.0001"),
        algorithm_version=ALGORITHM_VERSION,
        input_hash=computation.input_hash,
        is_hypothetical=False,
        incomplete_data=prepared.incomplete_data,
        policy_note=policy_note,
        notes="\n".join(computation.warnings) if computation.warnings else None,
        created_by_id=actor.id,
    )
    db.add(run)
    db.flush()

    summary_rows = [
        {
            "allocation_run_id": run.id,
            "apartment_id": summary["apartment_id"],
            "total_consumption_kwh": _decimal(
                summary["total_consumption_kwh"], "0.0001"
            ),
            "total_solar_allocation_kwh": _decimal(
                summary["total_solar_allocation_kwh"], "0.000001"
            ),
            "total_grid_import_kwh": _decimal(
                summary["total_grid_import_kwh"], "0.000001"
            ),
            "solar_coverage_percentage": _decimal(
                summary["solar_coverage_percentage"], "0.001"
            ),
            "estimated_solar_credit": _decimal(
                summary["estimated_solar_credit"], "0.01"
            ),
            "ownership_percentage": _decimal(
                summary["ownership_percentage"], "0.001"
            ),
        }
        for summary in computation.summaries
    ]
    if summary_rows:
        db.execute(AllocationSummary.__table__.insert(), summary_rows)

    record_rows = [
        {
            "allocation_run_id": run.id,
            "apartment_id": record["apartment_id"],
            "reading_time": _utc(record["reading_time"]),
            "consumption_kwh": _decimal(record["consumption_kwh"], "0.0001"),
            "allocated_solar_kwh": _decimal(
                record["allocated_solar_kwh"], "0.000001"
            ),
            "grid_import_kwh": _decimal(record["grid_import_kwh"], "0.000001"),
            "ownership_percentage": _decimal(
                record["ownership_percentage"], "0.001"
            ),
            "allocation_weight": _decimal(
                record["allocation_weight"], "0.0000000001"
            ),
        }
        for record in computation.records
    ]
    chunk_size = 4000
    for start in range(0, len(record_rows), chunk_size):
        db.execute(
            AllocationRecord.__table__.insert(),
            record_rows[start : start + chunk_size],
        )

    return run


def _run_meta(run: AllocationRun, *, creator: User | None = None) -> dict[str, Any]:
    return {
        "id": run.id,
        "simulation_run_id": run.simulation_run_id,
        "method": run.method,
        "method_label": AllocationMethod.LABELS.get(run.method, run.method),
        "status": run.status,
        "date_from": run.date_from,
        "date_to": run.date_to,
        "total_solar_generation_kwh": float(run.total_solar_generation_kwh),
        "common_solar_consumption_kwh": float(run.common_solar_consumption_kwh),
        "available_for_apartments_kwh": float(run.total_available_energy_kwh),
        "total_allocated_kwh": float(run.total_allocated_energy_kwh),
        "surplus_kwh": float(run.total_surplus_energy_kwh),
        "total_apartment_consumption_kwh": float(run.total_consumption_kwh),
        "grid_import_kwh": float(run.total_grid_import_kwh),
        "average_coverage_percentage": float(run.average_coverage_percentage),
        "tariff_price_per_kwh": float(run.tariff_price_per_kwh),
        "algorithm_version": run.algorithm_version,
        "input_hash": run.input_hash,
        "is_hypothetical": bool(run.is_hypothetical),
        "incomplete_data": bool(run.incomplete_data),
        "policy_note": run.policy_note,
        "notes": run.notes,
        "created_at": run.created_at,
        "created_by_id": run.created_by_id,
        "created_by": (
            {"id": creator.id, "name": creator.name, "email": creator.email}
            if creator is not None
            else None
        ),
    }


def _totals_from_run(run: AllocationRun) -> dict[str, Any]:
    solar = float(run.total_solar_generation_kwh)
    common_solar = float(run.common_solar_consumption_kwh)
    available = float(run.total_available_energy_kwh)
    allocated = float(run.total_allocated_energy_kwh)
    surplus = float(run.total_surplus_energy_kwh)
    consumption = float(run.total_consumption_kwh)
    grid = float(run.total_grid_import_kwh)
    utilized = common_solar + allocated
    return {
        "total_solar_generation_kwh": round(solar, 4),
        "common_solar_consumption_kwh": round(common_solar, 4),
        "available_for_apartments_kwh": round(available, 4),
        "total_allocated_kwh": round(allocated, 6),
        "surplus_kwh": round(surplus, 6),
        "total_apartment_consumption_kwh": round(consumption, 4),
        "grid_import_kwh": round(grid, 6),
        "solar_utilization_percentage": safe_percentage(utilized, solar),
        "apartment_solar_coverage_percentage": safe_percentage(
            allocated, consumption
        ),
        "average_coverage_percentage": float(run.average_coverage_percentage),
        "tariff_price_per_kwh": float(run.tariff_price_per_kwh),
    }


def _summaries_for_run(db: Session, run: AllocationRun) -> list[dict[str, Any]]:
    rows = db.execute(
        select(AllocationSummary, Apartment)
        .join(Apartment, Apartment.id == AllocationSummary.apartment_id)
        .where(AllocationSummary.allocation_run_id == run.id)
        .order_by(Apartment.flat_number)
    ).all()
    return [
        {
            "apartment_id": apartment.id,
            "flat_number": apartment.flat_number,
            "apartment_category": apartment.apartment_category,
            "residents_count": apartment.residents_count,
            "ownership_percentage": float(summary.ownership_percentage),
            "total_consumption_kwh": float(summary.total_consumption_kwh),
            "total_solar_allocation_kwh": float(
                summary.total_solar_allocation_kwh
            ),
            "total_grid_import_kwh": float(summary.total_grid_import_kwh),
            "solar_coverage_percentage": float(
                summary.solar_coverage_percentage
            ),
            "estimated_solar_credit": float(summary.estimated_solar_credit),
        }
        for summary, apartment in rows
    ]


def _fairness_from_summaries(
    summaries: list[dict[str, Any]], tariff_price: float
) -> dict[str, Any]:
    benefits = [
        ApartmentBenefit(
            apartment_id=item["apartment_id"],
            flat_number=item["flat_number"],
            consumption_kwh=item["total_consumption_kwh"],
            allocation_kwh=item["total_solar_allocation_kwh"],
            grid_import_kwh=item["total_grid_import_kwh"],
            estimated_credit=item["estimated_solar_credit"],
            ownership_percentage=item["ownership_percentage"],
        )
        for item in summaries
    ]
    return calculate_fairness(benefits, tariff_price_per_kwh=tariff_price)


def _get_run(db: Session, run_id: int) -> AllocationRun:
    run = db.get(AllocationRun, run_id)
    if run is None:
        raise NotFoundError(f"Allocation run {run_id} was not found.")
    return run


def _run_payload(
    db: Session,
    run: AllocationRun,
    *,
    summaries: list[dict[str, Any]] | None = None,
    duplicate: bool = False,
) -> dict[str, Any]:
    loaded_summaries = summaries or _summaries_for_run(db, run)
    fairness = _fairness_from_summaries(
        loaded_summaries, float(run.tariff_price_per_kwh)
    )
    totals = _totals_from_run(run)
    return {
        "saved": True,
        "duplicate": duplicate,
        "run_id": run.id,
        "status": run.status,
        "method": run.method,
        "method_label": AllocationMethod.LABELS.get(run.method, run.method),
        "algorithm_version": run.algorithm_version,
        "input_hash": run.input_hash,
        "is_hypothetical": bool(run.is_hypothetical),
        "incomplete_data": bool(run.incomplete_data),
        "policy_note": run.policy_note,
        "simulation_run_id": run.simulation_run_id,
        "date_from": run.date_from,
        "date_to": run.date_to,
        "apartments_analyzed": len(loaded_summaries),
        "hour_count": int(
            db.scalar(
                select(func.count(func.distinct(AllocationRecord.reading_time)))
                .select_from(AllocationRecord)
                .where(AllocationRecord.allocation_run_id == run.id)
            )
            or 0
        ),
        "totals": totals,
        "fairness": fairness,
        "apartments": loaded_summaries,
        "warnings": [line for line in (run.notes or "").splitlines() if line],
        "created_at": run.created_at,
        "created_by": (
            {"id": run.created_by.id, "name": run.created_by.name, "email": run.created_by.email}
            if run.created_by is not None
            else None
        ),
        "run": _run_meta(run, creator=run.created_by),
    }


def calculate(
    db: Session,
    *,
    actor: User,
    simulation_run_id: int | None,
    date_from: date | None,
    date_to: date | None,
    method: str,
    save: bool,
    solar_multiplier: float = 1.0,
    demand_multiplier: float = 1.0,
    ownership_overrides: dict[str, float] | None = None,
    hypothetical: bool = False,
    allow_incomplete: bool = False,
    incomplete_policy: str | None = None,
) -> dict[str, Any]:
    if actor.role != UserRole.ADMIN:
        raise ForbiddenError("Only administrators can calculate allocations.")

    method = validate_method(method)
    scenario = validate_scenario(
        solar_multiplier=solar_multiplier,
        demand_multiplier=demand_multiplier,
        ownership_overrides=ownership_overrides,
        hypothetical=hypothetical or bool(solar_multiplier != 1.0)
        or bool(demand_multiplier != 1.0)
        or bool(ownership_overrides),
    )
    if save and (scenario.active or scenario.hypothetical):
        raise BadRequestError(
            "What-if scenarios are preview only and cannot be saved. Set save "
            "to false, or reset the scenario inputs."
        )

    policy = (incomplete_policy or "").strip() or None
    prepared = prepare_inputs(
        db,
        simulation_run_id,
        date_from,
        date_to,
        allow_incomplete=allow_incomplete or save,
        policy_note=policy,
    )

    if save and prepared.incomplete_data:
        if not allow_incomplete:
            raise BadRequestError(
                "Saving an incomplete allocation requires allow_incomplete=true."
            )
        if not policy or len(policy) < MIN_POLICY_LENGTH:
            raise BadRequestError(
                "Saving an incomplete allocation requires a documented "
                f"administrator policy of at least {MIN_POLICY_LENGTH} characters.",
                details={"incomplete_report": prepared.missing_report},
            )

    computation = compute_method(prepared, method, scenario)

    if not save:
        return {
            "saved": False,
            "duplicate": False,
            "run_id": None,
            "status": "PREVIEW",
            "method": method,
            "method_label": AllocationMethod.LABELS.get(method, method),
            "algorithm_version": ALGORITHM_VERSION,
            "input_hash": computation.input_hash,
            "is_hypothetical": scenario.active or scenario.hypothetical,
            "incomplete_data": prepared.incomplete_data,
            "policy_note": policy,
            "simulation_run_id": prepared.run.id,
            "date_from": prepared.date_from,
            "date_to": prepared.date_to,
            "apartments_analyzed": len(prepared.apartments),
            "hour_count": computation.totals["hour_count"],
            "expected_hour_count": prepared.expected_hour_count,
            "missing_report": prepared.missing_report,
            "totals": computation.totals,
            "fairness": computation.fairness,
            "apartments": computation.summaries,
            "warnings": computation.warnings,
            "created_at": None,
            "created_by": None,
            "run": None,
        }

    existing = _find_existing_run(db, prepared, method, computation.input_hash)
    if existing is not None:
        return _run_payload(db, existing, duplicate=True)

    status = (
        AllocationRunStatus.SAVED_WITH_GAPS
        if prepared.incomplete_data
        else AllocationRunStatus.SAVED
    )
    try:
        run = _persist_run(db, prepared, computation, actor, status, policy)
        db.commit()
        db.refresh(run)
    except IntegrityError:
        db.rollback()
        existing = _find_existing_run(db, prepared, method, computation.input_hash)
        if existing is None:
            raise ConflictError(
                "This allocation run was saved concurrently; refresh to view the "
                "stored result."
            )
        return _run_payload(db, existing, duplicate=True)
    except Exception:
        db.rollback()
        raise

    return _run_payload(db, run)


def list_runs(
    db: Session,
    *,
    simulation_run_id: int | None = None,
    method: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    filters: list[Any] = []
    if simulation_run_id is not None:
        filters.append(AllocationRun.simulation_run_id == simulation_run_id)
    if method:
        filters.append(AllocationRun.method == validate_method(method))
    if date_from is not None:
        filters.append(AllocationRun.date_from >= date_from)
    if date_to is not None:
        filters.append(AllocationRun.date_to <= date_to)

    total_stmt = select(func.count()).select_from(AllocationRun)
    if filters:
        total_stmt = total_stmt.where(*filters)
    total = int(db.scalar(total_stmt) or 0)

    stmt = select(AllocationRun).order_by(AllocationRun.id.desc())
    if filters:
        stmt = stmt.where(*filters)
    runs = list(db.scalars(stmt.limit(limit).offset(offset)).all())
    items = [_run_meta(run, creator=run.created_by) for run in runs]
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": items,
    }


def get_run_detail(db: Session, run_id: int) -> dict[str, Any]:
    run = _get_run(db, run_id)
    return _run_payload(db, run)


def latest_saved_run(
    db: Session,
    *,
    simulation_run_id: int | None = None,
    method: str | None = None,
    apartment_id: int | None = None,
) -> AllocationRun | None:
    stmt = select(AllocationRun).order_by(AllocationRun.id.desc()).limit(1)
    if simulation_run_id is not None:
        stmt = stmt.where(AllocationRun.simulation_run_id == simulation_run_id)
    if method:
        stmt = stmt.where(AllocationRun.method == validate_method(method))
    if apartment_id is not None:
        stmt = stmt.join(AllocationSummary).where(
            AllocationSummary.apartment_id == apartment_id
        )
    return db.scalar(stmt)


def resolve_apartment(db: Session, flat_ref: str | int) -> Apartment:
    reference = str(flat_ref).strip()
    apartment: Apartment | None = None
    if reference.isdigit():
        apartment = db.get(Apartment, int(reference))
        if apartment is None:
            apartment = db.scalar(
                select(Apartment).where(Apartment.flat_number == reference)
            )
    else:
        apartment = db.scalar(
            select(Apartment).where(
                func.upper(Apartment.flat_number) == reference.upper()
            )
        )
    if apartment is None:
        raise NotFoundError(f"Apartment {flat_ref!r} was not found.")
    return apartment


def enforce_apartment_scope(user: User, apartment: Apartment) -> None:
    if user.role == UserRole.ADMIN:
        return
    if user.apartment_id is None:
        raise ForbiddenError(
            "Your resident account is not linked to an apartment yet."
        )
    if user.apartment_id != apartment.id:
        raise ForbiddenError(
            "Residents can only access allocation records for their own apartment."
        )


def get_apartment_allocation(
    db: Session,
    *,
    actor: User,
    flat_ref: str | int,
    allocation_run_id: int | None,
    simulation_run_id: int | None,
    method: str | None,
    date_from: date | None,
    date_to: date | None,
    allow_incomplete: bool = False,
) -> dict[str, Any]:
    apartment = resolve_apartment(db, flat_ref)
    enforce_apartment_scope(actor, apartment)

    run: AllocationRun | None = None
    if allocation_run_id is not None:
        run = _get_run(db, allocation_run_id)
        if (
            simulation_run_id is not None
            and run.simulation_run_id != simulation_run_id
        ):
            raise BadRequestError(
                "allocation_run_id and simulation_run_id refer to different runs."
            )
        if method and validate_method(method) != run.method:
            raise BadRequestError(
                "allocation_run_id and method refer to different methods."
            )
    else:
        run = latest_saved_run(
            db,
            simulation_run_id=simulation_run_id,
            method=method,
            apartment_id=apartment.id,
        )

    if run is not None:
        summaries = _summaries_for_run(db, run)
        summary = next(
            (item for item in summaries if item["apartment_id"] == apartment.id),
            None,
        )
        if summary is None:
            raise NotFoundError(
                f"No allocation summary exists for flat {apartment.flat_number} "
                f"in run {run.id}."
            )
        return {
            "saved": True,
            "is_hypothetical": bool(run.is_hypothetical),
            "allocation_run_id": run.id,
            "simulation_run_id": run.simulation_run_id,
            "method": run.method,
            "method_label": AllocationMethod.LABELS.get(run.method, run.method),
            "algorithm_version": run.algorithm_version,
            "input_hash": run.input_hash,
            "date_from": run.date_from,
            "date_to": run.date_to,
            "hour_count": _run_hour_count(db, run.id),
            "apartment": {
                "id": apartment.id,
                "flat_number": apartment.flat_number,
                "floor_number": apartment.floor_number,
                "apartment_category": apartment.apartment_category,
                "residents_count": apartment.residents_count,
                "consumption_profile": apartment.consumption_profile,
            },
            "summary": summary,
            "tariff_price_per_kwh": float(run.tariff_price_per_kwh),
            "totals": _totals_from_run(run),
            "policy_note": run.policy_note,
            "warnings": [line for line in (run.notes or "").splitlines() if line],
        }

    resolved_method = validate_method(method or AllocationMethod.EQUAL_SHARE)
    prepared = prepare_inputs(
        db,
        simulation_run_id,
        date_from,
        date_to,
        allow_incomplete=allow_incomplete,
    )
    computation = compute_method(prepared, resolved_method, Scenario())
    summary = next(
        (
            item
            for item in computation.summaries
            if item["apartment_id"] == apartment.id
        ),
        None,
    )
    if summary is None:
        raise NotFoundError(
            f"No preview summary could be produced for flat {apartment.flat_number}."
        )
    return {
        "saved": False,
        "is_hypothetical": False,
        "allocation_run_id": None,
        "simulation_run_id": prepared.run.id,
        "method": resolved_method,
        "method_label": AllocationMethod.LABELS.get(resolved_method, resolved_method),
        "algorithm_version": ALGORITHM_VERSION,
        "input_hash": computation.input_hash,
        "date_from": prepared.date_from,
        "date_to": prepared.date_to,
        "hour_count": prepared.complete_hour_count,
        "apartment": {
            "id": apartment.id,
            "flat_number": apartment.flat_number,
            "floor_number": apartment.floor_number,
            "apartment_category": apartment.apartment_category,
            "residents_count": apartment.residents_count,
            "consumption_profile": apartment.consumption_profile,
        },
        "summary": summary,
        "tariff_price_per_kwh": prepared.tariff_price,
        "totals": computation.totals,
        "policy_note": None,
        "warnings": computation.warnings
        + [
            "No saved allocation run exists yet; these values are a read-only "
            "preview calculated from current SolarTwin readings."
        ],
    }


def _run_hour_count(db: Session, run_id: int) -> int:
    return int(
        db.scalar(
            select(func.count(func.distinct(AllocationRecord.reading_time)))
            .select_from(AllocationRecord)
            .where(AllocationRecord.allocation_run_id == run_id)
        )
        or 0
    )


def _record_rows_for_run(
    db: Session,
    run: AllocationRun,
    *,
    apartment_id: int | None,
    date_from: date | None,
    date_to: date | None,
) -> list[dict[str, Any]]:
    filters: list[Any] = [AllocationRecord.allocation_run_id == run.id]
    if apartment_id is not None:
        filters.append(AllocationRecord.apartment_id == apartment_id)
    if date_from is not None:
        filters.append(
            AllocationRecord.reading_time >= _utc(date_from)
        )
    if date_to is not None:
        filters.append(
            AllocationRecord.reading_time < _utc(date_to + timedelta(days=1))
        )
    rows = db.execute(
        select(AllocationRecord, Apartment.flat_number)
        .join(Apartment, Apartment.id == AllocationRecord.apartment_id)
        .where(*filters)
        .order_by(AllocationRecord.reading_time, Apartment.flat_number)
    ).all()
    return [
        {
            "reading_time": _utc(record.reading_time),
            "apartment_id": record.apartment_id,
            "flat_number": flat_number,
            "consumption_kwh": float(record.consumption_kwh),
            "allocated_solar_kwh": float(record.allocated_solar_kwh),
            "grid_import_kwh": float(record.grid_import_kwh),
            "ownership_percentage": float(record.ownership_percentage),
            "allocation_weight": float(record.allocation_weight),
        }
        for record, flat_number in rows
    ]


def _resolve_records_scope(
    db: Session,
    *,
    actor: User,
    allocation_run_id: int | None,
    simulation_run_id: int | None,
    method: str | None,
    flat_ref: str | int | None,
    date_from: date | None,
    date_to: date | None,
    allow_incomplete: bool,
) -> tuple[
    AllocationRun | None,
    Apartment | None,
    MethodComputation | None,
    PreparedInputs | None,
]:
    apartment: Apartment | None = None
    if flat_ref is not None:
        apartment = resolve_apartment(db, flat_ref)
        enforce_apartment_scope(actor, apartment)
    elif actor.role != UserRole.ADMIN:
        if actor.apartment_id is None:
            raise ForbiddenError(
                "Your resident account is not linked to an apartment yet."
            )
        apartment = db.get(Apartment, actor.apartment_id)
        if apartment is None:
            raise NotFoundError("The apartment linked to your account was not found.")

    if allocation_run_id is not None:
        run = _get_run(db, allocation_run_id)
        if apartment is not None:
            summary_exists = db.scalar(
                select(AllocationSummary.id).where(
                    AllocationSummary.allocation_run_id == run.id,
                    AllocationSummary.apartment_id == apartment.id,
                )
            )
            if summary_exists is None:
                raise NotFoundError(
                    f"Flat {apartment.flat_number} has no records in allocation "
                    f"run {run.id}."
                )
        return run, apartment, None, None

    run = latest_saved_run(
        db,
        simulation_run_id=simulation_run_id,
        method=method,
        apartment_id=apartment.id if apartment is not None else None,
    )
    if run is not None:
        return run, apartment, None, None

    resolved_method = validate_method(method or AllocationMethod.EQUAL_SHARE)
    prepared = prepare_inputs(
        db,
        simulation_run_id,
        date_from,
        date_to,
        allow_incomplete=allow_incomplete,
    )
    computation = compute_method(prepared, resolved_method, Scenario())
    return None, apartment, computation, prepared


def _aggregate_records(
    records: list[dict[str, Any]], granularity: str
) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}
    for record in records:
        timestamp = _utc(record["reading_time"])
        if granularity == "hourly":
            period = timestamp.isoformat()
        elif granularity == "daily":
            period = timestamp.date().isoformat()
        elif granularity == "monthly":
            period = timestamp.strftime("%Y-%m")
        else:
            raise BadRequestError(f"Unsupported granularity {granularity!r}.")

        bucket = buckets.setdefault(
            period,
            {
                "period": period,
                "consumption_kwh": 0.0,
                "allocated_solar_kwh": 0.0,
                "grid_import_kwh": 0.0,
                "ownership_percentage": 0.0,
                "apartment_count": 0,
                "_apartments": set(),
            },
        )
        bucket["consumption_kwh"] += record["consumption_kwh"]
        bucket["allocated_solar_kwh"] += record["allocated_solar_kwh"]
        bucket["grid_import_kwh"] += record["grid_import_kwh"]
        bucket["ownership_percentage"] = max(
            bucket["ownership_percentage"], record["ownership_percentage"]
        )
        bucket["_apartments"].add(record["apartment_id"])

    items: list[dict[str, Any]] = []
    for period in sorted(buckets):
        bucket = buckets[period]
        apartment_count = len(bucket.pop("_apartments"))
        bucket["apartment_count"] = apartment_count
        bucket["consumption_kwh"] = round(bucket["consumption_kwh"], 4)
        bucket["allocated_solar_kwh"] = round(
            bucket["allocated_solar_kwh"], 6
        )
        bucket["grid_import_kwh"] = round(bucket["grid_import_kwh"], 6)
        bucket["solar_coverage_percentage"] = safe_percentage(
            bucket["allocated_solar_kwh"], bucket["consumption_kwh"]
        )
        bucket["ownership_percentage"] = round(
            bucket["ownership_percentage"], 3
        )
        items.append(bucket)
    return items


def get_records(
    db: Session,
    *,
    actor: User,
    granularity: str,
    allocation_run_id: int | None,
    simulation_run_id: int | None,
    method: str | None,
    flat_ref: str | int | None,
    date_from: date | None,
    date_to: date | None,
    limit: int,
    offset: int,
    allow_incomplete: bool = False,
) -> dict[str, Any]:
    if granularity not in ("hourly", "daily", "monthly"):
        raise BadRequestError(
            "granularity must be 'hourly', 'daily' or 'monthly'."
        )
    if date_from is not None and date_to is not None and date_from > date_to:
        raise BadRequestError("date_from must be on or before date_to.")

    run, apartment, computation, prepared = _resolve_records_scope(
        db,
        actor=actor,
        allocation_run_id=allocation_run_id,
        simulation_run_id=simulation_run_id,
        method=method,
        flat_ref=flat_ref,
        date_from=date_from,
        date_to=date_to,
        allow_incomplete=allow_incomplete,
    )

    if run is not None:
        records = _record_rows_for_run(
            db,
            run,
            apartment_id=apartment.id if apartment is not None else None,
            date_from=date_from,
            date_to=date_to,
        )
        resolved_method = run.method
        resolved_run_id = run.id
        saved = True
        resolved_simulation_id = run.simulation_run_id
        warnings = [line for line in (run.notes or "").splitlines() if line]
        input_hash = run.input_hash
        algorithm_version = run.algorithm_version
    else:
        assert computation is not None and prepared is not None
        records = computation.records
        if apartment is not None:
            records = [
                record
                for record in records
                if record["apartment_id"] == apartment.id
            ]
        records = [
            record
            for record in records
            if (date_from is None or _utc(record["reading_time"]).date() >= date_from)
            and (date_to is None or _utc(record["reading_time"]).date() <= date_to)
        ]
        resolved_method = computation.method
        resolved_run_id = None
        saved = False
        resolved_simulation_id = prepared.run.id
        warnings = computation.warnings
        input_hash = computation.input_hash
        algorithm_version = ALGORITHM_VERSION

    if granularity == "hourly":
        selected = records[offset : offset + limit]
        items = [
            {
                **record,
                "period": _utc(record["reading_time"]).isoformat(),
                "solar_coverage_percentage": safe_percentage(
                    record["allocated_solar_kwh"], record["consumption_kwh"]
                ),
            }
            for record in selected
        ]
        total = len(records)
    else:
        aggregated = _aggregate_records(records, granularity)
        total = len(aggregated)
        items = aggregated[offset : offset + limit]

    return {
        "saved": saved,
        "allocation_run_id": resolved_run_id,
        "simulation_run_id": resolved_simulation_id,
        "method": resolved_method,
        "method_label": AllocationMethod.LABELS.get(resolved_method, resolved_method),
        "algorithm_version": algorithm_version,
        "input_hash": input_hash,
        "granularity": granularity,
        "flat_number": apartment.flat_number if apartment is not None else None,
        "apartment_id": apartment.id if apartment is not None else None,
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": items,
        "warnings": warnings,
    }


def fairness(
    db: Session,
    *,
    allocation_run_id: int | None,
    simulation_run_id: int | None,
    date_from: date | None,
    date_to: date | None,
    method: str | None,
    allow_incomplete: bool = False,
) -> dict[str, Any]:
    if allocation_run_id is not None:
        run = _get_run(db, allocation_run_id)
        summaries = _summaries_for_run(db, run)
        metric = _fairness_from_summaries(
            summaries, float(run.tariff_price_per_kwh)
        )
        return {
            "source": "saved",
            "saved": True,
            "allocation_run_id": run.id,
            "simulation_run_id": run.simulation_run_id,
            "date_from": run.date_from,
            "date_to": run.date_to,
            "selected_method": run.method,
            "methods": [
                {
                    "method": run.method,
                    "method_label": AllocationMethod.LABELS.get(
                        run.method, run.method
                    ),
                    "allocation_run_id": run.id,
                    "saved": True,
                    "totals": _totals_from_run(run),
                    "fairness": metric,
                }
            ],
            "comparison": {
                "jain_index": {
                    run.method: metric["jain_index"],
                },
                "average_coverage_percentage": {
                    run.method: metric["average_coverage_percentage"],
                },
                "note": (
                    "Only one saved allocation run was requested. Use the "
                    "comparison endpoint to evaluate all three methods on "
                    "identical inputs."
                ),
            },
            "created_at": run.created_at,
        }

    prepared = prepare_inputs(
        db,
        simulation_run_id,
        date_from,
        date_to,
        allow_incomplete=allow_incomplete,
    )
    methods = [validate_method(method)] if method else list(AllocationMethod.ALL)
    results = []
    for candidate in methods:
        computation = compute_method(prepared, candidate, Scenario())
        results.append(
            {
                "method": candidate,
                "method_label": AllocationMethod.LABELS.get(candidate, candidate),
                "allocation_run_id": None,
                "saved": False,
                "totals": computation.totals,
                "fairness": computation.fairness,
            }
        )

    return {
        "source": "preview",
        "saved": False,
        "allocation_run_id": None,
        "simulation_run_id": prepared.run.id,
        "date_from": prepared.date_from,
        "date_to": prepared.date_to,
        "selected_method": methods[0] if len(methods) == 1 else None,
        "methods": results,
        "comparison": {
            "jain_index": {
                result["method"]: result["fairness"]["jain_index"]
                for result in results
            },
            "average_coverage_percentage": {
                result["method"]: result["fairness"][
                    "average_coverage_percentage"
                ]
                for result in results
            },
            "note": (
                "All methods use identical SolarTwin inputs, dates, ownership "
                "ledger and tariff. A higher Jain index is not a universal "
                "claim of fairness."
            ),
        },
        "created_at": None,
    }


def _saved_method_result(db: Session, run: AllocationRun) -> dict[str, Any]:
    summaries = _summaries_for_run(db, run)
    metric = _fairness_from_summaries(
        summaries, float(run.tariff_price_per_kwh)
    )
    return {
        "method": run.method,
        "method_label": AllocationMethod.LABELS.get(run.method, run.method),
        "allocation_run_id": run.id,
        "saved": True,
        "status": run.status,
        "input_hash": run.input_hash,
        "totals": _totals_from_run(run),
        "fairness": metric,
        "summaries": summaries,
    }


def _preview_method_result(computation: MethodComputation) -> dict[str, Any]:
    return {
        "method": computation.method,
        "method_label": AllocationMethod.LABELS.get(
            computation.method, computation.method
        ),
        "allocation_run_id": None,
        "saved": False,
        "status": "PREVIEW",
        "input_hash": computation.input_hash,
        "totals": computation.totals,
        "fairness": computation.fairness,
        "summaries": computation.summaries,
    }


def _validate_saved_comparison_identical(
    db: Session, runs: list[AllocationRun]
) -> None:
    """Ensure saved runs can be compared without mixing different inputs."""

    if len(runs) < 2:
        return
    first = runs[0]
    baseline_summaries = {
        item["apartment_id"]: item
        for item in _summaries_for_run(db, first)
    }
    for run in runs[1:]:
        if abs(
            float(run.total_consumption_kwh)
            - float(first.total_consumption_kwh)
        ) > 0.0001:
            raise BadRequestError(
                "Saved allocation runs use different apartment consumption inputs.",
                details={
                    "run_a": first.id,
                    "run_b": run.id,
                    "consumption_a": float(first.total_consumption_kwh),
                    "consumption_b": float(run.total_consumption_kwh),
                },
            )
        if abs(
            float(run.total_solar_generation_kwh)
            - float(first.total_solar_generation_kwh)
        ) > 0.0001:
            raise BadRequestError(
                "Saved allocation runs use different solar generation inputs.",
                details={"run_a": first.id, "run_b": run.id},
            )
        if abs(
            float(run.tariff_price_per_kwh)
            - float(first.tariff_price_per_kwh)
        ) > 0.00001:
            raise BadRequestError(
                "Saved allocation runs use different electricity tariffs.",
                details={"run_a": first.id, "run_b": run.id},
            )
        other_summaries = {
            item["apartment_id"]: item for item in _summaries_for_run(db, run)
        }
        if set(other_summaries) != set(baseline_summaries):
            raise BadRequestError(
                "Saved allocation runs cover different apartments.",
                details={"run_a": first.id, "run_b": run.id},
            )
        mismatched = [
            apartment_id
            for apartment_id, item in baseline_summaries.items()
            if abs(
                float(item["ownership_percentage"])
                - float(
                    other_summaries[apartment_id]["ownership_percentage"]
                )
            )
            > 0.001
        ]
        if mismatched:
            raise BadRequestError(
                "Saved allocation runs use different ownership percentages.",
                details={
                    "run_a": first.id,
                    "run_b": run.id,
                    "mismatched_apartment_ids": mismatched[:10],
                },
            )


def _comparison_payload(
    *,
    results: list[dict[str, Any]],
    source: str,
    simulation_run_id: int,
    date_from: date,
    date_to: date,
    tariff_price: float,
    hypothetical: bool,
    warnings: list[str],
    saved_run_ids: dict[str, int] | None = None,
) -> dict[str, Any]:
    summaries_by_method = {
        result["method"]: {
            item["apartment_id"]: item for item in result["summaries"]
        }
        for result in results
    }
    all_apartment_ids = sorted(
        {
            apartment_id
            for mapping in summaries_by_method.values()
            for apartment_id in mapping
        }
    )

    apartments: list[dict[str, Any]] = []
    for apartment_id in all_apartment_ids:
        first = next(
            (
                mapping[apartment_id]
                for mapping in summaries_by_method.values()
                if apartment_id in mapping
            ),
            None,
        )
        if first is None:
            continue
        method_rows: dict[str, Any] = {}
        allocation_values: list[float] = []
        coverage_values: list[float] = []
        for result in results:
            summary = summaries_by_method[result["method"]].get(apartment_id)
            if summary is None:
                continue
            method_rows[result["method"]] = {
                "allocated_kwh": summary["total_solar_allocation_kwh"],
                "grid_import_kwh": summary["total_grid_import_kwh"],
                "coverage_percentage": summary["solar_coverage_percentage"],
                "estimated_credit": summary["estimated_solar_credit"],
            }
            allocation_values.append(summary["total_solar_allocation_kwh"])
            coverage_values.append(summary["solar_coverage_percentage"])

        apartments.append(
            {
                "apartment_id": apartment_id,
                "flat_number": first["flat_number"],
                "apartment_category": first["apartment_category"],
                "residents_count": first["residents_count"],
                "ownership_percentage": first["ownership_percentage"],
                "consumption_kwh": first["total_consumption_kwh"],
                "methods": method_rows,
                "allocation_spread_kwh": round(
                    (max(allocation_values) - min(allocation_values))
                    if allocation_values
                    else 0.0,
                    6,
                ),
                "coverage_spread_percentage": round(
                    (max(coverage_values) - min(coverage_values))
                    if coverage_values
                    else 0.0,
                    4,
                ),
            }
        )

    method_totals = {
        result["method"]: result["totals"] for result in results
    }
    return {
        "source": source,
        "saved": source == "saved",
        "is_hypothetical": hypothetical,
        "simulation_run_id": simulation_run_id,
        "date_from": date_from,
        "date_to": date_to,
        "apartments_compared": len(apartments),
        "tariff_price_per_kwh": round(tariff_price, 4),
        "methods": [
            {
                key: result[key]
                for key in (
                    "method",
                    "method_label",
                    "allocation_run_id",
                    "saved",
                    "status",
                    "input_hash",
                    "totals",
                    "fairness",
                )
            }
            for result in results
        ],
        "method_totals": method_totals,
        "fairness_comparison": {
            "jain_index": {
                result["method"]: result["fairness"]["jain_index"]
                for result in results
            },
            "average_coverage_percentage": {
                result["method"]: result["fairness"][
                    "average_coverage_percentage"
                ]
                for result in results
            },
            "minimum_coverage_percentage": {
                result["method"]: result["fairness"][
                    "minimum_coverage_percentage"
                ]
                for result in results
            },
            "maximum_coverage_percentage": {
                result["method"]: result["fairness"][
                    "maximum_coverage_percentage"
                ]
                for result in results
            },
            "coverage_variance": {
                result["method"]: result["fairness"]["coverage_variance"]
                for result in results
            },
            "note": (
                "Methods are compared on identical inputs. Higher Jain index "
                "means more even coverage, not a universally fairest policy."
            ),
        },
        "apartments": apartments,
        "saved_run_ids": saved_run_ids or {},
        "warnings": warnings,
        "concepts": [
            "Equal share allocates the same kWh first, then redistributes.",
            "Consumption based follows household demand.",
            "Ownership based follows recorded capital contribution.",
        ],
    }


def compare(
    db: Session,
    *,
    simulation_run_id: int | None,
    date_from: date | None,
    date_to: date | None,
    allocation_run_ids: list[int] | None = None,
    source: str = "auto",
    solar_multiplier: float = 1.0,
    demand_multiplier: float = 1.0,
    ownership_overrides: dict[str, float] | None = None,
    hypothetical: bool = False,
    allow_incomplete: bool = False,
    incomplete_policy: str | None = None,
) -> dict[str, Any]:
    scenario = validate_scenario(
        solar_multiplier=solar_multiplier,
        demand_multiplier=demand_multiplier,
        ownership_overrides=ownership_overrides,
        hypothetical=hypothetical
        or bool(solar_multiplier != 1.0)
        or bool(demand_multiplier != 1.0)
        or bool(ownership_overrides),
    )

    if allocation_run_ids:
        if scenario.active:
            raise BadRequestError(
                "Historical saved runs cannot be combined with what-if inputs."
            )
        if len(allocation_run_ids) != len(set(allocation_run_ids)):
            raise BadRequestError("allocation_run_ids must be unique.")
        runs = [_get_run(db, run_id) for run_id in allocation_run_ids]
        first = runs[0]
        for run in runs[1:]:
            if (
                run.simulation_run_id != first.simulation_run_id
                or run.date_from != first.date_from
                or run.date_to != first.date_to
            ):
                raise BadRequestError(
                    "Historical comparisons require allocation runs with the "
                    "same simulation and date range.",
                    details={
                        "expected": {
                            "simulation_run_id": first.simulation_run_id,
                            "date_from": str(first.date_from),
                            "date_to": str(first.date_to),
                        },
                        "run": {
                            "id": run.id,
                            "simulation_run_id": run.simulation_run_id,
                            "date_from": str(run.date_from),
                            "date_to": str(run.date_to),
                        },
                    },
                )
        if len({run.method for run in runs}) != len(runs):
            raise BadRequestError(
                "Historical comparison runs must use different methods."
            )
        methods = [run.method for run in runs]
        if set(methods) != set(AllocationMethod.ALL):
            raise BadRequestError(
                "A complete comparison requires one saved run for each method.",
                details={
                    "provided_methods": methods,
                    "missing_methods": sorted(
                        set(AllocationMethod.ALL) - set(methods)
                    ),
                },
            )
        _validate_saved_comparison_identical(db, runs)
        results = [_saved_method_result(db, run) for run in runs]
        tariff = float(first.tariff_price_per_kwh)
        return _comparison_payload(
            results=results,
            source="saved",
            simulation_run_id=first.simulation_run_id,
            date_from=first.date_from,
            date_to=first.date_to,
            tariff_price=tariff,
            hypothetical=False,
            warnings=["Comparison uses immutable saved allocation runs."],
            saved_run_ids={run.method: run.id for run in runs},
        )

    run, resolved_from, resolved_to = _resolve_run_and_dates(
        db, simulation_run_id, date_from, date_to
    )

    if source not in ("auto", "preview", "saved"):
        raise BadRequestError("source must be 'auto', 'preview' or 'saved'.")
    if source == "saved" and scenario.active:
        raise BadRequestError("Saved comparisons cannot include what-if inputs.")

    saved_by_method: dict[str, AllocationRun] = {}
    if source in ("auto", "saved"):
        for method in AllocationMethod.ALL:
            saved = db.scalar(
                select(AllocationRun)
                .where(
                    AllocationRun.simulation_run_id == run.id,
                    AllocationRun.method == method,
                    AllocationRun.date_from == resolved_from,
                    AllocationRun.date_to == resolved_to,
                    AllocationRun.is_hypothetical.is_(False),
                )
                .order_by(AllocationRun.id.desc())
                .limit(1)
            )
            if saved is not None:
                saved_by_method[method] = saved

    if source == "saved" and len(saved_by_method) != len(AllocationMethod.ALL):
        raise NotFoundError(
            "No complete saved comparison exists for this simulation and date "
            "range. Save all three methods first.",
            details={
                "saved_methods": sorted(saved_by_method),
                "missing_methods": sorted(
                    set(AllocationMethod.ALL) - set(saved_by_method)
                ),
            },
        )

    if source in ("auto", "saved") and len(saved_by_method) == len(
        AllocationMethod.ALL
    ):
        _validate_saved_comparison_identical(
            db,
            [saved_by_method[method] for method in AllocationMethod.ALL],
        )
        results = [
            _saved_method_result(db, saved_by_method[method])
            for method in AllocationMethod.ALL
        ]
        tariff = float(results[0]["totals"].get("tariff_price_per_kwh", 0.0))
        return _comparison_payload(
            results=results,
            source="saved",
            simulation_run_id=run.id,
            date_from=resolved_from,
            date_to=resolved_to,
            tariff_price=tariff,
            hypothetical=False,
            warnings=[
                "Comparison uses the latest immutable saved run for each method "
                "on identical inputs.",
            ],
            saved_run_ids={
                method: saved_by_method[method].id
                for method in saved_by_method
            },
        )

    policy = (incomplete_policy or "").strip() or None
    prepared = prepare_inputs(
        db,
        run.id,
        resolved_from,
        resolved_to,
        allow_incomplete=allow_incomplete,
        policy_note=policy,
    )
    results = []
    for method in AllocationMethod.ALL:
        computation = compute_method(prepared, method, scenario)
        results.append(_preview_method_result(computation))

    warnings = list(prepared.warnings)
    if scenario.active:
        warnings.append(
            "Hypothetical comparison only. No allocation run or billing record "
            "was created."
        )
    return _comparison_payload(
        results=results,
        source="preview",
        simulation_run_id=prepared.run.id,
        date_from=prepared.date_from,
        date_to=prepared.date_to,
        tariff_price=prepared.tariff_price,
        hypothetical=scenario.active or scenario.hypothetical,
        warnings=warnings,
        saved_run_ids={
            method: saved.id for method, saved in saved_by_method.items()
        },
    )
