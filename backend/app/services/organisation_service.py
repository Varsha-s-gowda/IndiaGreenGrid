"""Organisation profiles, administrator verification and platform analytics."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.models.ecosystem import (
    ApplicationDocument,
    EnergyComplianceRecord,
    GreenLoanApplication,
    GreenLoanProduct,
    OrganisationProfile,
    OrganisationVerification,
    RecyclingRequest,
    RenewableProcurementRequest,
    SolarInstallation,
    SolarInstallationRequest,
    SolarQuotation,
)
from app.models.user import ORGANISATION_ROLES, STAKEHOLDER_ROLES, User, UserRole
from app.schemas.ecosystem import OrganisationProfileUpdate
from app.services.audit_service import record_audit
from app.services.ecosystem_common import (
    admin_ids,
    get_organisation,
    notify,
    paginate,
    user_brief,
    utcnow,
)

VERIFICATION_ACTIONS = {
    "APPROVE": "VERIFIED",
    "REJECT": "REJECTED",
    "REQUEST_DOCUMENTS": "PENDING",
    "SUSPEND": "SUSPENDED",
    "REACTIVATE": "VERIFIED",
}


def document_count(db: Session, organisation_id: int) -> int:
    return (
        db.scalar(
            select(func.count(ApplicationDocument.id)).where(
                ApplicationDocument.entity_type == "ORGANISATION",
                ApplicationDocument.entity_id == organisation_id,
            )
        )
        or 0
    )


def serialise_profile(
    db: Session, profile: OrganisationProfile, *, include_history: bool = False
) -> dict[str, Any]:
    data = {
        "id": profile.id,
        "owner_id": profile.owner_id,
        "owner": user_brief(getattr(profile, "owner", None)),
        "organisation_type": profile.organisation_type,
        "name": profile.name,
        "registration_number": profile.registration_number,
        "gstin": profile.gstin,
        "address": profile.address,
        "city": profile.city,
        "state": profile.state,
        "pincode": profile.pincode,
        "contact_email": profile.contact_email,
        "contact_phone": profile.contact_phone,
        "website": profile.website,
        "description": profile.description,
        "services": profile.services,
        "serviceable_states": profile.serviceable_states,
        "capacity_kwp": profile.capacity_kwp,
        "accepted_categories": profile.accepted_categories,
        "energy_types": profile.energy_types,
        "pickup_availability": profile.pickup_availability,
        "verification_status": profile.verification_status,
        "verification_note": profile.verification_note,
        "is_suspended": profile.is_suspended,
        "verified_at": profile.verified_at.isoformat() if profile.verified_at else None,
        "document_count": document_count(db, profile.id),
        "created_at": profile.created_at.isoformat() if profile.created_at else None,
        "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
    }
    if include_history:
        history = db.scalars(
            select(OrganisationVerification)
            .where(OrganisationVerification.organisation_id == profile.id)
            .order_by(OrganisationVerification.created_at.desc())
        ).all()
        data["history"] = [
            {
                "id": entry.id,
                "action": entry.action,
                "status_after": entry.status_after,
                "note": entry.note,
                "actor_id": entry.actor_id,
                "created_at": entry.created_at.isoformat() if entry.created_at else None,
            }
            for entry in history
        ]
    return data


def ensure_profile(db: Session, user: User) -> OrganisationProfile:
    """Return the profile, backfilling one for legacy organisational accounts."""

    profile = get_organisation(db, user)
    if profile is not None:
        return profile
    if user.role not in ORGANISATION_ROLES or user.role == UserRole.POLICYMAKER:
        raise ForbiddenError("Your account does not have an organisation profile.")
    profile = OrganisationProfile(
        owner_id=user.id,
        organisation_type=user.role.value,
        name=user.organization or user.name,
        state=user.state or "",
        contact_email=user.email,
        verification_status=(
            "VERIFIED" if user.verification_status == "VERIFIED" else "PENDING"
        ),
        verification_note=user.verification_note,
        verified_at=user.verified_at,
        verified_by_id=user.verified_by_id,
    )
    db.add(profile)
    db.flush()
    db.add(
        OrganisationVerification(
            organisation_id=profile.id,
            action="SUBMITTED",
            status_after=profile.verification_status,
            note="Profile created from an existing account.",
            actor_id=user.id,
        )
    )
    db.commit()
    db.refresh(profile)
    return profile


def get_my_profile(db: Session, user: User) -> dict[str, Any]:
    if user.role not in ORGANISATION_ROLES:
        raise ForbiddenError("Your account does not have an organisation profile.")
    if user.role == UserRole.POLICYMAKER:
        return {
            "organisation_type": user.role.value,
            "name": user.organization or user.name,
            "state": user.state,
            "verification_status": user.verification_status,
            "verification_note": user.verification_note,
            "document_count": 0,
            "id": None,
            "owner_id": user.id,
        }
    profile = ensure_profile(db, user)
    return serialise_profile(db, profile, include_history=True)


def update_my_profile(
    db: Session, user: User, payload: OrganisationProfileUpdate
) -> dict[str, Any]:
    if user.role not in ORGANISATION_ROLES or user.role == UserRole.POLICYMAKER:
        raise ForbiddenError("Your account does not have an editable organisation profile.")
    profile = ensure_profile(db, user)
    if profile.is_suspended:
        raise ForbiddenError("This organisation is suspended. Contact an administrator.")
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        if value is not None:
            setattr(profile, field, value)
    if "name" in data and data["name"]:
        user.organization = data["name"]
    if "state" in data and data["state"]:
        user.state = data["state"]
    record_audit(
        db,
        user,
        action="ORGANISATION_PROFILE_UPDATED",
        module="organisations",
        entity_type="ORGANISATION",
        entity_id=profile.id,
        description="Organisation profile updated.",
        commit=False,
    )
    db.commit()
    db.refresh(profile)
    return serialise_profile(db, profile, include_history=True)


def submit_for_verification(db: Session, user: User) -> dict[str, Any]:
    if user.role not in ORGANISATION_ROLES or user.role == UserRole.POLICYMAKER:
        raise ForbiddenError("Your account does not have an organisation profile.")
    profile = ensure_profile(db, user)
    if profile.verification_status == "SUSPENDED":
        raise ForbiddenError("Suspended organisations cannot submit for verification.")
    if profile.verification_status == "VERIFIED":
        raise BadRequestError("This organisation is already verified.")
    profile.verification_status = "PENDING"
    profile.verification_note = "Verification requested by organisation owner."
    user.verification_status = "PENDING"
    user.verification_note = profile.verification_note
    db.add(
        OrganisationVerification(
            organisation_id=profile.id,
            action="SUBMITTED",
            status_after="PENDING",
            note="Verification requested.",
            actor_id=user.id,
        )
    )
    for admin_id in admin_ids(db):
        notify(
            db,
            admin_id,
            title="Organisation verification request",
            message=f"{profile.name} requested verification.",
            category="ORGANISATION",
            link="/admin/ecosystem",
            entity_type="ORGANISATION",
            entity_id=profile.id,
        )
    record_audit(
        db,
        user,
        action="ORGANISATION_VERIFICATION_REQUESTED",
        module="organisations",
        entity_type="ORGANISATION",
        entity_id=profile.id,
        description="Verification requested.",
        commit=False,
    )
    db.commit()
    db.refresh(profile)
    return serialise_profile(db, profile, include_history=True)


def list_organisations(
    db: Session,
    user: User,
    *,
    status: str | None = None,
    organisation_type: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    if user.role != UserRole.ADMIN:
        raise ForbiddenError("Only administrators can list all organisations.")
    stmt = select(OrganisationProfile)
    if status:
        stmt = stmt.where(OrganisationProfile.verification_status == status)
    if organisation_type:
        stmt = stmt.where(OrganisationProfile.organisation_type == organisation_type)
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                OrganisationProfile.name.ilike(pattern),
                OrganisationProfile.city.ilike(pattern),
                OrganisationProfile.state.ilike(pattern),
                OrganisationProfile.contact_email.ilike(pattern),
            )
        )
    stmt = stmt.order_by(
        OrganisationProfile.verification_status.asc(),
        OrganisationProfile.created_at.desc(),
    )
    result = paginate(stmt, db, page=page, page_size=page_size)
    result["items"] = [serialise_profile(db, item) for item in result["items"]]
    return result


def get_organisation_detail(db: Session, user: User, organisation_id: int) -> dict[str, Any]:
    profile = db.get(OrganisationProfile, organisation_id)
    if profile is None:
        raise NotFoundError("Organisation was not found.")
    if user.role != UserRole.ADMIN and profile.owner_id != user.id:
        raise ForbiddenError("You cannot access this organisation.")
    return serialise_profile(db, profile, include_history=True)


def review_organisation(
    db: Session,
    admin: User,
    organisation_id: int,
    *,
    action: str,
    note: str = "",
) -> dict[str, Any]:
    if admin.role != UserRole.ADMIN:
        raise ForbiddenError("Only administrators can review organisations.")
    action = action.upper()
    if action not in VERIFICATION_ACTIONS:
        raise BadRequestError("Unsupported verification action.")
    profile = db.get(OrganisationProfile, organisation_id)
    if profile is None:
        raise NotFoundError("Organisation was not found.")
    owner = db.get(User, profile.owner_id)
    if owner is None:
        raise NotFoundError("The organisation owner account no longer exists.")

    target = VERIFICATION_ACTIONS[action]
    if action == "REACTIVATE":
        if not profile.is_suspended and profile.verification_status != "SUSPENDED":
            raise BadRequestError("This organisation is not suspended.")
        profile.is_suspended = False
        profile.verification_status = "VERIFIED"
        owner.verification_status = "VERIFIED"
        owner.is_active = True
    elif action == "SUSPEND":
        profile.is_suspended = True
        profile.verification_status = "SUSPENDED"
        owner.verification_status = "PENDING"
    elif action == "APPROVE":
        if profile.verification_status == "SUSPENDED":
            raise BadRequestError("Reactivate the organisation before approving it.")
        profile.is_suspended = False
        profile.verification_status = "VERIFIED"
        owner.verification_status = "VERIFIED"
        owner.verified_at = utcnow()
        owner.verified_by_id = admin.id
    elif action == "REJECT":
        profile.verification_status = "REJECTED"
        owner.verification_status = "REJECTED"
    elif action == "REQUEST_DOCUMENTS":
        profile.verification_status = "PENDING"
        owner.verification_status = "PENDING"

    profile.verification_note = note or f"Administrator action: {action.replace('_', ' ').lower()}."
    owner.verification_note = profile.verification_note
    db.add(
        OrganisationVerification(
            organisation_id=profile.id,
            action=action,
            status_after=target,
            note=profile.verification_note,
            actor_id=admin.id,
        )
    )
    notify(
        db,
        owner.id,
        title="Organisation verification update",
        message=f"{profile.name}: {action.replace('_', ' ').lower()}.",
        category="ORGANISATION",
        link="/organisation/profile",
        entity_type="ORGANISATION",
        entity_id=profile.id,
    )
    record_audit(
        db,
        admin,
        action=f"ORGANISATION_{action}",
        module="organisations",
        entity_type="ORGANISATION",
        entity_id=profile.id,
        description=profile.verification_note,
        commit=False,
    )
    db.commit()
    db.refresh(profile)
    return serialise_profile(db, profile, include_history=True)


def verification_history(
    db: Session, user: User, organisation_id: int
) -> list[dict[str, Any]]:
    profile = db.get(OrganisationProfile, organisation_id)
    if profile is None:
        raise NotFoundError("Organisation was not found.")
    if user.role != UserRole.ADMIN and profile.owner_id != user.id:
        raise ForbiddenError("You cannot access this organisation.")
    entries = db.scalars(
        select(OrganisationVerification)
        .where(OrganisationVerification.organisation_id == profile.id)
        .order_by(OrganisationVerification.created_at.desc())
    ).all()
    return [
        {
            "id": entry.id,
            "action": entry.action,
            "status_after": entry.status_after,
            "note": entry.note,
            "actor_id": entry.actor_id,
            "created_at": entry.created_at.isoformat() if entry.created_at else None,
        }
        for entry in entries
    ]


def platform_overview(db: Session) -> dict[str, Any]:
    """Administrator monitoring figures built from transactional tables."""

    def count(stmt) -> int:
        return db.scalar(stmt) or 0

    registered_capacity = db.scalar(
        select(func.coalesce(func.sum(SolarQuotation.system_capacity_kwp), 0.0))
        .join(SolarInstallation, SolarInstallation.quotation_id == SolarQuotation.id)
        .where(SolarInstallation.status == "COMPLETED")
    ) or 0.0
    waste_processed = db.scalar(
        select(func.coalesce(func.sum(RecyclingRequest.actual_weight_kg), 0.0)).where(
            RecyclingRequest.status == "COMPLETED"
        )
    ) or 0.0
    return {
        "total_users": count(select(func.count(User.id))),
        "active_users": count(select(func.count(User.id)).where(User.is_active.is_(True))),
        "pending_registrations": count(
            select(func.count(OrganisationProfile.id)).where(
                OrganisationProfile.verification_status == "PENDING"
            )
        ),
        "verified_organisations": count(
            select(func.count(OrganisationProfile.id)).where(
                OrganisationProfile.verification_status == "VERIFIED",
                OrganisationProfile.is_suspended.is_(False),
            )
        ),
        "solar_requests": count(select(func.count(SolarInstallationRequest.id))),
        "completed_installations": count(
            select(func.count(SolarInstallation.id)).where(
                SolarInstallation.status == "COMPLETED"
            )
        ),
        "registered_capacity_kwp": round(float(registered_capacity), 2),
        "pending_loan_applications": count(
            select(func.count(GreenLoanApplication.id)).where(
                GreenLoanApplication.status.in_(
                    {"SUBMITTED", "UNDER_REVIEW", "DOCUMENTS_REQUESTED", "DOCUMENTS_RESUBMITTED"}
                )
            )
        ),
        "active_loan_products": count(
            select(func.count(GreenLoanProduct.id)).where(GreenLoanProduct.is_active.is_(True))
        ),
        "active_recycling_requests": count(
            select(func.count(RecyclingRequest.id)).where(
                RecyclingRequest.status.in_(
                    {"REQUESTED", "ACCEPTED", "PICKUP_SCHEDULED", "COLLECTED", "PROCESSING"}
                )
            )
        ),
        "waste_processed_kg": round(float(waste_processed), 2),
        "pending_compliance": count(
            select(func.count(EnergyComplianceRecord.id)).where(
                EnergyComplianceRecord.status.in_({"SUBMITTED", "UNDER_REVIEW"})
            )
        ),
        "procurement_requests": count(select(func.count(RenewableProcurementRequest.id))),
        "open_procurement_requests": count(
            select(func.count(RenewableProcurementRequest.id)).where(
                RenewableProcurementRequest.status.in_({"OPEN", "QUOTATION_RECEIVED", "UNDER_REVIEW"})
            )
        ),
        "organisation_breakdown": {
            organisation_type: count(
                select(func.count(OrganisationProfile.id)).where(
                    OrganisationProfile.organisation_type == organisation_type
                )
            )
            for organisation_type in (
                "DISCOM",
                "INDUSTRY",
                "FINANCIAL_INSTITUTION",
                "SOLAR_INSTALLER",
                "RENEWABLE_SUPPLIER",
                "RECYCLER",
            )
        },
        "generated_at": utcnow().isoformat(),
        "note": (
            "Platform monitoring counts are computed live from transactional records. "
            "They are not official government statistics."
        ),
    }


def policy_aggregates(db: Session) -> dict[str, Any]:
    overview = platform_overview(db)
    user_counts = {
        role.value: db.scalar(select(func.count(User.id)).where(User.role == role)) or 0
        for role in STAKEHOLDER_ROLES
    }
    verified_compliance = db.scalars(
        select(EnergyComplianceRecord).where(EnergyComplianceRecord.status == "VERIFIED")
    ).all()
    approved_loans = db.scalars(
        select(GreenLoanApplication).where(GreenLoanApplication.status == "APPROVED")
    ).all()
    return {
        "users_by_role": user_counts,
        "monitoring": overview,
        "verified_compliance": {
            "filings": len(verified_compliance),
            "obligated_mwh": round(
                sum(record.obligated_energy_mwh for record in verified_compliance), 2
            ),
            "renewable_mwh": round(
                sum(record.actual_renewable_mwh for record in verified_compliance), 2
            ),
            "shortfall_mwh": round(
                sum(record.shortfall_mwh for record in verified_compliance), 2
            ),
        },
        "approved_green_loans": {
            "count": len(approved_loans),
            "amount": round(sum(loan.loan_amount for loan in approved_loans), 2),
        },
        "note": (
            "Aggregated platform activity for policy analysis. "
            "Sample data remains label-led and is not presented as live government data."
        ),
    }
