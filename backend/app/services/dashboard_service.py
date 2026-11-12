"""Role-aware national dashboard aggregation."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.allocation import AllocationRun
from app.models.apartment import Apartment
from app.models.billing import Bill
from app.models.green_grid import (
    FinanceScheme,
    GreenJob,
    JobApplication,
    Recycler,
    RecyclingTransaction,
    RpoTarget,
    SolarCalculation,
    StateEnergyStatistic,
)
from app.models.simulation_run import SimulationRun
from app.models.user import User, UserRole
from app.models.ecosystem import (
    EnergyComplianceRecord,
    GreenLoanApplication,
    GreenLoanProduct,
    OrganisationProfile,
    RecyclingRequest,
    RenewableProcurementRequest,
    SolarInstallation,
    SolarInstallationRequest,
    SupplierQuotation,
)
from app.services import circular_service, energy_service, impact_service, rpo_service
from app.services.admin_service import recent_activity
from app.services.ingestion.service import data_freshness_snapshot

ROLE_LABELS = {
    UserRole.ADMIN: "Administrator",
    UserRole.RESIDENT: "Resident / Citizen",
    UserRole.CITIZEN: "Citizen",
    UserRole.DISCOM: "DISCOM",
    UserRole.INDUSTRY: "Industry",
    UserRole.FINANCIAL_INSTITUTION: "Financial institution",
    UserRole.POLICYMAKER: "Policymaker",
    UserRole.SOLAR_INSTALLER: "Solar installer",
    UserRole.RENEWABLE_SUPPLIER: "Renewable energy supplier",
    UserRole.RECYCLER: "Recycler",
}

RPO_DASHBOARD_ROLES = {
    UserRole.ADMIN,
    UserRole.DISCOM,
    UserRole.INDUSTRY,
    UserRole.POLICYMAKER,
}


def _role_focus(
    db: Session,
    user: User,
    energy: dict[str, Any],
    rpo: dict[str, Any] | None,
    circular: dict[str, Any],
) -> list[dict[str, Any]]:
    totals = energy.get("totals", {})
    role = user.role

    if role in {UserRole.RESIDENT, UserRole.CITIZEN}:
        own_calculations = (
            db.scalar(
                select(func.count(SolarCalculation.id)).where(
                    SolarCalculation.user_id == user.id
                )
            )
            or 0
        )
        state_row = (
            db.scalar(
                select(StateEnergyStatistic)
                .where(StateEnergyStatistic.state == user.state)
                .order_by(StateEnergyStatistic.year.desc())
            )
            if user.state
            else None
        )
        return [
            {
                "key": "solar_calculations",
                "label": "Your rooftop estimates",
                "value": own_calculations,
                "unit": "calculations",
                "detail": "Saved ROI and subsidy assessments",
            },
            {
                "key": "state_renewable",
                "label": f"{user.state or 'National'} renewable capacity",
                "value": round(
                    state_row.total_renewable_mw if state_row else totals.get("renewable_capacity_mw", 0),
                    2,
                ),
                "unit": "MW",
                "detail": "Installed renewable capacity in the dataset",
            },
            {
                "key": "circular_logged",
                "label": "Your recycling log",
                "value": circular.get("totals", {}).get("total_quantity_kg", 0),
                "unit": "kg",
                "detail": "Waste logged through the circular economy tracker",
            },
        ]

    if role == UserRole.DISCOM:
        return [
            {
                "key": "rpo_compliance",
                "label": "RPO compliance",
                "value": (rpo or {}).get("summary", {}).get("overall_compliance_pct"),
                "unit": "%",
                "detail": "Across your recorded DISCOM obligations",
            },
            {
                "key": "rpo_shortfall",
                "label": "Renewable shortfall",
                "value": (rpo or {}).get("summary", {}).get("total_shortfall_mwh", 0),
                "unit": "MWh",
                "detail": "Recorded shortfall against RPO targets",
            },
            {
                "key": "state_renewable",
                "label": f"{user.state or 'National'} renewable capacity",
                "value": totals.get("renewable_capacity_mw", 0),
                "unit": "MW",
                "detail": "Installed renewable capacity in the dataset",
            },
        ]

    if role == UserRole.INDUSTRY:
        return [
            {
                "key": "rpo_compliance",
                "label": "Your RPO compliance",
                "value": (rpo or {}).get("summary", {}).get("overall_compliance_pct"),
                "unit": "%",
                "detail": "Against your recorded industrial obligations",
            },
            {
                "key": "recycling",
                "label": "Waste recycled",
                "value": circular.get("totals", {}).get("recycled_quantity_kg", 0),
                "unit": "kg",
                "detail": "Recycling transactions marked completed",
            },
            {
                "key": "renewable_share",
                "label": "National renewable share",
                "value": totals.get("renewable_capacity_share_pct", 0),
                "unit": "%",
                "detail": "Share of installed capacity in the dataset",
            },
        ]

    if role == UserRole.FINANCIAL_INSTITUTION:
        schemes = db.scalar(select(func.count(FinanceScheme.id))) or 0
        return [
            {
                "key": "finance_catalogue",
                "label": "Green finance products",
                "value": schemes,
                "unit": "schemes",
                "detail": "Loans, bonds, subsidies and market mechanisms",
            },
            {
                "key": "renewable_capacity",
                "label": "Renewable capacity",
                "value": totals.get("renewable_capacity_mw", 0),
                "unit": "MW",
                "detail": "National installed renewable capacity",
            },
            {
                "key": "solar_pipeline",
                "label": "Rooftop assessments",
                "value": db.scalar(select(func.count(SolarCalculation.id))) or 0,
                "unit": "calculations",
                "detail": "Platform-wide rooftop estimates generated",
            },
            {
                "key": "loan_pipeline",
                "label": "Green loan applications",
                "value": db.scalar(
                    select(func.count(GreenLoanApplication.id)).where(
                        GreenLoanApplication.institution_id == user.id
                    )
                )
                or 0,
                "unit": "applications",
                "detail": "Applications received against your loan products",
            },
        ]

    if role == UserRole.SOLAR_INSTALLER:
        return [
            {
                "key": "incoming_solar_requests",
                "label": "Incoming installation requests",
                "value": db.scalar(
                    select(func.count(SolarInstallationRequest.id)).where(
                        SolarInstallationRequest.status == "REQUESTED"
                    )
                )
                or 0,
                "unit": "requests",
                "detail": "Citizen requests awaiting an installer",
            },
            {
                "key": "active_installations",
                "label": "Active installations",
                "value": db.scalar(
                    select(func.count(SolarInstallation.id)).where(
                        SolarInstallation.installer_id == user.id,
                        SolarInstallation.status != "COMPLETED",
                    )
                )
                or 0,
                "unit": "projects",
                "detail": "Installations assigned to your business",
            },
            {
                "key": "completed_installations",
                "label": "Completed installations",
                "value": db.scalar(
                    select(func.count(SolarInstallation.id)).where(
                        SolarInstallation.installer_id == user.id,
                        SolarInstallation.status == "COMPLETED",
                    )
                )
                or 0,
                "unit": "projects",
                "detail": "Completed and recorded on the platform",
            },
        ]

    if role == UserRole.RENEWABLE_SUPPLIER:
        return [
            {
                "key": "open_procurement",
                "label": "Open procurement requests",
                "value": db.scalar(
                    select(func.count(RenewableProcurementRequest.id)).where(
                        RenewableProcurementRequest.status.in_(
                            {"OPEN", "QUOTATION_RECEIVED", "UNDER_REVIEW"}
                        )
                    )
                )
                or 0,
                "unit": "requests",
                "detail": "Live requirements in the marketplace",
            },
            {
                "key": "my_quotations",
                "label": "Your quotations",
                "value": db.scalar(
                    select(func.count(SupplierQuotation.id)).where(
                        SupplierQuotation.supplier_id == user.id
                    )
                )
                or 0,
                "unit": "quotations",
                "detail": "Offers submitted to DISCOMs",
            },
            {
                "key": "awarded_contracts",
                "label": "Awarded contracts",
                "value": db.scalar(
                    select(func.count(SupplierQuotation.id)).where(
                        SupplierQuotation.supplier_id == user.id,
                        SupplierQuotation.status == "AWARDED",
                    )
                )
                or 0,
                "unit": "contracts",
                "detail": "Procurement wins recorded on the platform",
            },
        ]

    if role == UserRole.RECYCLER:
        collected = db.scalar(
            select(func.coalesce(func.sum(RecyclingRequest.actual_weight_kg), 0.0)).where(
                RecyclingRequest.recycler_id == user.id,
                RecyclingRequest.status == "COMPLETED",
            )
        ) or 0.0
        return [
            {
                "key": "incoming_pickups",
                "label": "New pickup requests",
                "value": db.scalar(
                    select(func.count(RecyclingRequest.id)).where(
                        RecyclingRequest.status == "REQUESTED"
                    )
                )
                or 0,
                "unit": "requests",
                "detail": "Citizen requests awaiting acceptance",
            },
            {
                "key": "active_collections",
                "label": "Active collections",
                "value": db.scalar(
                    select(func.count(RecyclingRequest.id)).where(
                        RecyclingRequest.recycler_id == user.id,
                        RecyclingRequest.status.in_(
                            {"ACCEPTED", "PICKUP_SCHEDULED", "COLLECTED", "PROCESSING"}
                        ),
                    )
                )
                or 0,
                "unit": "pickups",
                "detail": "Scheduled and in-progress collections",
            },
            {
                "key": "waste_processed",
                "label": "Waste processed",
                "value": round(float(collected), 2),
                "unit": "kg",
                "detail": "Completed collections recorded by your facility",
            },
        ]


    if role == UserRole.POLICYMAKER:
        return [
            {
                "key": "renewable_share",
                "label": "Renewable capacity share",
                "value": totals.get("renewable_capacity_share_pct", 0),
                "unit": "%",
                "detail": "National installed capacity mix",
            },
            {
                "key": "rpo_compliance",
                "label": "RPO compliance",
                "value": (rpo or {}).get("summary", {}).get("overall_compliance_pct"),
                "unit": "%",
                "detail": "Across all recorded obligations",
            },
            {
                "key": "co2_avoided",
                "label": "CO2 avoided (estimated)",
                "value": (impact_service.overview(db)["summary"]["co2_avoided_million_tonnes"]),
                "unit": "Mt",
                "detail": "Estimated from renewable generation",
            },
        ]

    jobs = db.scalar(select(func.count(GreenJob.id))) or 0
    apps = db.scalar(select(func.count(JobApplication.id))) or 0
    recyclers = db.scalar(select(func.count(Recycler.id))) or 0
    return [
        {
            "key": "jobs",
            "label": "Green job listings",
            "value": jobs,
            "unit": "listings",
            "detail": f"{apps} applications submitted",
        },
        {
            "key": "recyclers",
            "label": "Recycler directory",
            "value": recyclers,
            "unit": "recyclers",
            "detail": "Solar, e-waste and battery recyclers",
        },
        {
            "key": "renewable_capacity",
            "label": "Renewable capacity",
            "value": totals.get("renewable_capacity_mw", 0),
            "unit": "MW",
            "detail": "National installed renewable capacity",
        },
    ]


def _ecosystem_summary(db: Session, user: User) -> dict[str, Any]:
    from app.models.ecosystem import Notification

    profile = db.scalar(
        select(OrganisationProfile).where(OrganisationProfile.owner_id == user.id)
    )
    solar_requests = db.scalar(
        select(func.count(SolarInstallationRequest.id)).where(
            SolarInstallationRequest.citizen_id == user.id
        )
    ) or 0
    if user.role == UserRole.SOLAR_INSTALLER:
        solar_requests = db.scalar(
            select(func.count(SolarInstallationRequest.id)).where(
                SolarInstallationRequest.installer_id == user.id
            )
        ) or 0
    loan_applications = db.scalar(
        select(func.count(GreenLoanApplication.id)).where(
            GreenLoanApplication.citizen_id == user.id
        )
    ) or 0
    if user.role == UserRole.FINANCIAL_INSTITUTION:
        loan_applications = db.scalar(
            select(func.count(GreenLoanApplication.id)).where(
                GreenLoanApplication.institution_id == user.id
            )
        ) or 0
    recycling_requests = db.scalar(
        select(func.count(RecyclingRequest.id)).where(
            RecyclingRequest.citizen_id == user.id
        )
    ) or 0
    if user.role == UserRole.RECYCLER:
        recycling_requests = db.scalar(
            select(func.count(RecyclingRequest.id)).where(
                RecyclingRequest.recycler_id == user.id
            )
        ) or 0
    compliance_records = db.scalar(
        select(func.count(EnergyComplianceRecord.id)).where(
            EnergyComplianceRecord.owner_id == user.id
        )
    ) or 0
    procurement_requests = db.scalar(
        select(func.count(RenewableProcurementRequest.id)).where(
            RenewableProcurementRequest.discom_id == user.id
        )
    ) or 0
    unread = db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == user.id,
            Notification.is_read.is_(False),
        )
    ) or 0
    return {
        "organisation": {
            "id": profile.id,
            "name": profile.name,
            "verification_status": profile.verification_status,
            "is_suspended": profile.is_suspended,
        }
        if profile
        else None,
        "solar_requests": solar_requests,
        "loan_applications": loan_applications,
        "recycling_requests": recycling_requests,
        "compliance_records": compliance_records,
        "procurement_requests": procurement_requests,
        "unread_notifications": unread,
        "label": "Live platform workflow activity",
        "is_sample": False,
    }


def overview(db: Session, user: User) -> dict[str, Any]:
    energy = energy_service.energy_overview(db)
    rpo = (
        rpo_service.overview(db, user)
        if user.role in RPO_DASHBOARD_ROLES
        else None
    )
    impact = impact_service.overview(db)
    circular = circular_service.summary(db, user)
    freshness = data_freshness_snapshot(db)

    jobs_count = db.scalar(
        select(func.count(GreenJob.id)).where(GreenJob.is_active.is_(True))
    ) or 0
    jobs_applied = db.scalar(
        select(func.count(JobApplication.id)).where(JobApplication.user_id == user.id)
    ) or 0
    finance_count = db.scalar(
        select(func.count(FinanceScheme.id)).where(FinanceScheme.is_active.is_(True))
    ) or 0
    recycler_count = db.scalar(select(func.count(Recycler.id))) or 0

    latest_calculation = db.scalar(
        select(SolarCalculation)
        .where(SolarCalculation.user_id == user.id)
        .order_by(SolarCalculation.created_at.desc())
    )

    apartments = db.scalar(select(func.count(Apartment.id))) or 0
    simulation_runs = db.scalar(select(func.count(SimulationRun.id))) or 0
    allocation_runs = db.scalar(select(func.count(AllocationRun.id))) or 0
    bills = db.scalar(select(func.count(Bill.id))) or 0

    latest_state_year = db.scalar(
        select(StateEnergyStatistic.year).order_by(StateEnergyStatistic.year.desc())
    )
    top_states = (
        db.scalars(
            select(StateEnergyStatistic)
            .where(StateEnergyStatistic.year == latest_state_year)
            .order_by(StateEnergyStatistic.total_renewable_mw.desc())
            .limit(5)
        ).all()
        if latest_state_year
        else []
    )

    return {
        "user": {
            "id": user.id,
            "name": user.name,
            "role": user.role,
            "role_label": ROLE_LABELS.get(user.role, user.role.value),
            "organization": user.organization,
            "state": user.state,
        },
        "hero": {
            "title": "India's renewable energy transition at a glance",
            "selected_year": energy.get("selected_year"),
            "renewable_capacity_mw": energy.get("totals", {}).get(
                "renewable_capacity_mw", 0
            ),
            "renewable_capacity_share_pct": energy.get("totals", {}).get(
                "renewable_capacity_share_pct", 0
            ),
            "renewable_generation_gwh": energy.get("totals", {}).get(
                "renewable_generation_gwh", 0
            ),
            "is_sample": True,
            "notice": (
                "National figures come from a bundled sample dataset based on "
                "public CEA/MNRE aggregates and are not a live official feed."
            ),
        },
        "role_focus": _role_focus(db, user, energy, rpo, circular),
        "energy": energy,
        "rpo": rpo,
        "impact": {
            "summary": impact["summary"],
            "historical": impact["historical"],
            "air_quality_source": impact["air_quality_source"],
        },
        "solar": {
            "calculation_count": db.scalar(
                select(func.count(SolarCalculation.id)).where(
                    SolarCalculation.user_id == user.id
                )
            )
            or 0,
            "latest": {
                "id": latest_calculation.id,
                "location": latest_calculation.location,
                "recommended_kwp": latest_calculation.recommended_kwp,
                "annual_savings": latest_calculation.annual_savings,
                "payback_years": latest_calculation.payback_years,
                "created_at": latest_calculation.created_at,
            }
            if latest_calculation
            else None,
        },
        "opportunities": {
            "jobs_count": jobs_count,
            "applications_count": jobs_applied,
            "finance_schemes_count": finance_count,
            "recyclers_count": recycler_count,
        },
        "circular": {
            "totals": circular["totals"],
            "is_scoped": circular["is_scoped"],
        },
        "ecosystem": _ecosystem_summary(db, user),
        "regional": [
            {
                "state": row.state,
                "total_renewable_mw": row.total_renewable_mw,
                "solar_capacity_mw": row.solar_capacity_mw,
                "wind_capacity_mw": row.wind_capacity_mw,
                "co2_avoided_tonnes": row.co2_avoided_tonnes,
            }
            for row in top_states
        ],
        "community_solar": {
            "apartments": apartments,
            "simulation_runs": simulation_runs,
            "allocation_runs": allocation_runs,
            "bills": bills,
            "label": "Community Solar Management (sample society)",
        },
        "activity": recent_activity(db, limit=8, actor=user),
        "data_freshness": freshness,
        "data_summary": {
            "fresh": sum(1 for item in freshness if item["freshness"] == "fresh"),
            "stale": sum(1 for item in freshness if item["freshness"] == "stale"),
            "unavailable": sum(
                1 for item in freshness if item["status"] == "unavailable"
            ),
            "sample_sources": sum(1 for item in freshness if item["is_demo"]),
        },
        "is_sample": True,
        "generated_at": datetime.now(timezone.utc),
    }
