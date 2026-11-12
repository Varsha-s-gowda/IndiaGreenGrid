"""SolarVault orchestration: battery dispatch, comparison and persistence.

The service layer is the only place that reads SolarTwin readings, resolves the
effective electricity tariff, turns an administrator's battery configuration
into :class:`battery_engine.BatteryParameters`, calls the pure hourly engine and
persists an immutable simulation snapshot.

Permissions
------------
* ADMIN may update configuration, run/save simulations, publish results and
  read drafts.
* RESIDENT may read only PUBLISHED simulations.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.models.battery import (
    BatteryConfiguration,
    BatteryHourlyRecord,
    BatterySimulation,
    SimulationState,
)
from app.models.electricity_tariff import ElectricityTariff
from app.models.simulation_run import SimulationRun, SimulationStatus
from app.models.user import User, UserRole
from app.services import battery_engine, energy_balance, simulation_service
from app.services.battery_setup_service import seed_default_battery_configuration

ALGORITHM_VERSION = "6.0.0"

DISCLAIMER = (
    "SolarVault results are simulations produced from stored SolarTwin "
    "readings and the battery parameters configured in PostgreSQL. They are "
    "not a guaranteed dispatch schedule, a measurement of real battery "
    "performance or a guarantee of financial savings. Actual storage depends "
    "on equipment behaviour, degradation, weather and tariff rules."
)

LIMITATIONS: tuple[str, ...] = (
    "Battery dispatch is a deterministic rule-based simulation, not a "
    "market-optimising or forecast-driven controller.",
    "Charge and discharge efficiencies are configured planning values. "
    "Temperature effects, degradation, standby draw and inverter clipping are "
    "not modelled individually.",
    "Only surplus solar left after direct common-area and apartment "
    "allocation can charge the battery; stored energy is never allocated to "
    "apartments within the same interval.",
    "Discharging is limited to the minimum-reserve SOC, maximum discharge "
    "power and the hourly unmet demand. Export of stored energy to the grid "
    "is not modelled.",
    "Estimated savings apply the same flat tariff to every avoided grid kWh. "
    "Time-of-use tariffs, demand charges, export credits and taxes are not "
    "included.",
    "Readings come from the selected SolarTwin run; a short run may not "
    "represent seasonal variation.",
)


def _f(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    return float(value)


def _money(value: Any) -> Decimal:
    return Decimal(str(round(float(value), 2)))


def _energy(value: Any) -> Decimal:
    return Decimal(str(round(float(value), 4)))


def _percentage(value: Any) -> Decimal:
    return Decimal(str(round(float(value), 4)))


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _actor_payload(user: User | None) -> dict[str, Any] | None:
    if user is None:
        return None
    return {"id": user.id, "name": user.name, "email": user.email}


def _require_admin(actor: User) -> None:
    if actor.role != UserRole.ADMIN:
        raise ForbiddenError(
            "Only administrators can configure SolarVault and run simulations."
        )


def _clean_number(value: Any) -> Decimal:
    return Decimal(str(value))


def get_active_configuration(db: Session) -> BatteryConfiguration | None:
    return db.scalar(
        select(BatteryConfiguration)
        .options(selectinload(BatteryConfiguration.created_by))
        .where(BatteryConfiguration.is_active.is_(True))
        .order_by(BatteryConfiguration.id.desc())
    )


def _require_configuration(
    db: Session, configuration_id: int | None
) -> BatteryConfiguration:
    if configuration_id is not None:
        configuration = db.scalar(
            select(BatteryConfiguration)
            .options(selectinload(BatteryConfiguration.created_by))
            .where(BatteryConfiguration.id == configuration_id)
        )
    else:
        configuration = get_active_configuration(db)
    if configuration is None:
        raise BadRequestError(
            "No SolarVault battery configuration exists. Create one with "
            "PUT /api/solarvault/configuration."
        )
    return configuration


def configuration_payload(configuration: BatteryConfiguration) -> dict[str, Any]:
    usable = (
        _f(configuration.capacity_kwh)
        * (_f(configuration.max_soc_pct) - _f(configuration.min_soc_pct))
        / 100.0
    )
    return {
        "id": configuration.id,
        "name": configuration.name,
        "capacity_kwh": _f(configuration.capacity_kwh),
        "max_charge_kw": _f(configuration.max_charge_kw),
        "max_discharge_kw": _f(configuration.max_discharge_kw),
        "charge_efficiency_pct": _f(configuration.charge_efficiency_pct),
        "discharge_efficiency_pct": _f(configuration.discharge_efficiency_pct),
        "initial_soc_pct": _f(configuration.initial_soc_pct),
        "min_soc_pct": _f(configuration.min_soc_pct),
        "max_soc_pct": _f(configuration.max_soc_pct),
        "usable_capacity_kwh": round(usable, 4),
        "is_active": configuration.is_active,
        "notes": configuration.notes,
        "created_by": _actor_payload(configuration.created_by),
        "created_at": configuration.created_at,
    }


DEFAULT_CONFIGURATION_FIELDS = {
    "name": "Society battery plan (seeded default)",
    "capacity_kwh": 10.0,
    "max_charge_kw": 5.0,
    "max_discharge_kw": 5.0,
    "charge_efficiency_pct": 95.0,
    "discharge_efficiency_pct": 95.0,
    "initial_soc_pct": 20.0,
    "min_soc_pct": 10.0,
    "max_soc_pct": 95.0,
    "notes": None,
}


def _configuration_from_payload(
    base: BatteryConfiguration | None,
    payload: dict[str, Any],
    *,
    actor: User,
) -> BatteryConfiguration:
    """Merge a partial update over the active configuration or defaults."""

    source: dict[str, Any]
    if base is None:
        source = dict(DEFAULT_CONFIGURATION_FIELDS)
    else:
        source = {
            "name": base.name,
            "capacity_kwh": _f(base.capacity_kwh),
            "max_charge_kw": _f(base.max_charge_kw),
            "max_discharge_kw": _f(base.max_discharge_kw),
            "charge_efficiency_pct": _f(base.charge_efficiency_pct),
            "discharge_efficiency_pct": _f(base.discharge_efficiency_pct),
            "initial_soc_pct": _f(base.initial_soc_pct),
            "min_soc_pct": _f(base.min_soc_pct),
            "max_soc_pct": _f(base.max_soc_pct),
            "notes": base.notes,
        }

    merged = {**source, **payload}
    minimum = float(merged["min_soc_pct"])
    maximum = float(merged["max_soc_pct"])
    initial = float(merged["initial_soc_pct"])
    if minimum > maximum:
        raise BadRequestError("min_soc_pct cannot exceed max_soc_pct.")
    if not minimum <= initial <= maximum:
        raise BadRequestError(
            "initial_soc_pct must lie between min_soc_pct and max_soc_pct.",
            details={
                "initial_soc_pct": initial,
                "min_soc_pct": minimum,
                "max_soc_pct": maximum,
            },
        )
    if float(merged["charge_efficiency_pct"]) <= 0 or float(
        merged["discharge_efficiency_pct"]
    ) <= 0:
        raise BadRequestError("Battery efficiencies must be greater than zero.")

    return BatteryConfiguration(
        name=str(merged["name"]),
        capacity_kwh=_clean_number(merged["capacity_kwh"]),
        max_charge_kw=_clean_number(merged["max_charge_kw"]),
        max_discharge_kw=_clean_number(merged["max_discharge_kw"]),
        charge_efficiency_pct=_clean_number(merged["charge_efficiency_pct"]),
        discharge_efficiency_pct=_clean_number(
            merged["discharge_efficiency_pct"]
        ),
        initial_soc_pct=_clean_number(merged["initial_soc_pct"]),
        min_soc_pct=_clean_number(merged["min_soc_pct"]),
        max_soc_pct=_clean_number(merged["max_soc_pct"]),
        is_active=True,
        notes=merged.get("notes"),
        created_by_id=actor.id,
    )


def update_configuration(
    db: Session, actor: User, payload: dict[str, Any]
) -> dict[str, Any]:
    _require_admin(actor)
    previous = get_active_configuration(db)
    configuration = _configuration_from_payload(previous, payload, actor=actor)
    if previous is not None:
        previous.is_active = False
        previous_id: int | None = previous.id
    else:
        previous_id = None
    db.add(configuration)
    db.commit()
    db.refresh(configuration)
    return {
        "configuration": configuration_payload(configuration),
        "previous_configuration_id": previous_id,
        "created": True,
        "disclaimer": DISCLAIMER,
    }


def configuration_response(db: Session) -> dict[str, Any]:
    configuration = get_active_configuration(db)
    if configuration is None:
        seed_default_battery_configuration(db)
        configuration = get_active_configuration(db)
    if configuration is None:  # pragma: no cover - defensive
        raise NotFoundError("No SolarVault configuration exists.")
    return {
        "configuration": configuration_payload(configuration),
        "previous_configuration_id": None,
        "created": False,
        "disclaimer": DISCLAIMER,
    }


def _resolve_tariff(
    db: Session, on_date: date
) -> tuple[float, str]:
    tariff = db.scalar(
        select(ElectricityTariff)
        .where(
            ElectricityTariff.effective_from <= on_date,
            (ElectricityTariff.effective_to.is_(None))
            | (ElectricityTariff.effective_to >= on_date),
        )
        .order_by(
            ElectricityTariff.effective_from.desc(),
            ElectricityTariff.id.desc(),
        )
    )
    if tariff is None:
        return 0.0, "NOT_CONFIGURED"
    return float(tariff.price_per_kwh), "STORED_TARIFF"


def _parameters_from_configuration(
    configuration: BatteryConfiguration,
    overrides: dict[str, Any] | None = None,
) -> battery_engine.BatteryParameters:
    values = {
        "capacity_kwh": _f(configuration.capacity_kwh),
        "max_charge_kw": _f(configuration.max_charge_kw),
        "max_discharge_kw": _f(configuration.max_discharge_kw),
        "charge_efficiency_pct": _f(configuration.charge_efficiency_pct),
        "discharge_efficiency_pct": _f(configuration.discharge_efficiency_pct),
        "initial_soc_pct": _f(configuration.initial_soc_pct),
        "min_soc_pct": _f(configuration.min_soc_pct),
        "max_soc_pct": _f(configuration.max_soc_pct),
    }
    if overrides:
        values.update({key: value for key, value in overrides.items() if value is not None})
    try:
        return battery_engine.BatteryParameters(
            capacity_kwh=float(values["capacity_kwh"]),
            max_charge_kw=float(values["max_charge_kw"]),
            max_discharge_kw=float(values["max_discharge_kw"]),
            charge_efficiency=float(values["charge_efficiency_pct"]) / 100.0,
            discharge_efficiency=float(
                values["discharge_efficiency_pct"]
            )
            / 100.0,
            initial_soc_pct=float(values["initial_soc_pct"]),
            min_soc_pct=float(values["min_soc_pct"]),
            max_soc_pct=float(values["max_soc_pct"]),
        )
    except ValueError as error:
        raise BadRequestError(str(error)) from error


def _parameters_payload(
    parameters: battery_engine.BatteryParameters,
) -> dict[str, Any]:
    return {
        "capacity_kwh": parameters.capacity_kwh,
        "max_charge_kw": parameters.max_charge_kw,
        "max_discharge_kw": parameters.max_discharge_kw,
        "charge_efficiency_pct": round(parameters.charge_efficiency * 100.0, 4),
        "discharge_efficiency_pct": round(
            parameters.discharge_efficiency * 100.0, 4
        ),
        "initial_soc_pct": parameters.initial_soc_pct,
        "min_soc_pct": parameters.min_soc_pct,
        "max_soc_pct": parameters.max_soc_pct,
        "usable_capacity_kwh": round(parameters.usable_capacity_kwh, 4),
    }


def comparison_payload(
    result: battery_engine.BatterySimulationResult,
    *,
    tariff_price: float,
    simulation_id: int | None = None,
    simulation_code: str | None = None,
) -> dict[str, Any]:
    baseline_utilization = result.baseline_solar_utilization_pct
    battery_utilization = result.solar_utilization_pct
    baseline = {
        "solar_generation_kwh": result.total_solar_generation_kwh,
        "direct_solar_kwh": result.direct_solar_kwh,
        "stored_energy_kwh": 0.0,
        "discharged_kwh": 0.0,
        "charge_loss_kwh": 0.0,
        "discharge_loss_kwh": 0.0,
        "total_losses_kwh": 0.0,
        "final_soc_pct": 0.0,
        "grid_import_kwh": result.baseline_grid_import_kwh,
        "remaining_surplus_kwh": result.baseline_surplus_kwh,
        "solar_utilization_pct": baseline_utilization,
    }
    with_battery = {
        "solar_generation_kwh": result.total_solar_generation_kwh,
        "direct_solar_kwh": result.direct_solar_kwh,
        "stored_energy_kwh": result.total_charged_kwh,
        "discharged_kwh": result.total_discharged_kwh,
        "charge_loss_kwh": result.total_charge_loss_kwh,
        "discharge_loss_kwh": result.total_discharge_loss_kwh,
        "total_losses_kwh": result.total_losses_kwh,
        "final_soc_pct": result.final_soc_pct,
        "grid_import_kwh": result.grid_import_kwh,
        "remaining_surplus_kwh": result.remaining_surplus_kwh,
        "solar_utilization_pct": battery_utilization,
    }
    return {
        "simulation_id": simulation_id,
        "simulation_code": simulation_code,
        "baseline": baseline,
        "with_battery": with_battery,
        "savings": {
            "grid_reduction_kwh": result.grid_reduction_kwh,
            "grid_reduction_pct": result.grid_reduction_pct,
            "solar_utilization_gain_pct": round(
                battery_utilization - baseline_utilization, 4
            ),
            "surplus_reduction_kwh": round(
                result.baseline_surplus_kwh - result.remaining_surplus_kwh, 4
            ),
            "estimated_savings": round(
                result.grid_reduction_kwh * tariff_price, 2
            ),
            "tariff_price_per_kwh": round(tariff_price, 4),
        },
    }


def _comparison_from_simulation(simulation: BatterySimulation) -> dict[str, Any]:
    baseline_utilization = _f(simulation.baseline_solar_utilization_pct)
    with_utilization = _f(simulation.solar_utilization_pct)
    baseline = {
        "solar_generation_kwh": _f(simulation.total_solar_generation_kwh),
        "direct_solar_kwh": _f(simulation.direct_solar_kwh),
        "stored_energy_kwh": 0.0,
        "discharged_kwh": 0.0,
        "charge_loss_kwh": 0.0,
        "discharge_loss_kwh": 0.0,
        "total_losses_kwh": 0.0,
        "final_soc_pct": 0.0,
        "grid_import_kwh": _f(simulation.baseline_grid_import_kwh),
        "remaining_surplus_kwh": _f(simulation.baseline_surplus_kwh),
        "solar_utilization_pct": baseline_utilization,
    }
    with_battery = {
        "solar_generation_kwh": _f(simulation.total_solar_generation_kwh),
        "direct_solar_kwh": _f(simulation.direct_solar_kwh),
        "stored_energy_kwh": _f(simulation.total_charged_kwh),
        "discharged_kwh": _f(simulation.total_discharged_kwh),
        "charge_loss_kwh": _f(simulation.total_charge_loss_kwh),
        "discharge_loss_kwh": _f(simulation.total_discharge_loss_kwh),
        "total_losses_kwh": _f(simulation.total_losses_kwh),
        "final_soc_pct": _f(simulation.final_soc_pct),
        "grid_import_kwh": _f(simulation.grid_import_kwh),
        "remaining_surplus_kwh": _f(simulation.remaining_surplus_kwh),
        "solar_utilization_pct": with_utilization,
    }
    return {
        "simulation_id": simulation.id,
        "simulation_code": simulation.simulation_code,
        "baseline": baseline,
        "with_battery": with_battery,
        "savings": {
            "grid_reduction_kwh": _f(simulation.grid_reduction_kwh),
            "grid_reduction_pct": _f(simulation.grid_reduction_pct),
            "solar_utilization_gain_pct": round(
                with_utilization - baseline_utilization, 4
            ),
            "surplus_reduction_kwh": round(
                _f(simulation.baseline_surplus_kwh)
                - _f(simulation.remaining_surplus_kwh),
                4,
            ),
            "estimated_savings": _f(simulation.estimated_savings),
            "tariff_price_per_kwh": _f(simulation.tariff_price_per_kwh),
        },
    }


def _input_hash(payload: dict[str, Any]) -> str:
    serialised = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(serialised.encode("utf-8")).hexdigest()


def _simulation_code(input_hash: str, created_at: datetime) -> str:
    return f"SV-{created_at.strftime('%Y%m%d%H%M%S')}-{input_hash[:6].upper()}"


def _hypothetical_payload(
    *,
    result: battery_engine.BatterySimulationResult,
    run: SimulationRun,
    configuration: BatteryConfiguration,
    parameters: battery_engine.BatteryParameters,
    tariff_price: float,
    tariff_source: str,
    created_at: datetime,
) -> dict[str, Any]:
    input_hash = _input_hash(
        {
            "algorithm_version": ALGORITHM_VERSION,
            "simulation_run_id": run.id,
            "battery_configuration_id": configuration.id,
            "parameters": _parameters_payload(parameters),
            "preview": True,
        }
    )
    return {
        "id": 0,
        "simulation_code": f"SV-PREVIEW-{input_hash[:8].upper()}",
        "status": SimulationState.DRAFT,
        "simulation_run_id": run.id,
        "battery_configuration_id": configuration.id,
        "period_start": run.start_date,
        "period_end": run.end_date,
        "hour_count": result.hour_count,
        "tariff_price_per_kwh": round(tariff_price, 4),
        "tariff_source": tariff_source,
        "capacity_kwh": parameters.capacity_kwh,
        "max_charge_kw": parameters.max_charge_kw,
        "max_discharge_kw": parameters.max_discharge_kw,
        "charge_efficiency_pct": round(parameters.charge_efficiency * 100, 4),
        "discharge_efficiency_pct": round(
            parameters.discharge_efficiency * 100, 4
        ),
        "initial_soc_pct": parameters.initial_soc_pct,
        "min_soc_pct": parameters.min_soc_pct,
        "max_soc_pct": parameters.max_soc_pct,
        "initial_stored_kwh": result.initial_stored_kwh,
        "final_stored_kwh": result.final_stored_kwh,
        "initial_soc_actual_pct": result.initial_soc_pct,
        "final_soc_pct": result.final_soc_pct,
        "total_solar_generation_kwh": result.total_solar_generation_kwh,
        "total_apartment_consumption_kwh": round(
            float(
                sum(row["apartment_consumption_kwh"] for row in result.rows)
            ),
            4,
        ),
        "total_common_consumption_kwh": round(
            float(sum(row["common_consumption_kwh"] for row in result.rows)), 4
        ),
        "total_building_demand_kwh": round(
            float(sum(row["total_demand_kwh"] for row in result.rows)), 4
        ),
        "direct_solar_kwh": result.direct_solar_kwh,
        "total_charged_kwh": result.total_charged_kwh,
        "total_stored_gain_kwh": result.total_stored_gain_kwh,
        "total_discharged_kwh": result.total_discharged_kwh,
        "total_stored_used_kwh": result.total_stored_used_kwh,
        "total_charge_loss_kwh": result.total_charge_loss_kwh,
        "total_discharge_loss_kwh": result.total_discharge_loss_kwh,
        "total_losses_kwh": result.total_losses_kwh,
        "baseline_grid_import_kwh": result.baseline_grid_import_kwh,
        "baseline_surplus_kwh": result.baseline_surplus_kwh,
        "grid_import_kwh": result.grid_import_kwh,
        "remaining_surplus_kwh": result.remaining_surplus_kwh,
        "baseline_solar_utilization_pct": result.baseline_solar_utilization_pct,
        "solar_utilization_pct": result.solar_utilization_pct,
        "grid_reduction_kwh": result.grid_reduction_kwh,
        "grid_reduction_pct": result.grid_reduction_pct,
        "estimated_savings": round(
            result.grid_reduction_kwh * tariff_price, 2
        ),
        "conservation_ok": result.conservation_ok,
        "max_conservation_error_kwh": result.max_conservation_error_kwh,
        "algorithm_version": ALGORITHM_VERSION,
        "input_hash": input_hash,
        "notes": None,
        "created_by": None,
        "published_by": None,
        "published_at": None,
        "created_at": created_at,
        "assumptions": {
            "parameters": _parameters_payload(parameters),
            "tariff_source": tariff_source,
            "preview": True,
        },
        "warnings": list(result.warnings),
        "limitations": list(LIMITATIONS),
        "configuration": None,
        "comparison": None,
    }


def simulate(
    db: Session,
    actor: User,
    *,
    simulation_run_id: int | None = None,
    configuration_id: int | None = None,
    save: bool = True,
    publish: bool = True,
    notes: str | None = None,
    overrides: dict[str, Any] | None = None,
) -> dict[str, Any]:
    _require_admin(actor)
    if save and overrides:
        raise BadRequestError(
            "Hypothetical overrides can only be used with save=false."
        )

    run = simulation_service.resolve_run(db, simulation_run_id)
    if run.status != SimulationStatus.COMPLETED:
        raise BadRequestError(
            "SolarVault needs a completed SolarTwin run with stored readings.",
            details={"simulation_run_id": run.id, "status": run.status},
        )

    configuration = _require_configuration(db, configuration_id)
    parameters = _parameters_from_configuration(configuration, overrides)

    frame = energy_balance.load_balance_frame(db, run.id)
    if frame.empty:
        raise BadRequestError(
            f"Simulation run {run.id} has no stored readings to simulate.",
            details={"simulation_run_id": run.id},
        )

    result = battery_engine.simulate_battery(frame, parameters)
    if result.hour_count <= 0:
        raise BadRequestError("The selected run produced no hourly intervals.")

    tariff_price, tariff_source = _resolve_tariff(db, run.end_date)
    created_at = _utc_now()

    if not save:
        payload = _hypothetical_payload(
            result=result,
            run=run,
            configuration=configuration,
            parameters=parameters,
            tariff_price=tariff_price,
            tariff_source=tariff_source,
            created_at=created_at,
        )
        comparison = comparison_payload(
            result,
            tariff_price=tariff_price,
            simulation_id=0,
            simulation_code=payload["simulation_code"],
        )
        return {
            "saved": False,
            "published": False,
            "duplicate": False,
            "simulation": payload,
            "comparison": comparison,
            "disclaimer": DISCLAIMER,
            "limitations": list(LIMITATIONS),
        }

    total_apartment = float(frame["apartment_kwh"].sum())
    total_common = float(frame["common_kwh"].sum())
    total_demand = total_apartment + total_common
    assumption_payload = {
        "parameters": _parameters_payload(parameters),
        "tariff_source": tariff_source,
        "algorithm_version": ALGORITHM_VERSION,
    }
    input_hash = _input_hash(
        {
            "algorithm_version": ALGORITHM_VERSION,
            "simulation_run_id": run.id,
            "battery_configuration_id": configuration.id,
            "parameters": _parameters_payload(parameters),
            "source": {
                "solar_kwh": result.total_solar_generation_kwh,
                "apartment_kwh": round(total_apartment, 4),
                "common_kwh": round(total_common, 4),
            },
        }
    )

    existing = db.scalar(
        select(BatterySimulation)
        .options(
            selectinload(BatterySimulation.configuration),
            selectinload(BatterySimulation.created_by),
            selectinload(BatterySimulation.published_by),
        )
        .where(
            BatterySimulation.simulation_run_id == run.id,
            BatterySimulation.battery_configuration_id == configuration.id,
            BatterySimulation.input_hash == input_hash,
        )
        .order_by(BatterySimulation.id.desc())
    )
    if existing is not None:
        if publish and existing.status != SimulationState.PUBLISHED:
            existing.status = SimulationState.PUBLISHED
            existing.published_at = created_at
            existing.published_by_id = actor.id
            db.commit()
            db.refresh(existing)
        return {
            "saved": True,
            "published": existing.status == SimulationState.PUBLISHED,
            "duplicate": True,
            "simulation": simulation_payload(existing),
            "comparison": _comparison_from_simulation(existing),
            "disclaimer": DISCLAIMER,
            "limitations": list(LIMITATIONS),
        }

    period_start, period_end = energy_balance.period_bounds(frame)
    if period_start is None or period_end is None:  # pragma: no cover
        period_start = datetime.combine(
            run.start_date, datetime.min.time(), tzinfo=timezone.utc
        )
        period_end = datetime.combine(
            run.end_date, datetime.max.time(), tzinfo=timezone.utc
        )

    status = SimulationState.PUBLISHED if publish else SimulationState.DRAFT
    simulation = BatterySimulation(
        simulation_code=_simulation_code(input_hash, created_at),
        simulation_run_id=run.id,
        battery_configuration_id=configuration.id,
        status=status,
        period_start=period_start,
        period_end=period_end,
        hour_count=result.hour_count,
        tariff_price_per_kwh=Decimal(str(round(tariff_price, 4))),
        tariff_source=tariff_source,
        capacity_kwh=_clean_number(parameters.capacity_kwh),
        max_charge_kw=_clean_number(parameters.max_charge_kw),
        max_discharge_kw=_clean_number(parameters.max_discharge_kw),
        charge_efficiency_pct=_clean_number(
            parameters.charge_efficiency * 100
        ),
        discharge_efficiency_pct=_clean_number(
            parameters.discharge_efficiency * 100
        ),
        initial_soc_pct=_clean_number(parameters.initial_soc_pct),
        min_soc_pct=_clean_number(parameters.min_soc_pct),
        max_soc_pct=_clean_number(parameters.max_soc_pct),
        initial_stored_kwh=_energy(result.initial_stored_kwh),
        final_stored_kwh=_energy(result.final_stored_kwh),
        initial_soc_actual_pct=_percentage(result.initial_soc_pct),
        final_soc_pct=_percentage(result.final_soc_pct),
        total_solar_generation_kwh=_energy(result.total_solar_generation_kwh),
        total_apartment_consumption_kwh=_energy(total_apartment),
        total_common_consumption_kwh=_energy(total_common),
        total_building_demand_kwh=_energy(total_demand),
        direct_solar_kwh=_energy(result.direct_solar_kwh),
        total_charged_kwh=_energy(result.total_charged_kwh),
        total_stored_gain_kwh=_energy(result.total_stored_gain_kwh),
        total_discharged_kwh=_energy(result.total_discharged_kwh),
        total_stored_used_kwh=_energy(result.total_stored_used_kwh),
        total_charge_loss_kwh=_energy(result.total_charge_loss_kwh),
        total_discharge_loss_kwh=_energy(result.total_discharge_loss_kwh),
        total_losses_kwh=_energy(result.total_losses_kwh),
        baseline_grid_import_kwh=_energy(result.baseline_grid_import_kwh),
        baseline_surplus_kwh=_energy(result.baseline_surplus_kwh),
        grid_import_kwh=_energy(result.grid_import_kwh),
        remaining_surplus_kwh=_energy(result.remaining_surplus_kwh),
        baseline_solar_utilization_pct=_percentage(
            result.baseline_solar_utilization_pct
        ),
        solar_utilization_pct=_percentage(result.solar_utilization_pct),
        grid_reduction_kwh=_energy(result.grid_reduction_kwh),
        grid_reduction_pct=_percentage(result.grid_reduction_pct),
        estimated_savings=_money(
            result.grid_reduction_kwh * tariff_price
        ),
        conservation_ok=result.conservation_ok,
        max_conservation_error_kwh=Decimal(
            str(round(result.max_conservation_error_kwh, 9))
        ),
        assumptions=assumption_payload,
        warnings=list(result.warnings),
        limitations=list(LIMITATIONS),
        algorithm_version=ALGORITHM_VERSION,
        input_hash=input_hash,
        notes=notes,
        created_by_id=actor.id,
        published_by_id=actor.id if publish else None,
        published_at=created_at if publish else None,
        created_at=created_at,
    )
    db.add(simulation)
    db.flush()

    for row in result.rows:
        db.add(
            BatteryHourlyRecord(
                simulation_id=simulation.id,
                timestamp=row["reading_time"],
                solar_generation_kwh=_energy(row["solar_generation_kwh"]),
                apartment_consumption_kwh=_energy(
                    row["apartment_consumption_kwh"]
                ),
                common_consumption_kwh=_energy(row["common_consumption_kwh"]),
                total_demand_kwh=_energy(row["total_demand_kwh"]),
                direct_solar_kwh=_energy(row["direct_solar_kwh"]),
                direct_common_solar_kwh=_energy(
                    row["direct_common_solar_kwh"]
                ),
                direct_apartment_solar_kwh=_energy(
                    row["direct_apartment_solar_kwh"]
                ),
                charge_energy_kwh=_energy(row["charge_energy_kwh"]),
                stored_gain_kwh=_energy(row["stored_gain_kwh"]),
                discharge_energy_kwh=_energy(row["discharge_energy_kwh"]),
                stored_used_kwh=_energy(row["stored_used_kwh"]),
                charge_loss_kwh=_energy(row["charge_loss_kwh"]),
                discharge_loss_kwh=_energy(row["discharge_loss_kwh"]),
                soc_kwh=_energy(row["soc_kwh"]),
                soc_percentage=_percentage(row["soc_percentage"]),
                grid_import_kwh=_energy(row["grid_import_kwh"]),
                surplus_kwh=_energy(row["surplus_kwh"]),
                baseline_grid_import_kwh=_energy(
                    row["baseline_grid_import_kwh"]
                ),
                baseline_surplus_kwh=_energy(row["baseline_surplus_kwh"]),
            )
        )

    db.commit()
    db.refresh(simulation)
    return {
        "saved": True,
        "published": publish,
        "duplicate": False,
        "simulation": simulation_payload(simulation),
        "comparison": _comparison_from_simulation(simulation),
        "disclaimer": DISCLAIMER,
        "limitations": list(LIMITATIONS),
    }


def hourly_payload(record: BatteryHourlyRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "simulation_id": record.simulation_id,
        "timestamp": record.timestamp,
        "solar_generation_kwh": _f(record.solar_generation_kwh),
        "apartment_consumption_kwh": _f(record.apartment_consumption_kwh),
        "common_consumption_kwh": _f(record.common_consumption_kwh),
        "total_demand_kwh": _f(record.total_demand_kwh),
        "direct_solar_kwh": _f(record.direct_solar_kwh),
        "direct_common_solar_kwh": _f(record.direct_common_solar_kwh),
        "direct_apartment_solar_kwh": _f(record.direct_apartment_solar_kwh),
        "charge_energy_kwh": _f(record.charge_energy_kwh),
        "stored_gain_kwh": _f(record.stored_gain_kwh),
        "discharge_energy_kwh": _f(record.discharge_energy_kwh),
        "stored_used_kwh": _f(record.stored_used_kwh),
        "charge_loss_kwh": _f(record.charge_loss_kwh),
        "discharge_loss_kwh": _f(record.discharge_loss_kwh),
        "soc_kwh": _f(record.soc_kwh),
        "soc_percentage": _f(record.soc_percentage),
        "grid_import_kwh": _f(record.grid_import_kwh),
        "surplus_kwh": _f(record.surplus_kwh),
        "baseline_grid_import_kwh": _f(record.baseline_grid_import_kwh),
        "baseline_surplus_kwh": _f(record.baseline_surplus_kwh),
    }


def simulation_summary_payload(simulation: BatterySimulation) -> dict[str, Any]:
    return {
        "id": simulation.id,
        "simulation_code": simulation.simulation_code,
        "status": simulation.status,
        "simulation_run_id": simulation.simulation_run_id,
        "battery_configuration_id": simulation.battery_configuration_id,
        "period_start": simulation.period_start,
        "period_end": simulation.period_end,
        "hour_count": simulation.hour_count,
        "tariff_price_per_kwh": _f(simulation.tariff_price_per_kwh),
        "tariff_source": simulation.tariff_source,
        "capacity_kwh": _f(simulation.capacity_kwh),
        "max_charge_kw": _f(simulation.max_charge_kw),
        "max_discharge_kw": _f(simulation.max_discharge_kw),
        "charge_efficiency_pct": _f(simulation.charge_efficiency_pct),
        "discharge_efficiency_pct": _f(
            simulation.discharge_efficiency_pct
        ),
        "initial_soc_pct": _f(simulation.initial_soc_pct),
        "min_soc_pct": _f(simulation.min_soc_pct),
        "max_soc_pct": _f(simulation.max_soc_pct),
        "initial_stored_kwh": _f(simulation.initial_stored_kwh),
        "final_stored_kwh": _f(simulation.final_stored_kwh),
        "initial_soc_actual_pct": _f(simulation.initial_soc_actual_pct),
        "final_soc_pct": _f(simulation.final_soc_pct),
        "total_solar_generation_kwh": _f(
            simulation.total_solar_generation_kwh
        ),
        "total_apartment_consumption_kwh": _f(
            simulation.total_apartment_consumption_kwh
        ),
        "total_common_consumption_kwh": _f(
            simulation.total_common_consumption_kwh
        ),
        "total_building_demand_kwh": _f(
            simulation.total_building_demand_kwh
        ),
        "direct_solar_kwh": _f(simulation.direct_solar_kwh),
        "total_charged_kwh": _f(simulation.total_charged_kwh),
        "total_stored_gain_kwh": _f(simulation.total_stored_gain_kwh),
        "total_discharged_kwh": _f(simulation.total_discharged_kwh),
        "total_stored_used_kwh": _f(simulation.total_stored_used_kwh),
        "total_charge_loss_kwh": _f(simulation.total_charge_loss_kwh),
        "total_discharge_loss_kwh": _f(simulation.total_discharge_loss_kwh),
        "total_losses_kwh": _f(simulation.total_losses_kwh),
        "baseline_grid_import_kwh": _f(
            simulation.baseline_grid_import_kwh
        ),
        "baseline_surplus_kwh": _f(simulation.baseline_surplus_kwh),
        "grid_import_kwh": _f(simulation.grid_import_kwh),
        "remaining_surplus_kwh": _f(simulation.remaining_surplus_kwh),
        "baseline_solar_utilization_pct": _f(
            simulation.baseline_solar_utilization_pct
        ),
        "solar_utilization_pct": _f(simulation.solar_utilization_pct),
        "grid_reduction_kwh": _f(simulation.grid_reduction_kwh),
        "grid_reduction_pct": _f(simulation.grid_reduction_pct),
        "estimated_savings": _f(simulation.estimated_savings),
        "conservation_ok": simulation.conservation_ok,
        "max_conservation_error_kwh": _f(
            simulation.max_conservation_error_kwh
        ),
        "algorithm_version": simulation.algorithm_version,
        "input_hash": simulation.input_hash,
        "notes": simulation.notes,
        "created_by": _actor_payload(simulation.created_by),
        "published_by": _actor_payload(simulation.published_by),
        "published_at": simulation.published_at,
        "created_at": simulation.created_at,
    }


def simulation_payload(
    simulation: BatterySimulation,
    *,
    include_comparison: bool = True,
) -> dict[str, Any]:
    payload = simulation_summary_payload(simulation)
    payload.update(
        {
            "assumptions": simulation.assumptions or {},
            "warnings": simulation.warnings or [],
            "limitations": simulation.limitations or [],
            "configuration": (
                configuration_payload(simulation.configuration)
                if simulation.configuration is not None
                else None
            ),
            "comparison": (
                _comparison_from_simulation(simulation)
                if include_comparison
                else None
            ),
        }
    )
    return payload


def _visible_query(actor: User):
    statement = select(BatterySimulation).options(
        selectinload(BatterySimulation.configuration),
        selectinload(BatterySimulation.created_by),
        selectinload(BatterySimulation.published_by),
    )
    if actor.role != UserRole.ADMIN:
        statement = statement.where(
            BatterySimulation.status == SimulationState.PUBLISHED
        )
    return statement


def _latest_simulation(db: Session, actor: User) -> BatterySimulation:
    simulation = db.scalar(
        _visible_query(actor).order_by(
            BatterySimulation.created_at.desc(),
            BatterySimulation.id.desc(),
        )
    )
    if simulation is None:
        if actor.role == UserRole.ADMIN:
            raise NotFoundError(
                "No SolarVault simulation has been run yet. Run one from the "
                "configuration workspace."
            )
        raise NotFoundError(
            "No published SolarVault simulation is available yet."
        )
    return simulation


def get_simulation(
    db: Session, actor: User, simulation_id: int
) -> BatterySimulation:
    simulation = db.scalar(
        _visible_query(actor).where(BatterySimulation.id == simulation_id)
    )
    if simulation is None:
        raise NotFoundError(
            f"SolarVault simulation {simulation_id} was not found.",
            details={"simulation_id": simulation_id},
        )
    return simulation


def _overview(simulation: BatterySimulation) -> dict[str, Any]:
    return {
        "battery_status": _status_from_simulation(simulation),
        "current_soc_pct": _f(simulation.final_soc_pct),
        "stored_energy_kwh": _f(simulation.final_stored_kwh),
        "capacity_kwh": _f(simulation.capacity_kwh),
        "usable_capacity_kwh": round(
            _f(simulation.capacity_kwh)
            * (_f(simulation.max_soc_pct) - _f(simulation.min_soc_pct))
            / 100.0,
            4,
        ),
        "charged_kwh": _f(simulation.total_charged_kwh),
        "discharged_kwh": _f(simulation.total_discharged_kwh),
        "grid_reduction_kwh": _f(simulation.grid_reduction_kwh),
        "grid_reduction_pct": _f(simulation.grid_reduction_pct),
        "solar_utilization_pct": _f(simulation.solar_utilization_pct),
        "estimated_savings": _f(simulation.estimated_savings),
        "last_record_time": None,
    }


def _status_from_simulation(simulation: BatterySimulation) -> str:
    if _f(simulation.capacity_kwh) <= 0:
        return "DISABLED"
    if _f(simulation.total_discharged_kwh) > 0 and _f(
        simulation.final_soc_pct
    ) <= _f(simulation.min_soc_pct) + 1e-6:
        return "DEPLETED"
    if _f(simulation.final_soc_pct) >= _f(simulation.max_soc_pct) - 1e-6:
        return "FULL"
    if _f(simulation.total_charged_kwh) > 0:
        return "CHARGING_CAPABLE"
    return "IDLE"


def summary(db: Session, actor: User) -> dict[str, Any]:
    configuration = get_active_configuration(db)
    if configuration is None:
        seed_default_battery_configuration(db)
        configuration = get_active_configuration(db)
    if configuration is None:  # pragma: no cover - defensive
        raise NotFoundError("No SolarVault configuration exists.")
    simulation = _latest_simulation(db, actor)
    overview = _overview(simulation)
    if simulation.hourly_records:
        last = simulation.hourly_records[-1]
        overview["last_record_time"] = last.timestamp
        if _f(last.charge_energy_kwh) > 0:
            overview["battery_status"] = "CHARGING"
        elif _f(last.discharge_energy_kwh) > 0:
            overview["battery_status"] = "DISCHARGING"
    return {
        "simulation": simulation_payload(simulation),
        "configuration": configuration_payload(configuration),
        "comparison": _comparison_from_simulation(simulation),
        "overview": overview,
        "disclaimer": DISCLAIMER,
        "limitations": simulation.limitations or list(LIMITATIONS),
    }


def compare(
    db: Session, actor: User, *, simulation_id: int | None = None
) -> dict[str, Any]:
    simulation = (
        get_simulation(db, actor, simulation_id)
        if simulation_id is not None
        else _latest_simulation(db, actor)
    )
    return {
        "simulation": simulation_summary_payload(simulation),
        "comparison": _comparison_from_simulation(simulation),
        "disclaimer": DISCLAIMER,
        "limitations": simulation.limitations or list(LIMITATIONS),
    }


def history(
    db: Session,
    actor: User,
    *,
    limit: int = 50,
    offset: int = 0,
    simulation_run_id: int | None = None,
) -> dict[str, Any]:
    base = _visible_query(actor)
    if simulation_run_id is not None:
        base = base.where(
            BatterySimulation.simulation_run_id == simulation_run_id
        )
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    items = list(
        db.scalars(
            base.order_by(
                BatterySimulation.created_at.desc(),
                BatterySimulation.id.desc(),
            )
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return {
        "total": int(total),
        "limit": limit,
        "offset": offset,
        "items": [simulation_summary_payload(item) for item in items],
        "disclaimer": DISCLAIMER,
    }


def hourly(
    db: Session,
    actor: User,
    *,
    simulation_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 2000,
    offset: int = 0,
) -> dict[str, Any]:
    simulation = (
        get_simulation(db, actor, simulation_id)
        if simulation_id is not None
        else _latest_simulation(db, actor)
    )
    base = select(BatteryHourlyRecord).where(
        BatteryHourlyRecord.simulation_id == simulation.id
    )
    if date_from is not None:
        base = base.where(
            BatteryHourlyRecord.timestamp
            >= datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc)
        )
    if date_to is not None:
        base = base.where(
            BatteryHourlyRecord.timestamp
            <= datetime.combine(
                date_to, datetime.max.time(), tzinfo=timezone.utc
            )
        )
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    records = list(
        db.scalars(
            base.order_by(BatteryHourlyRecord.timestamp)
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return {
        "simulation_id": simulation.id,
        "simulation_code": simulation.simulation_code,
        "total": int(total),
        "limit": limit,
        "offset": offset,
        "items": [hourly_payload(record) for record in records],
        "disclaimer": DISCLAIMER,
    }


def detail(
    db: Session, actor: User, simulation_id: int
) -> dict[str, Any]:
    simulation = get_simulation(db, actor, simulation_id)
    configuration = simulation.configuration or _require_configuration(
        db, simulation.battery_configuration_id
    )
    records = list(
        db.scalars(
            select(BatteryHourlyRecord)
            .where(BatteryHourlyRecord.simulation_id == simulation.id)
            .order_by(BatteryHourlyRecord.timestamp)
        ).all()
    )
    return {
        "simulation": simulation_payload(simulation),
        "configuration": configuration_payload(configuration),
        "comparison": _comparison_from_simulation(simulation),
        "hourly": [hourly_payload(record) for record in records],
        "disclaimer": DISCLAIMER,
        "limitations": simulation.limitations or list(LIMITATIONS),
    }
