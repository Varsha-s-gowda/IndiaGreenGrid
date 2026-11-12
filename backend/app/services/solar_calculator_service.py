"""Rooftop solar ROI and subsidy calculator (D3).

Every financial and physical figure is produced here in Python.  Assumptions
are explicit, returned to the client and persisted with each calculation.
Values are estimates, not quotations.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError
from app.models.green_grid import SolarCalculation
from app.models.user import User, UserRole
from app.services.audit_service import record_audit

STATE_ASSUMPTIONS: dict[str, dict[str, float | bool]] = {
    "Delhi": {"peak_sun_hours": 4.8, "tariff": 8.0, "residential_subsidy": True},
    "Rajasthan": {"peak_sun_hours": 5.7, "tariff": 7.2, "residential_subsidy": True},
    "Gujarat": {"peak_sun_hours": 5.5, "tariff": 6.8, "residential_subsidy": True},
    "Maharashtra": {"peak_sun_hours": 5.2, "tariff": 8.6, "residential_subsidy": True},
    "Karnataka": {"peak_sun_hours": 5.1, "tariff": 8.2, "residential_subsidy": True},
    "Tamil Nadu": {"peak_sun_hours": 5.2, "tariff": 7.8, "residential_subsidy": True},
    "Telangana": {"peak_sun_hours": 5.3, "tariff": 7.6, "residential_subsidy": True},
    "Andhra Pradesh": {"peak_sun_hours": 5.3, "tariff": 7.4, "residential_subsidy": True},
    "Madhya Pradesh": {"peak_sun_hours": 5.4, "tariff": 7.5, "residential_subsidy": True},
    "Uttar Pradesh": {"peak_sun_hours": 5.0, "tariff": 6.9, "residential_subsidy": True},
    "Punjab": {"peak_sun_hours": 5.0, "tariff": 7.1, "residential_subsidy": True},
    "Haryana": {"peak_sun_hours": 5.0, "tariff": 7.5, "residential_subsidy": True},
    "Kerala": {"peak_sun_hours": 4.6, "tariff": 8.4, "residential_subsidy": True},
    "West Bengal": {"peak_sun_hours": 4.5, "tariff": 8.0, "residential_subsidy": True},
    "Odisha": {"peak_sun_hours": 4.8, "tariff": 6.5, "residential_subsidy": True},
    "Bihar": {"peak_sun_hours": 4.9, "tariff": 7.0, "residential_subsidy": True},
    "Assam": {"peak_sun_hours": 4.4, "tariff": 7.4, "residential_subsidy": True},
    "Uttarakhand": {"peak_sun_hours": 4.9, "tariff": 7.2, "residential_subsidy": True},
    "Himachal Pradesh": {"peak_sun_hours": 4.7, "tariff": 6.8, "residential_subsidy": True},
    "Goa": {"peak_sun_hours": 5.1, "tariff": 7.6, "residential_subsidy": True},
}

DEFAULT_ASSUMPTIONS = {"peak_sun_hours": 5.0, "tariff": 7.5, "residential_subsidy": True}

CUSTOMER_TYPES = {
    "RESIDENTIAL": {"label": "Residential", "cost_per_kwp": 55000, "subsidy": True},
    "COMMERCIAL": {"label": "Commercial", "cost_per_kwp": 50000, "subsidy": False},
    "INDUSTRIAL": {"label": "Industrial", "cost_per_kwp": 46000, "subsidy": False},
    "INSTITUTIONAL": {"label": "Institutional", "cost_per_kwp": 52000, "subsidy": False},
    "AGRICULTURAL": {"label": "Agricultural", "cost_per_kwp": 45000, "subsidy": False},
}

AREA_PER_KWP_SQM = 9.5
PERFORMANCE_RATIO = 0.75
CO2_FACTOR_KG_PER_KWH = 0.71
SYSTEM_LIFETIME_YEARS = 25
ANNUAL_MAINTENANCE_PCT = 0.01
EXPORT_COMPENSATION_RATIO = 0.5
MAX_RECOMMENDED_KWP = 1000.0

PM_SURYA_GHAR_REFERENCE = {
    "scheme_name": "PM Surya Ghar: Muft Bijli Yojana (residential rooftop CFA)",
    "authority": "Ministry of New and Renewable Energy (MNRE)",
    "source_url": "https://pmsuryaghar.gov.in",
    "verification_status": "REFERENCE_ONLY",
    "subsidy_bands": [
        "Rs 30,000/kW for the first 2 kW",
        "Rs 18,000/kW for the third kW",
        "Capped at Rs 78,000 for residential systems above 3 kW",
    ],
    "eligibility_conditions": [
        "Residential consumer category with an active electricity connection",
        "Rooftop owned or legally usable by the applicant",
        "Installation through an empanelled vendor and DISCOM approval",
        "State top-ups, if any, follow the state's own rules",
    ],
    "note": (
        "Central financial assistance is indicative and subject to current MNRE "
        "guidelines, vendor empanelment and DISCOM verification. The platform "
        "does not approve or guarantee any subsidy."
    ),
}


def state_options() -> list[dict[str, Any]]:
    return [
        {
            "state": state,
            "peak_sun_hours": values["peak_sun_hours"],
            "default_tariff_per_kwh": values["tariff"],
            "residential_subsidy_available": bool(values["residential_subsidy"]),
        }
        for state, values in sorted(STATE_ASSUMPTIONS.items())
    ]


def _rooftop_subsidy(
    capacity_kw: float, customer_type: str, state: str
) -> tuple[float, list[str], str]:
    notes: list[str] = []
    if customer_type != "RESIDENTIAL":
        notes.append(
            "PM Surya Ghar residential CFA does not apply to this customer category."
        )
        return 0.0, notes, "NOT_ELIGIBLE"

    state_values = STATE_ASSUMPTIONS.get(state, DEFAULT_ASSUMPTIONS)
    if not bool(state_values.get("residential_subsidy", True)):
        notes.append("No residential rooftop subsidy is assumed for this state.")
        return 0.0, notes, "STATE_NOT_AVAILABLE"

    if capacity_kw <= 2:
        subsidy = capacity_kw * 30000
        notes.append("Rs 30,000 per kW applied for the first 2 kW.")
    elif capacity_kw <= 3:
        subsidy = 2 * 30000 + (capacity_kw - 2) * 18000
        notes.append(
            "Rs 30,000/kW for the first 2 kW plus Rs 18,000/kW for the third kW."
        )
    else:
        subsidy = 78000
        notes.append(
            "Subsidy capped at Rs 78,000 for residential systems above 3 kW."
        )
    notes.append(
        "Indicative PM Surya Ghar central financial assistance. State top-ups, "
        "vendor eligibility and DISCOM approval must be verified."
    )
    status = "CAPPED_AT_3KW" if capacity_kw > 3 else "APPLIED"
    return round(subsidy, 2), notes, status


def calculate(db: Session, user: User, payload: dict[str, Any]) -> dict[str, Any]:
    state = str(payload.get("state", "")).strip()
    location = str(payload.get("location", state)).strip() or state
    customer_type = str(payload.get("customer_type", "RESIDENTIAL")).upper()
    monthly_consumption = float(payload["monthly_consumption_kwh"])
    rooftop_area = float(payload["rooftop_area_sqm"])
    state_values = STATE_ASSUMPTIONS.get(state, DEFAULT_ASSUMPTIONS)
    tariff = float(payload.get("tariff_per_kwh") or state_values["tariff"])

    if customer_type not in CUSTOMER_TYPES:
        raise BadRequestError(
            "Unsupported customer type.",
            details={"supported": sorted(CUSTOMER_TYPES)},
        )
    if monthly_consumption <= 0:
        raise BadRequestError("Monthly consumption must be greater than zero.")
    if rooftop_area <= 0:
        raise BadRequestError("Rooftop area must be greater than zero.")
    if tariff <= 0:
        raise BadRequestError("Electricity tariff must be greater than zero.")

    peak_sun_hours = float(state_values["peak_sun_hours"])
    annual_consumption = monthly_consumption * 12

    preference = str(payload.get("system_preference", "AUTO")).upper()
    preferred_kwp = payload.get("preferred_kwp")
    if preference not in {"AUTO", "MAX_ROOF", "MATCH_CONSUMPTION", "CUSTOM"}:
        raise BadRequestError(
            "Unsupported system preference.",
            details={
                "supported": ["AUTO", "MAX_ROOF", "MATCH_CONSUMPTION", "CUSTOM"]
            },
        )

    area_capacity = rooftop_area / AREA_PER_KWP_SQM
    consumption_capacity = annual_consumption / (
        peak_sun_hours * 365 * PERFORMANCE_RATIO
    )

    if preference == "MAX_ROOF":
        raw_capacity = area_capacity
        limiting_factor = "rooftop_area"
    elif preference == "MATCH_CONSUMPTION":
        raw_capacity = consumption_capacity
        limiting_factor = "electricity_consumption"
    elif preference == "CUSTOM":
        if preferred_kwp is None:
            raise BadRequestError(
                "Enter a preferred system size for a custom preference."
            )
        raw_capacity = float(preferred_kwp)
        limiting_factor = "manual_preference"
    else:
        raw_capacity = min(area_capacity, consumption_capacity)
        limiting_factor = (
            "rooftop_area"
            if area_capacity <= consumption_capacity
            else "electricity_consumption"
        )

    area_capped = False
    if raw_capacity > area_capacity:
        raw_capacity = area_capacity
        area_capped = True
    if raw_capacity > MAX_RECOMMENDED_KWP:
        raw_capacity = MAX_RECOMMENDED_KWP
    recommended_kwp = max(0.5, math.floor(raw_capacity * 2) / 2)

    annual_generation = (
        recommended_kwp * peak_sun_hours * 365 * PERFORMANCE_RATIO
    )
    self_consumed = min(annual_generation, annual_consumption)
    exported = max(0.0, annual_generation - annual_consumption)
    annual_savings = (
        self_consumed * tariff + exported * tariff * EXPORT_COMPENSATION_RATIO
    )

    customer = CUSTOMER_TYPES[customer_type]
    installation_cost = recommended_kwp * float(customer["cost_per_kwp"])
    subsidy, subsidy_notes, subsidy_status = _rooftop_subsidy(
        recommended_kwp, customer_type, state
    )
    net_cost = max(0.0, installation_cost - subsidy)
    payback_years = round(net_cost / annual_savings, 2) if annual_savings > 0 else None
    annual_maintenance = installation_cost * ANNUAL_MAINTENANCE_PCT
    net_annual_benefit = max(0.0, annual_savings - annual_maintenance)
    lifetime_savings = round(
        net_annual_benefit * SYSTEM_LIFETIME_YEARS - installation_cost, 2
    )
    co2_reduction = annual_generation * CO2_FACTOR_KG_PER_KWH

    assumptions = {
        "peak_sun_hours_per_day": peak_sun_hours,
        "performance_ratio": PERFORMANCE_RATIO,
        "area_per_kwp_sqm": AREA_PER_KWP_SQM,
        "cost_per_kwp": customer["cost_per_kwp"],
        "annual_maintenance_pct_of_capex": ANNUAL_MAINTENANCE_PCT,
        "co2_factor_kg_per_kwh": CO2_FACTOR_KG_PER_KWH,
        "system_lifetime_years": SYSTEM_LIFETIME_YEARS,
        "export_compensation_ratio": EXPORT_COMPENSATION_RATIO,
        "default_tariff_per_kwh": state_values["tariff"],
        "tariff_used_per_kwh": tariff,
        "capacity_limited_by": limiting_factor,
        "system_preference": preference,
        "preferred_kwp": preferred_kwp,
        "area_capacity_kwp": round(area_capacity, 2),
        "consumption_capacity_kwp": round(consumption_capacity, 2),
        "annual_consumption_kwh": round(annual_consumption, 2),
        "annual_self_consumed_kwh": round(self_consumed, 2),
        "annual_exported_kwh": round(exported, 2),
        "area_cap_applied": area_capped,
        "subsidy_status": subsidy_status,
        "scheme_reference": PM_SURYA_GHAR_REFERENCE,
        "state_dataset": "Indicative state planning assumptions (sample)",
        "disclaimer": (
            "Planning estimate only. Actual yield, cost, subsidy and payback vary "
            "with site conditions, DISCOM tariff, net-metering rules and vendor quotes."
        ),
    }
    notifications = list(subsidy_notes)
    if preference == "MAX_ROOF":
        notifications.append(
            "System is sized to the available roof area; exported energy may exceed "
            "self-consumption and net-metering compensation varies by state."
        )
    elif preference == "MATCH_CONSUMPTION":
        notifications.append(
            "System is sized to offset annual consumption; surplus roof area is unused."
        )
    elif preference == "CUSTOM":
        notifications.append(
            "Custom system size applied, subject to the available roof area."
        )
    if area_capped:
        notifications.append(
            "Requested capacity exceeded the available roof area and was capped."
        )
    if limiting_factor == "rooftop_area":
        notifications.append(
            "Rooftop area is the limiting factor; generation is sized to available area."
        )
    elif limiting_factor == "electricity_consumption":
        notifications.append(
            "Electricity consumption is the limiting factor; generation is sized to "
            "offset annual usage rather than maximise roof capacity."
        )
    if recommended_kwp <= 1:
        notifications.append(
            "The recommended system is very small. Confirm shading and structural "
            "suitability with a site survey."
        )

    record = SolarCalculation(
        user_id=user.id,
        location=location,
        state=state,
        customer_type=customer_type,
        monthly_consumption_kwh=monthly_consumption,
        rooftop_area_sqm=rooftop_area,
        tariff_per_kwh=tariff,
        recommended_kwp=round(recommended_kwp, 2),
        installation_cost=round(installation_cost, 2),
        subsidy_amount=round(subsidy, 2),
        net_cost=round(net_cost, 2),
        annual_generation_kwh=round(annual_generation, 2),
        annual_savings=round(annual_savings, 2),
        payback_years=payback_years,
        lifetime_savings=lifetime_savings,
        co2_reduction_kg=round(co2_reduction, 2),
        assumptions={
            **assumptions,
            "notifications": notifications,
            "subsidy_eligible": subsidy > 0,
        },
        is_estimate=True,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    record_audit(
        db,
        user,
        action="solar_calculation_created",
        module="solar_calculator",
        entity_type="SolarCalculation",
        entity_id=record.id,
        description=(
            f"Rooftop estimate for {location}: {recommended_kwp:.1f} kWp, "
            f"payback {payback_years} years."
        ),
    )
    return serialise(record)


def serialise(record: SolarCalculation) -> dict[str, Any]:
    assumptions = record.assumptions or {}
    return {
        "id": record.id,
        "location": record.location,
        "state": record.state,
        "customer_type": record.customer_type,
        "monthly_consumption_kwh": record.monthly_consumption_kwh,
        "rooftop_area_sqm": record.rooftop_area_sqm,
        "tariff_per_kwh": record.tariff_per_kwh,
        "recommended_kwp": record.recommended_kwp,
        "installation_cost": record.installation_cost,
        "subsidy_amount": record.subsidy_amount,
        "net_cost": record.net_cost,
        "annual_generation_kwh": record.annual_generation_kwh,
        "annual_savings": record.annual_savings,
        "payback_years": record.payback_years,
        "lifetime_savings": record.lifetime_savings,
        "co2_reduction_kg": record.co2_reduction_kg,
        "co2_avoided_tonnes": round(record.co2_reduction_kg / 1000, 3),
        "limiting_factor": assumptions.get("capacity_limited_by"),
        "system_preference": assumptions.get("system_preference", "AUTO"),
        "area_capacity_kwp": assumptions.get("area_capacity_kwp"),
        "consumption_capacity_kwp": assumptions.get("consumption_capacity_kwp"),
        "annual_self_consumed_kwh": assumptions.get("annual_self_consumed_kwh"),
        "annual_exported_kwh": assumptions.get("annual_exported_kwh"),
        "subsidy_status": assumptions.get("subsidy_status", "UNKNOWN"),
        "subsidy_eligible": bool(assumptions.get("subsidy_eligible")),
        "scheme": assumptions.get("scheme_reference"),
        "notifications": assumptions.get("notifications", []),
        "assumptions": assumptions,
        "is_estimate": record.is_estimate,
        "created_at": record.created_at,
    }


def history(db: Session, user: User, limit: int = 20) -> dict[str, Any]:
    statement = select(SolarCalculation).order_by(SolarCalculation.created_at.desc())
    if user.role != UserRole.ADMIN:
        statement = statement.where(SolarCalculation.user_id == user.id)
    records = db.scalars(statement.limit(limit)).all()
    return {
        "items": [serialise(record) for record in records],
        "total": len(records),
        "generated_at": datetime.now(timezone.utc),
    }
