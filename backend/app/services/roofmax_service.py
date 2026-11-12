"""RoofMax orchestration: stored demand, planning assumptions and persistence.

The service layer is the only place that reads SolarTwin readings, resolves the
effective electricity tariff, turns an administrator's configuration into
:class:`PlanningAssumptions`, calls the pure optimisation engine and persists an
immutable analysis snapshot.

Permissions:
* ADMIN may update configuration, generate analyses and read drafts.
* RESIDENT may read only PUBLISHED analyses and recommendations.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.models.electricity_tariff import ElectricityTariff
from app.models.roofmax import (
    AnalysisStatus,
    CapacityScenario,
    RoofConfiguration,
    ScenarioType,
    SolarCapacityAnalysis,
)
from app.models.simulation_run import SimulationRun, SimulationStatus
from app.models.user import User, UserRole
from app.services import energy_balance, simulation_service, solar_optimization
from app.services.roofmax_setup_service import seed_default_roof_configuration

ALGORITHM_VERSION = "5.0.0"
SCENARIO_ORDER = (
    ScenarioType.CONSERVATIVE,
    ScenarioType.STANDARD,
    ScenarioType.OPTIMISTIC,
)

DISCLAIMER = (
    "RoofMax results are planning estimates produced from stored SolarTwin "
    "demand and the assumptions configured in PostgreSQL. They are not a "
    "guaranteed generation forecast, a binding quotation or a guarantee of "
    "financial savings. Verify panel specifications, irradiation, tariffs, "
    "subsidies and net-metering rules before investing."
)

LIMITATIONS: tuple[str, ...] = (
    "Demand is taken from the selected SolarTwin run; a short run is annualised "
    "to a 365-day estimate and may not represent seasonal variation.",
    "Generation uses one configured irradiation value and does not simulate "
    "hour-by-hour weather, cloud cover, temperature derating or panel soiling.",
    "Surplus energy is assumed to receive no export credit. A net-metering or "
    "power-purchase agreement could change the financial result.",
    "Panel degradation, inverter replacement, taxes, subsidies, financing and "
    "insurance are not modelled unless included in the configured costs.",
    "Roof area is treated as one contiguous usable rectangle; walkways, water "
    "tanks, shading, structural setbacks and fire access are not individually "
    "measured.",
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
    return Decimal(str(round(float(value), 3)))


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _actor_payload(user: User | None) -> dict[str, Any] | None:
    if user is None:
        return None
    return {"id": user.id, "name": user.name, "email": user.email}


def _require_admin(actor: User) -> None:
    if actor.role != UserRole.ADMIN:
        raise ForbiddenError("Only administrators can manage RoofMax analyses.")


def _configuration_from_payload(
    base: RoofConfiguration | None,
    payload: dict[str, Any],
    *,
    actor: User,
) -> RoofConfiguration:
    """Merge a partial update over the active configuration or defaults."""

    source: dict[str, Any]
    if base is None:
        from app.services import roofmax_setup_service as setup

        source = {
            "name": setup.DEFAULT_CONFIGURATION_NAME,
            "location": setup.DEFAULT_LOCATION,
            "usable_roof_area_m2": setup.DEFAULT_USABLE_ROOF_AREA_M2,
            "panel_length_m": setup.DEFAULT_PANEL_LENGTH_M,
            "panel_width_m": setup.DEFAULT_PANEL_WIDTH_M,
            "panel_capacity_wp": setup.DEFAULT_PANEL_CAPACITY_WP,
            "panel_efficiency_pct": setup.DEFAULT_PANEL_EFFICIENCY_PCT,
            "performance_ratio_pct": setup.DEFAULT_PERFORMANCE_RATIO_PCT,
            "system_loss_pct": setup.DEFAULT_SYSTEM_LOSS_PCT,
            "solar_irradiation_kwh_m2_day": (
                setup.DEFAULT_SOLAR_IRRADIATION_KWH_M2_DAY
            ),
            "installation_cost_per_kwp": setup.DEFAULT_INSTALLATION_COST_PER_KWP,
            "maintenance_cost_per_kwp_year": (
                setup.DEFAULT_MAINTENANCE_COST_PER_KWP_YEAR
            ),
            "tariff_override_per_kwh": None,
            "tariff_escalation_pct": setup.DEFAULT_TARIFF_ESCALATION_PCT,
            "maintenance_escalation_pct": (
                setup.DEFAULT_MAINTENANCE_ESCALATION_PCT
            ),
            "conservative_yield_variation_pct": (
                setup.DEFAULT_SCENARIO_YIELD_VARIATION_PCT
            ),
            "conservative_tariff_variation_pct": (
                setup.DEFAULT_SCENARIO_TARIFF_VARIATION_PCT
            ),
            "conservative_cost_variation_pct": (
                setup.DEFAULT_SCENARIO_COST_VARIATION_PCT
            ),
            "optimistic_yield_variation_pct": (
                setup.DEFAULT_SCENARIO_YIELD_VARIATION_PCT
            ),
            "optimistic_tariff_variation_pct": (
                setup.DEFAULT_SCENARIO_TARIFF_VARIATION_PCT
            ),
            "optimistic_cost_variation_pct": (
                setup.DEFAULT_SCENARIO_COST_VARIATION_PCT
            ),
            "short_horizon_years": setup.DEFAULT_SHORT_HORIZON_YEARS,
            "long_horizon_years": setup.DEFAULT_LONG_HORIZON_YEARS,
            "notes": setup.DEFAULT_NOTES,
        }
    else:
        source = {
            column.name: getattr(base, column.name)
            for column in RoofConfiguration.__table__.columns
            if column.name not in {"id", "is_active", "created_at", "created_by_id"}
        }

    merged = {**source, **payload}
    panel_area = float(merged["panel_length_m"]) * float(merged["panel_width_m"])
    if float(merged["usable_roof_area_m2"]) <= panel_area:
        raise BadRequestError(
            "Usable roof area must be larger than one panel.",
            details={
                "usable_roof_area_m2": float(merged["usable_roof_area_m2"]),
                "panel_area_m2": round(panel_area, 3),
            },
        )
    if int(merged["long_horizon_years"]) < int(merged["short_horizon_years"]):
        raise BadRequestError(
            "long_horizon_years must be greater than or equal to "
            "short_horizon_years."
        )

    return RoofConfiguration(
        name=str(merged["name"]),
        location=str(merged["location"]),
        usable_roof_area_m2=Decimal(str(merged["usable_roof_area_m2"])),
        panel_length_m=Decimal(str(merged["panel_length_m"])),
        panel_width_m=Decimal(str(merged["panel_width_m"])),
        panel_capacity_wp=Decimal(str(merged["panel_capacity_wp"])),
        panel_efficiency_pct=Decimal(str(merged["panel_efficiency_pct"])),
        performance_ratio_pct=Decimal(str(merged["performance_ratio_pct"])),
        system_loss_pct=Decimal(str(merged["system_loss_pct"])),
        solar_irradiation_kwh_m2_day=Decimal(
            str(merged["solar_irradiation_kwh_m2_day"])
        ),
        installation_cost_per_kwp=Decimal(
            str(merged["installation_cost_per_kwp"])
        ),
        maintenance_cost_per_kwp_year=Decimal(
            str(merged["maintenance_cost_per_kwp_year"])
        ),
        tariff_override_per_kwh=(
            None
            if merged.get("tariff_override_per_kwh") is None
            else Decimal(str(merged["tariff_override_per_kwh"]))
        ),
        tariff_escalation_pct=Decimal(str(merged["tariff_escalation_pct"])),
        maintenance_escalation_pct=Decimal(
            str(merged["maintenance_escalation_pct"])
        ),
        conservative_yield_variation_pct=Decimal(
            str(merged["conservative_yield_variation_pct"])
        ),
        conservative_tariff_variation_pct=Decimal(
            str(merged["conservative_tariff_variation_pct"])
        ),
        conservative_cost_variation_pct=Decimal(
            str(merged["conservative_cost_variation_pct"])
        ),
        optimistic_yield_variation_pct=Decimal(
            str(merged["optimistic_yield_variation_pct"])
        ),
        optimistic_tariff_variation_pct=Decimal(
            str(merged["optimistic_tariff_variation_pct"])
        ),
        optimistic_cost_variation_pct=Decimal(
            str(merged["optimistic_cost_variation_pct"])
        ),
        short_horizon_years=int(merged["short_horizon_years"]),
        long_horizon_years=int(merged["long_horizon_years"]),
        is_active=True,
        notes=merged.get("notes"),
        created_by_id=actor.id,
    )


def configuration_payload(configuration: RoofConfiguration) -> dict[str, Any]:
    assumptions = _planning_assumptions(configuration, tariff_price=None)
    return {
        "id": configuration.id,
        "name": configuration.name,
        "location": configuration.location,
        "usable_roof_area_m2": _f(configuration.usable_roof_area_m2),
        "panel_length_m": _f(configuration.panel_length_m),
        "panel_width_m": _f(configuration.panel_width_m),
        "panel_area_m2": round(
            _f(configuration.panel_length_m) * _f(configuration.panel_width_m),
            3,
        ),
        "panel_capacity_wp": _f(configuration.panel_capacity_wp),
        "panel_efficiency_pct": _f(configuration.panel_efficiency_pct),
        "performance_ratio_pct": _f(configuration.performance_ratio_pct),
        "system_loss_pct": _f(configuration.system_loss_pct),
        "solar_irradiation_kwh_m2_day": _f(
            configuration.solar_irradiation_kwh_m2_day
        ),
        "specific_daily_yield_kwh_per_kwp": round(
            assumptions.specific_daily_yield_kwh_per_kwp, 4
        ),
        "installation_cost_per_kwp": _f(
            configuration.installation_cost_per_kwp
        ),
        "maintenance_cost_per_kwp_year": _f(
            configuration.maintenance_cost_per_kwp_year
        ),
        "tariff_override_per_kwh": (
            None
            if configuration.tariff_override_per_kwh is None
            else _f(configuration.tariff_override_per_kwh)
        ),
        "tariff_escalation_pct": _f(configuration.tariff_escalation_pct),
        "maintenance_escalation_pct": _f(
            configuration.maintenance_escalation_pct
        ),
        "conservative_yield_variation_pct": _f(
            configuration.conservative_yield_variation_pct
        ),
        "conservative_tariff_variation_pct": _f(
            configuration.conservative_tariff_variation_pct
        ),
        "conservative_cost_variation_pct": _f(
            configuration.conservative_cost_variation_pct
        ),
        "optimistic_yield_variation_pct": _f(
            configuration.optimistic_yield_variation_pct
        ),
        "optimistic_tariff_variation_pct": _f(
            configuration.optimistic_tariff_variation_pct
        ),
        "optimistic_cost_variation_pct": _f(
            configuration.optimistic_cost_variation_pct
        ),
        "short_horizon_years": configuration.short_horizon_years,
        "long_horizon_years": configuration.long_horizon_years,
        "is_active": configuration.is_active,
        "notes": configuration.notes,
        "created_by": _actor_payload(configuration.created_by),
        "created_at": configuration.created_at,
    }


def _planning_assumptions(
    configuration: RoofConfiguration,
    *,
    tariff_price: float | Decimal | None,
) -> solar_optimization.PlanningAssumptions:
    override = configuration.tariff_override_per_kwh
    if override is not None:
        resolved_tariff = float(override)
    elif tariff_price is not None:
        resolved_tariff = float(tariff_price)
    else:
        resolved_tariff = 0.0
    return solar_optimization.PlanningAssumptions(
        usable_roof_area_m2=_f(configuration.usable_roof_area_m2),
        panel_length_m=_f(configuration.panel_length_m),
        panel_width_m=_f(configuration.panel_width_m),
        panel_capacity_wp=_f(configuration.panel_capacity_wp),
        panel_efficiency_pct=_f(configuration.panel_efficiency_pct),
        performance_ratio_pct=_f(configuration.performance_ratio_pct),
        system_loss_pct=_f(configuration.system_loss_pct),
        solar_irradiation_kwh_m2_day=_f(
            configuration.solar_irradiation_kwh_m2_day
        ),
        installation_cost_per_kwp=_f(configuration.installation_cost_per_kwp),
        maintenance_cost_per_kwp_year=_f(
            configuration.maintenance_cost_per_kwp_year
        ),
        tariff_price_per_kwh=resolved_tariff,
        tariff_escalation_pct=_f(configuration.tariff_escalation_pct),
        maintenance_escalation_pct=_f(
            configuration.maintenance_escalation_pct
        ),
        short_horizon_years=configuration.short_horizon_years,
        long_horizon_years=configuration.long_horizon_years,
        conservative_yield_variation_pct=_f(
            configuration.conservative_yield_variation_pct
        ),
        conservative_tariff_variation_pct=_f(
            configuration.conservative_tariff_variation_pct
        ),
        conservative_cost_variation_pct=_f(
            configuration.conservative_cost_variation_pct
        ),
        optimistic_yield_variation_pct=_f(
            configuration.optimistic_yield_variation_pct
        ),
        optimistic_tariff_variation_pct=_f(
            configuration.optimistic_tariff_variation_pct
        ),
        optimistic_cost_variation_pct=_f(
            configuration.optimistic_cost_variation_pct
        ),
    )


def _resolve_tariff(
    db: Session,
    *,
    configuration: RoofConfiguration,
    on_date: date,
) -> tuple[float, str, date | None, int | None]:
    if configuration.tariff_override_per_kwh is not None:
        return (
            float(configuration.tariff_override_per_kwh),
            "CONFIGURATION_OVERRIDE",
            None,
            None,
        )
    tariff = db.scalar(
        select(ElectricityTariff)
        .where(
            ElectricityTariff.effective_from <= on_date,
            (ElectricityTariff.effective_to.is_(None))
            | (ElectricityTariff.effective_to >= on_date),
        )
        .order_by(ElectricityTariff.effective_from.desc(), ElectricityTariff.id.desc())
    )
    if tariff is None:
        raise BadRequestError(
            "No electricity tariff covers the demand period and no tariff "
            "override is configured. Add a tariff or set "
            "tariff_override_per_kwh."
        )
    return (
        float(tariff.price_per_kwh),
        "STORED_TARIFF",
        tariff.effective_from,
        tariff.id,
    )


def load_demand_summary(db: Session, run: SimulationRun) -> dict[str, Any]:
    frame = energy_balance.load_balance_frame(db, run.id)
    if frame.empty:
        raise BadRequestError(
            f"Simulation run {run.id} has no stored readings to analyse.",
            details={"simulation_run_id": run.id},
        )
    summary = energy_balance.summarise_balance(frame)
    total_building = float(summary["total_building_demand_kwh"])
    if total_building <= 0:
        raise BadRequestError(
            f"Simulation run {run.id} has no building demand to analyse.",
            details={"simulation_run_id": run.id},
        )

    times = pd.to_datetime(frame["reading_time"], utc=True)
    demand_days = int(times.dt.date.nunique())
    if demand_days <= 0:
        raise BadRequestError("The selected run has no demand days.")
    average_daily = total_building / demand_days
    annual = average_daily * 365.0

    monthly = energy_balance.grouped_balance(frame, "monthly")
    daily = energy_balance.grouped_balance(frame, "daily")
    hourly = frame.copy()
    hourly["hour"] = pd.to_datetime(hourly["reading_time"], utc=True).dt.hour
    hourly_groups = hourly.groupby("hour", sort=True)
    hour_of_day = [
        {
            "hour": int(hour),
            "average_demand_kwh": round(
                float(group["apartment_kwh"].sum() + group["common_kwh"].sum())
                / max(1, group["reading_time"].dt.date.nunique()),
                4,
            ),
            "average_apartment_kwh": round(
                float(group["apartment_kwh"].sum())
                / max(1, group["reading_time"].dt.date.nunique()),
                4,
            ),
            "average_common_kwh": round(
                float(group["common_kwh"].sum())
                / max(1, group["reading_time"].dt.date.nunique()),
                4,
            ),
        }
        for hour, group in hourly_groups
    ]

    return {
        "summary": summary,
        "total_apartment_consumption_kwh": float(
            summary["total_apartment_consumption_kwh"]
        ),
        "total_common_consumption_kwh": float(
            summary["total_common_consumption_kwh"]
        ),
        "total_building_demand_kwh": total_building,
        "average_daily_demand_kwh": average_daily,
        "average_monthly_demand_kwh": annual / 12.0,
        "annual_demand_kwh": annual,
        "demand_days": demand_days,
        "demand_hour_count": int(summary["hour_count"]),
        "demand_start_date": times.min().date(),
        "demand_end_date": times.max().date(),
        "existing_solar_generation_kwh": float(
            summary["total_solar_generation_kwh"]
        ),
        "existing_solar_utilized_kwh": float(
            summary["total_solar_utilized_kwh"]
        ),
        "existing_solar_utilization_percentage": float(
            summary["solar_utilization_percentage"]
        ),
        "existing_solar_coverage_percentage": float(
            summary["apartment_solar_coverage_percentage"]
        ),
        "demand_profile": {
            "monthly": monthly,
            "daily": daily,
            "hour_of_day": hour_of_day,
        },
    }


def get_active_configuration(db: Session) -> RoofConfiguration | None:
    return db.scalar(
        select(RoofConfiguration)
        .options(selectinload(RoofConfiguration.created_by))
        .where(RoofConfiguration.is_active.is_(True))
        .order_by(RoofConfiguration.id.desc())
    )


def _require_configuration(
    db: Session, configuration_id: int | None
) -> RoofConfiguration:
    if configuration_id is not None:
        configuration = db.scalar(
            select(RoofConfiguration)
            .options(selectinload(RoofConfiguration.created_by))
            .where(RoofConfiguration.id == configuration_id)
        )
    else:
        configuration = get_active_configuration(db)
    if configuration is None:
        raise BadRequestError(
            "No RoofMax configuration exists. Create one with "
            "PUT /api/roofmax/configuration."
        )
    return configuration


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


def configuration_response(db: Session, actor: User) -> dict[str, Any]:
    configuration = get_active_configuration(db)
    if configuration is None:
        seed_default_roof_configuration(db)
        configuration = get_active_configuration(db)
    if configuration is None:  # pragma: no cover - defensive
        raise NotFoundError("No RoofMax configuration exists.")
    return {
        "configuration": configuration_payload(configuration),
        "previous_configuration_id": None,
        "created": False,
        "disclaimer": DISCLAIMER,
    }


def _analysis_code(input_hash: str, created_at: datetime) -> str:
    return f"RM-{created_at.strftime('%Y%m%d%H%M%S')}-{input_hash[:6].upper()}"


def _input_hash(payload: dict[str, Any]) -> str:
    serialised = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(serialised.encode("utf-8")).hexdigest()


def _scenario_assumptions(
    scenario_type: str,
    assumption_payload: dict[str, Any],
    project: solar_optimization.ProjectEvaluation,
) -> dict[str, Any]:
    factors = project.scenario_factors.get(scenario_type, {})
    return {
        "scenario_type": scenario_type,
        "factors": factors,
        "tariff_price_per_kwh": round(
            assumption_payload["tariff_price_per_kwh"]
            * float(factors.get("tariff_factor", 1.0)),
            4,
        ),
        "yield_factor": factors.get("yield_factor", 1.0),
        "cost_factor": factors.get("cost_factor", 1.0),
        "standard_assumptions": assumption_payload,
    }


def analyze(
    db: Session,
    actor: User,
    *,
    simulation_run_id: int | None = None,
    configuration_id: int | None = None,
    publish: bool = True,
    notes: str | None = None,
) -> dict[str, Any]:
    _require_admin(actor)

    run = simulation_service.resolve_run(db, simulation_run_id)
    if run.status != SimulationStatus.COMPLETED:
        raise BadRequestError(
            "RoofMax needs a completed SolarTwin run with stored readings.",
            details={"simulation_run_id": run.id, "status": run.status},
        )

    configuration = _require_configuration(db, configuration_id)
    tax_price, tariff_source, tariff_from, tariff_id = _resolve_tariff(
        db, configuration=configuration, on_date=run.end_date
    )
    assumptions = _planning_assumptions(configuration, tariff_price=tax_price)
    max_panels = assumptions.max_panels()
    if max_panels <= 0:
        raise BadRequestError(
            "The configured usable roof area cannot fit a single panel.",
            details={
                "usable_roof_area_m2": assumptions.usable_roof_area_m2,
                "panel_area_m2": round(assumptions.panel_area_m2, 3),
            },
        )
    if assumptions.specific_daily_yield_kwh_per_kwp <= 0:
        raise BadRequestError(
            "Performance ratio and system losses leave no usable solar yield."
        )

    demand = load_demand_summary(db, run)
    project = solar_optimization.optimize_project(
        assumptions, demand["annual_demand_kwh"]
    )

    assumption_payload = {
        **assumptions.as_dict(),
        "tariff_source": tariff_source,
        "tariff_id": tariff_id,
        "tariff_effective_from": (
            tariff_from.isoformat() if tariff_from is not None else None
        ),
        "scenario_factors": project.scenario_factors,
    }
    input_hash = _input_hash(
        {
            "algorithm_version": ALGORITHM_VERSION,
            "simulation_run_id": run.id,
            "roof_configuration_id": configuration.id,
            "assumptions": assumption_payload,
            "demand": {
                "total_building_demand_kwh": round(
                    demand["total_building_demand_kwh"], 4
                ),
                "average_daily_demand_kwh": round(
                    demand["average_daily_demand_kwh"], 4
                ),
                "annual_demand_kwh": round(demand["annual_demand_kwh"], 4),
                "demand_hour_count": demand["demand_hour_count"],
            },
            "standard_options_kwp": list(
                solar_optimization.STANDARD_CAPACITY_OPTIONS_KWP
            ),
        }
    )

    existing = db.scalar(
        select(SolarCapacityAnalysis)
        .options(
            selectinload(SolarCapacityAnalysis.scenarios),
            selectinload(SolarCapacityAnalysis.configuration),
            selectinload(SolarCapacityAnalysis.created_by),
            selectinload(SolarCapacityAnalysis.published_by),
        )
        .where(
            SolarCapacityAnalysis.simulation_run_id == run.id,
            SolarCapacityAnalysis.roof_configuration_id == configuration.id,
            SolarCapacityAnalysis.input_hash == input_hash,
        )
        .order_by(SolarCapacityAnalysis.id.desc())
    )
    if existing is not None:
        if publish and existing.status != AnalysisStatus.PUBLISHED:
            existing.status = AnalysisStatus.PUBLISHED
            existing.published_at = _utc_now()
            existing.published_by_id = actor.id
            db.commit()
            db.refresh(existing)
        return {
            "saved": True,
            "published": existing.status == AnalysisStatus.PUBLISHED,
            "duplicate": True,
            "analysis": analysis_payload(existing),
            "disclaimer": DISCLAIMER,
        }

    created_at = _utc_now()
    recommended = project.recommended
    status = AnalysisStatus.PUBLISHED if publish else AnalysisStatus.DRAFT
    analysis = SolarCapacityAnalysis(
        analysis_code=_analysis_code(input_hash, created_at),
        simulation_run_id=run.id,
        roof_configuration_id=configuration.id,
        status=status,
        demand_start_date=demand["demand_start_date"],
        demand_end_date=demand["demand_end_date"],
        demand_days=demand["demand_days"],
        demand_hour_count=demand["demand_hour_count"],
        total_apartment_consumption_kwh=_energy(
            demand["total_apartment_consumption_kwh"]
        ),
        total_common_consumption_kwh=_energy(
            demand["total_common_consumption_kwh"]
        ),
        total_building_demand_kwh=_energy(demand["total_building_demand_kwh"]),
        average_daily_demand_kwh=_energy(demand["average_daily_demand_kwh"]),
        average_monthly_demand_kwh=_energy(
            demand["average_monthly_demand_kwh"]
        ),
        annual_demand_kwh=_energy(demand["annual_demand_kwh"]),
        current_solar_capacity_kwp=Decimal(str(run.solar_capacity_kwp)),
        existing_solar_generation_kwh=_energy(
            demand["existing_solar_generation_kwh"]
        ),
        existing_solar_utilized_kwh=_energy(
            demand["existing_solar_utilized_kwh"]
        ),
        existing_solar_utilization_percentage=_percentage(
            demand["existing_solar_utilization_percentage"]
        ),
        existing_solar_coverage_percentage=_percentage(
            demand["existing_solar_coverage_percentage"]
        ),
        required_capacity_kwp=_percentage(project.required_capacity_kwp),
        max_installable_capacity_kwp=_percentage(
            project.max_installable_capacity_kwp
        ),
        max_panel_count=project.max_panel_count,
        recommended_capacity_kwp=_percentage(recommended.capacity_kwp),
        recommended_panel_count=recommended.panel_count,
        recommended_daily_generation_kwh=_energy(
            recommended.daily_generation_kwh
        ),
        recommended_monthly_generation_kwh=_energy(
            recommended.monthly_generation_kwh
        ),
        recommended_annual_generation_kwh=_energy(
            recommended.annual_generation_kwh
        ),
        recommended_demand_coverage_percentage=_percentage(
            recommended.demand_coverage_percentage
        ),
        recommended_surplus_kwh=_energy(recommended.surplus_kwh),
        recommended_grid_dependency_kwh=_energy(
            recommended.grid_dependency_kwh
        ),
        recommended_grid_dependency_percentage=_percentage(
            recommended.grid_dependency_percentage
        ),
        installation_cost=_money(recommended.installation_cost),
        annual_savings=_money(recommended.annual_savings),
        annual_maintenance_cost=_money(
            recommended.annual_maintenance_cost
        ),
        net_annual_savings=_money(recommended.net_annual_savings),
        payback_period_years=(
            Decimal(str(round(recommended.payback_period_years, 3)))
            if recommended.payback_period_years is not None
            else None
        ),
        ten_year_benefit=_money(recommended.ten_year_benefit),
        twenty_year_benefit=_money(recommended.twenty_year_benefit),
        roi_percentage=_percentage(recommended.roi_percentage),
        cost_per_kwp=_money(recommended.cost_per_kwp),
        tariff_price_per_kwh=Decimal(str(round(tax_price, 4))),
        assumptions=assumption_payload,
        demand_profile=demand["demand_profile"],
        recommendation_reason=project.recommendation_reason,
        limitations=list(LIMITATIONS),
        algorithm_version=ALGORITHM_VERSION,
        input_hash=input_hash,
        notes=notes,
        created_by_id=actor.id,
        published_by_id=actor.id if publish else None,
        published_at=created_at if publish else None,
        created_at=created_at,
    )
    db.add(analysis)
    db.flush()

    sort_order = 0
    for scenario_type in SCENARIO_ORDER:
        rows = project.scenarios.get(scenario_type, [])
        is_standard = scenario_type == ScenarioType.STANDARD
        for row in rows:
            scenario = CapacityScenario(
                analysis_id=analysis.id,
                scenario_type=scenario_type,
                option_label=row.option_label,
                capacity_kwp=_percentage(row.capacity_kwp),
                panel_count=row.panel_count,
                is_feasible=row.is_feasible,
                is_recommended=is_standard
                and abs(row.capacity_kwp - recommended.capacity_kwp) < 0.001,
                constraint_note=row.constraint_note,
                daily_generation_kwh=_energy(row.daily_generation_kwh),
                monthly_generation_kwh=_energy(row.monthly_generation_kwh),
                annual_generation_kwh=_energy(row.annual_generation_kwh),
                self_consumed_kwh=_energy(row.self_consumed_kwh),
                demand_coverage_percentage=_percentage(
                    row.demand_coverage_percentage
                ),
                surplus_kwh=_energy(row.surplus_kwh),
                grid_dependency_kwh=_energy(row.grid_dependency_kwh),
                grid_dependency_percentage=_percentage(
                    row.grid_dependency_percentage
                ),
                installation_cost=_money(row.installation_cost),
                annual_savings=_money(row.annual_savings),
                annual_maintenance_cost=_money(
                    row.annual_maintenance_cost
                ),
                net_annual_savings=_money(row.net_annual_savings),
                payback_period_years=(
                    Decimal(str(round(row.payback_period_years, 3)))
                    if row.payback_period_years is not None
                    else None
                ),
                ten_year_benefit=_money(row.ten_year_benefit),
                twenty_year_benefit=_money(row.twenty_year_benefit),
                roi_percentage=_percentage(row.roi_percentage),
                cost_per_kwp=_money(row.cost_per_kwp),
                assumptions=_scenario_assumptions(
                    scenario_type, assumption_payload, project
                ),
                sort_order=sort_order,
            )
            db.add(scenario)
            sort_order += 1

    db.commit()
    db.refresh(analysis)
    return {
        "saved": True,
        "published": publish,
        "duplicate": False,
        "analysis": analysis_payload(analysis),
        "disclaimer": DISCLAIMER,
    }


def scenario_payload(scenario: CapacityScenario) -> dict[str, Any]:
    return {
        "id": scenario.id,
        "analysis_id": scenario.analysis_id,
        "scenario_type": scenario.scenario_type,
        "option_label": scenario.option_label,
        "capacity_kwp": _f(scenario.capacity_kwp),
        "panel_count": scenario.panel_count,
        "is_feasible": scenario.is_feasible,
        "is_recommended": scenario.is_recommended,
        "constraint_note": scenario.constraint_note,
        "daily_generation_kwh": _f(scenario.daily_generation_kwh),
        "monthly_generation_kwh": _f(scenario.monthly_generation_kwh),
        "annual_generation_kwh": _f(scenario.annual_generation_kwh),
        "self_consumed_kwh": _f(scenario.self_consumed_kwh),
        "demand_coverage_percentage": _f(
            scenario.demand_coverage_percentage
        ),
        "surplus_kwh": _f(scenario.surplus_kwh),
        "grid_dependency_kwh": _f(scenario.grid_dependency_kwh),
        "grid_dependency_percentage": _f(
            scenario.grid_dependency_percentage
        ),
        "installation_cost": _f(scenario.installation_cost),
        "annual_savings": _f(scenario.annual_savings),
        "annual_maintenance_cost": _f(scenario.annual_maintenance_cost),
        "net_annual_savings": _f(scenario.net_annual_savings),
        "payback_period_years": (
            _f(scenario.payback_period_years)
            if scenario.payback_period_years is not None
            else None
        ),
        "ten_year_benefit": _f(scenario.ten_year_benefit),
        "twenty_year_benefit": _f(scenario.twenty_year_benefit),
        "roi_percentage": _f(scenario.roi_percentage),
        "cost_per_kwp": _f(scenario.cost_per_kwp),
        "assumptions": scenario.assumptions or {},
        "sort_order": scenario.sort_order,
    }


def analysis_summary_payload(analysis: SolarCapacityAnalysis) -> dict[str, Any]:
    return {
        "id": analysis.id,
        "analysis_code": analysis.analysis_code,
        "status": analysis.status,
        "simulation_run_id": analysis.simulation_run_id,
        "roof_configuration_id": analysis.roof_configuration_id,
        "demand_start_date": analysis.demand_start_date,
        "demand_end_date": analysis.demand_end_date,
        "demand_days": analysis.demand_days,
        "demand_hour_count": analysis.demand_hour_count,
        "total_apartment_consumption_kwh": _f(
            analysis.total_apartment_consumption_kwh
        ),
        "total_common_consumption_kwh": _f(
            analysis.total_common_consumption_kwh
        ),
        "total_building_demand_kwh": _f(
            analysis.total_building_demand_kwh
        ),
        "average_daily_demand_kwh": _f(analysis.average_daily_demand_kwh),
        "average_monthly_demand_kwh": _f(
            analysis.average_monthly_demand_kwh
        ),
        "annual_demand_kwh": _f(analysis.annual_demand_kwh),
        "current_solar_capacity_kwp": _f(
            analysis.current_solar_capacity_kwp
        ),
        "existing_solar_generation_kwh": _f(
            analysis.existing_solar_generation_kwh
        ),
        "existing_solar_utilized_kwh": _f(
            analysis.existing_solar_utilized_kwh
        ),
        "existing_solar_utilization_percentage": _f(
            analysis.existing_solar_utilization_percentage
        ),
        "existing_solar_coverage_percentage": _f(
            analysis.existing_solar_coverage_percentage
        ),
        "required_capacity_kwp": _f(analysis.required_capacity_kwp),
        "max_installable_capacity_kwp": _f(
            analysis.max_installable_capacity_kwp
        ),
        "max_panel_count": analysis.max_panel_count,
        "recommended_capacity_kwp": _f(
            analysis.recommended_capacity_kwp
        ),
        "recommended_panel_count": analysis.recommended_panel_count,
        "recommended_daily_generation_kwh": _f(
            analysis.recommended_daily_generation_kwh
        ),
        "recommended_monthly_generation_kwh": _f(
            analysis.recommended_monthly_generation_kwh
        ),
        "recommended_annual_generation_kwh": _f(
            analysis.recommended_annual_generation_kwh
        ),
        "recommended_demand_coverage_percentage": _f(
            analysis.recommended_demand_coverage_percentage
        ),
        "recommended_surplus_kwh": _f(analysis.recommended_surplus_kwh),
        "recommended_grid_dependency_kwh": _f(
            analysis.recommended_grid_dependency_kwh
        ),
        "recommended_grid_dependency_percentage": _f(
            analysis.recommended_grid_dependency_percentage
        ),
        "installation_cost": _f(analysis.installation_cost),
        "annual_savings": _f(analysis.annual_savings),
        "annual_maintenance_cost": _f(
            analysis.annual_maintenance_cost
        ),
        "net_annual_savings": _f(analysis.net_annual_savings),
        "payback_period_years": (
            _f(analysis.payback_period_years)
            if analysis.payback_period_years is not None
            else None
        ),
        "ten_year_benefit": _f(analysis.ten_year_benefit),
        "twenty_year_benefit": _f(analysis.twenty_year_benefit),
        "roi_percentage": _f(analysis.roi_percentage),
        "cost_per_kwp": _f(analysis.cost_per_kwp),
        "tariff_price_per_kwh": _f(analysis.tariff_price_per_kwh),
        "algorithm_version": analysis.algorithm_version,
        "input_hash": analysis.input_hash,
        "notes": analysis.notes,
        "created_by": _actor_payload(analysis.created_by),
        "published_by": _actor_payload(analysis.published_by),
        "published_at": analysis.published_at,
        "created_at": analysis.created_at,
        "recommendation_reason": analysis.recommendation_reason,
    }


def analysis_payload(
    analysis: SolarCapacityAnalysis,
    *,
    include_scenarios: bool = True,
) -> dict[str, Any]:
    payload = analysis_summary_payload(analysis)
    payload.update(
        {
            "assumptions": analysis.assumptions or {},
            "demand_profile": analysis.demand_profile or {},
            "limitations": analysis.limitations or [],
            "scenarios": (
                [scenario_payload(item) for item in analysis.scenarios]
                if include_scenarios
                else []
            ),
            "configuration": (
                configuration_payload(analysis.configuration)
                if analysis.configuration is not None
                else None
            ),
        }
    )
    return payload


def _visible_query(actor: User):
    statement = select(SolarCapacityAnalysis).options(
        selectinload(SolarCapacityAnalysis.scenarios),
        selectinload(SolarCapacityAnalysis.configuration),
        selectinload(SolarCapacityAnalysis.created_by),
        selectinload(SolarCapacityAnalysis.published_by),
    )
    if actor.role != UserRole.ADMIN:
        statement = statement.where(
            SolarCapacityAnalysis.status == AnalysisStatus.PUBLISHED
        )
    return statement


def _latest_analysis(db: Session, actor: User) -> SolarCapacityAnalysis:
    analysis = db.scalar(
        _visible_query(actor).order_by(
            SolarCapacityAnalysis.created_at.desc(),
            SolarCapacityAnalysis.id.desc(),
        )
    )
    if analysis is None:
        if actor.role == UserRole.ADMIN:
            raise NotFoundError(
                "No RoofMax analysis has been generated yet. Generate one "
                "from the analysis workspace."
            )
        raise NotFoundError(
            "No published RoofMax recommendation is available yet."
        )
    return analysis


def recommendation(db: Session, actor: User) -> dict[str, Any]:
    analysis = _latest_analysis(db, actor)
    if analysis.configuration is None:  # pragma: no cover - defensive
        configuration = _require_configuration(
            db, analysis.roof_configuration_id
        )
    else:
        configuration = analysis.configuration
    return {
        "analysis": analysis_payload(analysis),
        "configuration": configuration_payload(configuration),
        "disclaimer": DISCLAIMER,
        "limitations": analysis.limitations or list(LIMITATIONS),
    }


def scenarios(
    db: Session, actor: User, *, analysis_id: int | None = None
) -> dict[str, Any]:
    if analysis_id is not None:
        analysis = get_analysis(db, actor, analysis_id)
    else:
        analysis = _latest_analysis(db, actor)
    grouped: dict[str, list[dict[str, Any]]] = {
        scenario_type: [] for scenario_type in SCENARIO_ORDER
    }
    for item in analysis.scenarios:
        grouped.setdefault(item.scenario_type, []).append(
            scenario_payload(item)
        )
    assumptions = analysis.assumptions or {}
    return {
        "analysis_id": analysis.id,
        "analysis_code": analysis.analysis_code,
        "recommended_capacity_kwp": _f(analysis.recommended_capacity_kwp),
        "recommended_panel_count": analysis.recommended_panel_count,
        "max_installable_capacity_kwp": _f(
            analysis.max_installable_capacity_kwp
        ),
        "required_capacity_kwp": _f(analysis.required_capacity_kwp),
        "scenario_factors": assumptions.get("scenario_factors", {}),
        "standard_scenario": grouped.get(ScenarioType.STANDARD, []),
        "conservative_scenario": grouped.get(
            ScenarioType.CONSERVATIVE, []
        ),
        "optimistic_scenario": grouped.get(ScenarioType.OPTIMISTIC, []),
        "disclaimer": DISCLAIMER,
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
            SolarCapacityAnalysis.simulation_run_id == simulation_run_id
        )
    total = db.scalar(
        select(func.count()).select_from(base.subquery())
    ) or 0
    items = list(
        db.scalars(
            base.order_by(
                SolarCapacityAnalysis.created_at.desc(),
                SolarCapacityAnalysis.id.desc(),
            )
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return {
        "total": int(total),
        "limit": limit,
        "offset": offset,
        "items": [analysis_summary_payload(item) for item in items],
    }


def get_analysis(
    db: Session, actor: User, analysis_id: int
) -> SolarCapacityAnalysis:
    analysis = db.scalar(
        _visible_query(actor).where(SolarCapacityAnalysis.id == analysis_id)
    )
    if analysis is None:
        raise NotFoundError(
            f"RoofMax analysis {analysis_id} was not found.",
            details={"analysis_id": analysis_id},
        )
    return analysis


def analysis_detail(
    db: Session, actor: User, analysis_id: int
) -> dict[str, Any]:
    analysis = get_analysis(db, actor, analysis_id)
    configuration = analysis.configuration or _require_configuration(
        db, analysis.roof_configuration_id
    )
    return {
        "analysis": analysis_payload(analysis),
        "configuration": configuration_payload(configuration),
        "disclaimer": DISCLAIMER,
        "limitations": analysis.limitations or list(LIMITATIONS),
    }
