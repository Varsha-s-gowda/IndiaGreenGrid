"""Analytics derived from live ecosystem transactions.

Every figure here is computed from workflow records created through the API, so
the dashboards can distinguish platform-recorded activity from bundled sample
data.  Each block carries a provenance label rather than silently mixing the
two.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.ecosystem import (
    ApplicationDocument,
    EnergyComplianceRecord,
    GreenLoanApplication,
    GreenLoanProduct,
    OrganisationProfile,
    RecyclingRequest,
    RenewableProcurementRequest,
    SolarInstallation,
    SolarInstallationRequest,
    SolarQuotation,
    SupplierQuotation,
)
from app.models.user import UserRole

PLATFORM_PROVENANCE = {
    "source": "platform_transactions",
    "classification": "PLATFORM_RECORDED",
    "is_sample": False,
    "note": (
        "Calculated from workflow records created by platform users. "
        "These are operational records, not audited government statistics."
    ),
}


def _count(db: Session, model, *filters) -> int:
    return db.scalar(select(func.count(model.id)).where(*filters)) or 0


def installed_capacity(db: Session) -> dict[str, Any]:
    capacity = (
        db.scalar(
            select(func.coalesce(func.sum(SolarQuotation.system_capacity_kwp), 0.0))
            .join(SolarInstallation, SolarInstallation.quotation_id == SolarQuotation.id)
            .where(SolarInstallation.status == "COMPLETED")
        )
        or 0.0
    )
    completed = _count(db, SolarInstallation, SolarInstallation.status == "COMPLETED")
    in_progress = _count(
        db,
        SolarInstallation,
        SolarInstallation.status.in_({"PENDING", "STARTED", "ON_HOLD"}),
    )
    return {
        "requests": _count(db, SolarInstallationRequest),
        "completed_installations": completed,
        "active_installations": in_progress,
        "installed_capacity_kwp": round(float(capacity), 2),
        "installed_capacity_mw": round(float(capacity) / 1000, 3),
        "provenance": PLATFORM_PROVENANCE,
        "label": "Platform-recorded rooftop installations",
    }


def verified_compliance(db: Session) -> dict[str, Any]:
    verified = db.scalars(
        select(EnergyComplianceRecord).where(
            EnergyComplianceRecord.status == "VERIFIED"
        )
    ).all()
    pending = _count(
        db,
        EnergyComplianceRecord,
        EnergyComplianceRecord.status.in_({"SUBMITTED", "UNDER_REVIEW"}),
    )
    obligated = sum(record.obligated_energy_mwh for record in verified)
    renewable = sum(record.actual_renewable_mwh for record in verified)
    return {
        "verified_filings": len(verified),
        "verified_obligated_mwh": round(obligated, 2),
        "verified_renewable_mwh": round(renewable, 2),
        "verified_shortfall_mwh": round(
            sum(record.shortfall_mwh for record in verified), 2
        ),
        "verified_compliance_pct": round(renewable / obligated * 100, 2)
        if obligated
        else 0.0,
        "pending_filings": pending,
        "provenance": {
            **PLATFORM_PROVENANCE,
            "note": (
                "Only filings an administrator has marked VERIFIED are counted. "
                "They are workflow approvals, not regulatory certificates."
            ),
        },
        "label": "Administrator-verified RPO filings",
    }


def recycling_recovery(db: Session) -> dict[str, Any]:
    completed = db.scalars(
        select(RecyclingRequest).where(RecyclingRequest.status == "COMPLETED")
    ).all()
    recovered_kg = 0.0
    for request in completed:
        for material in request.recovered_materials or []:
            try:
                recovered_kg += float(material.get("quantity_kg") or 0)
            except (TypeError, ValueError):
                continue
    collected = sum(request.actual_weight_kg or 0 for request in completed)
    return {
        "completed_requests": len(completed),
        "collected_weight_kg": round(collected, 2),
        "recovered_material_kg": round(recovered_kg, 2),
        "certificates_issued": sum(1 for request in completed if request.certificate_code),
        "active_requests": _count(
            db,
            RecyclingRequest,
            RecyclingRequest.status.in_(
                {"REQUESTED", "ACCEPTED", "PICKUP_SCHEDULED", "COLLECTED", "PROCESSING"}
            ),
        ),
        "provenance": {
            **PLATFORM_PROVENANCE,
            "note": (
                "Collected weight and recovered material come from recycler "
                "entries on completed requests. They are not audited yields."
            ),
        },
        "label": "Platform-recorded recycling recovery",
    }


def loan_catalogue(db: Session) -> dict[str, Any]:
    active_products = db.scalars(
        select(GreenLoanProduct)
        .join(
            OrganisationProfile,
            GreenLoanProduct.organisation_id == OrganisationProfile.id,
        )
        .where(
            GreenLoanProduct.is_active.is_(True),
            OrganisationProfile.verification_status == "VERIFIED",
            OrganisationProfile.is_suspended.is_(False),
        )
    ).all()
    approved = db.scalars(
        select(GreenLoanApplication).where(GreenLoanApplication.status == "APPROVED")
    ).all()
    cheapest = min((product.interest_rate_min for product in active_products), default=0.0)
    return {
        "active_products": len(active_products),
        "verified_institutions": _count(
            db,
            OrganisationProfile,
            OrganisationProfile.organisation_type
            == UserRole.FINANCIAL_INSTITUTION.value,
            OrganisationProfile.verification_status == "VERIFIED",
            OrganisationProfile.is_suspended.is_(False),
        ),
        "applications": _count(db, GreenLoanApplication),
        "approved_applications": len(approved),
        "approved_amount": round(sum(loan.loan_amount for loan in approved), 2),
        "lowest_interest_rate_pct": round(cheapest, 2),
        "provenance": PLATFORM_PROVENANCE,
        "label": "Green loan marketplace published by verified institutions",
    }


def supplier_marketplace(db: Session) -> dict[str, Any]:
    return {
        "verified_suppliers": _count(
            db,
            OrganisationProfile,
            OrganisationProfile.organisation_type
            == UserRole.RENEWABLE_SUPPLIER.value,
            OrganisationProfile.verification_status == "VERIFIED",
            OrganisationProfile.is_suspended.is_(False),
        ),
        "open_requests": _count(
            db,
            RenewableProcurementRequest,
            RenewableProcurementRequest.status.in_(
                {"OPEN", "QUOTATION_RECEIVED", "UNDER_REVIEW"}
            ),
        ),
        "quotations": _count(db, SupplierQuotation),
        "awarded_contracts": _count(
            db, SupplierQuotation, SupplierQuotation.status == "AWARDED"
        ),
        "provenance": PLATFORM_PROVENANCE,
        "label": "DISCOM procurement marketplace",
    }


def verification_pipeline(db: Session) -> dict[str, Any]:
    by_type: dict[str, int] = {}
    for profile in db.scalars(
        select(OrganisationProfile).where(
            OrganisationProfile.verification_status == "VERIFIED",
            OrganisationProfile.is_suspended.is_(False),
        )
    ).all():
        by_type[profile.organisation_type] = by_type.get(profile.organisation_type, 0) + 1
    return {
        "verified_organisations": sum(by_type.values()),
        "pending_organisations": _count(
            db,
            OrganisationProfile,
            OrganisationProfile.verification_status == "PENDING",
        ),
        "by_type": by_type,
        "documents_uploaded": _count(db, ApplicationDocument),
        "provenance": PLATFORM_PROVENANCE,
        "label": "Administrator-verified organisations",
    }


def snapshot(db: Session) -> dict[str, Any]:
    """One provenance-labelled block for platform and impact dashboards."""

    return {
        "installed_capacity": installed_capacity(db),
        "compliance": verified_compliance(db),
        "recycling": recycling_recovery(db),
        "loans": loan_catalogue(db),
        "procurement": supplier_marketplace(db),
        "organisations": verification_pipeline(db),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "is_sample": False,
        "label": "Live platform workflow analytics",
    }
