"""Citizen <-> solar-installer installation workflow."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.models.ecosystem import (
    ApplicationDocument,
    OrganisationProfile,
    SolarInstallation,
    SolarInstallationRequest,
    SolarQuotation,
)
from app.models.green_grid import SolarCalculation
from app.models.user import User, UserRole
from app.schemas.ecosystem import (
    InstallationProgressUpdate,
    InspectionSchedule,
    SolarInstallationRequestCreate,
    SolarQuotationCreate,
)
from app.services.audit_service import record_audit
from app.services.ecosystem_common import (
    get_organisation,
    make_reference,
    notify,
    notify_many,
    paginate,
    require_organisation,
    user_brief,
    utcnow,
)

SOLAR_REQUEST_TRANSITIONS = {
    "REQUESTED": {"ACCEPTED", "REJECTED", "CANCELLED"},
    "ACCEPTED": {"INSPECTION_SCHEDULED", "QUOTATION_SUBMITTED", "CANCELLED", "REJECTED"},
    "INSPECTION_SCHEDULED": {"QUOTATION_SUBMITTED", "CANCELLED", "REJECTED"},
    "QUOTATION_SUBMITTED": {"QUOTE_ACCEPTED", "CANCELLED", "REJECTED"},
    "QUOTE_ACCEPTED": {"INSTALLATION_STARTED", "CANCELLED"},
    "INSTALLATION_STARTED": {"INSTALLATION_COMPLETED", "CANCELLED"},
    "INSTALLATION_COMPLETED": set(),
    "CANCELLED": set(),
    "REJECTED": set(),
}


def serialise_quotation(quotation: SolarQuotation, *, mask_installer: bool = False) -> dict[str, Any]:
    installer = quotation.installer
    return {
        "id": quotation.id,
        "request_id": quotation.request_id,
        "installer_id": quotation.installer_id,
        "installer_name": None if mask_installer else (installer.name if installer else None),
        "organisation_id": quotation.organisation_id,
        "price": quotation.price,
        "system_capacity_kwp": quotation.system_capacity_kwp,
        "equipment_details": quotation.equipment_details,
        "panel_details": quotation.panel_details,
        "inverter_details": quotation.inverter_details,
        "installation_duration_days": quotation.installation_duration_days,
        "warranty_years": quotation.warranty_years,
        "description": quotation.description,
        "valid_until": quotation.valid_until.isoformat() if quotation.valid_until else None,
        "status": quotation.status,
        "created_at": quotation.created_at.isoformat() if quotation.created_at else None,
    }


def serialise_installation(installation: SolarInstallation | None) -> dict[str, Any] | None:
    if installation is None:
        return None
    return {
        "id": installation.id,
        "request_id": installation.request_id,
        "quotation_id": installation.quotation_id,
        "citizen_id": installation.citizen_id,
        "installer_id": installation.installer_id,
        "installer_name": installation.installer.name if installation.installer else None,
        "status": installation.status,
        "progress_pct": installation.progress_pct,
        "milestones": installation.milestones,
        "started_at": installation.started_at.isoformat() if installation.started_at else None,
        "completed_at": installation.completed_at.isoformat() if installation.completed_at else None,
        "completion_notes": installation.completion_notes,
    }


def _document_count(db: Session, request_id: int) -> int:
    return (
        db.scalar(
            select(func.count(ApplicationDocument.id)).where(
                ApplicationDocument.entity_type == "SOLAR_REQUEST",
                ApplicationDocument.entity_id == request_id,
            )
        )
        or 0
    )


def serialise_request(
    request: SolarInstallationRequest,
    *,
    include_quotations: bool = False,
    documents: int = 0,
) -> dict[str, Any]:
    data = {
        "id": request.id,
        "reference": request.reference,
        "citizen_id": request.citizen_id,
        "citizen": user_brief(request.citizen),
        "installer_id": request.installer_id,
        "installer": user_brief(request.installer),
        "organisation_id": request.organisation_id,
        "organisation_name": request.organisation.name if request.organisation else None,
        "project_title": request.project_title,
        "property_type": request.property_type,
        "address": request.address,
        "city": request.city,
        "state": request.state,
        "pincode": request.pincode,
        "latitude": request.latitude,
        "longitude": request.longitude,
        "roof_area_sqm": request.roof_area_sqm,
        "monthly_consumption_kwh": request.monthly_consumption_kwh,
        "desired_capacity_kwp": request.desired_capacity_kwp,
        "additional_requirements": request.additional_requirements,
        "status": request.status,
        "rejection_reason": request.rejection_reason,
        "cancellation_reason": request.cancellation_reason,
        "inspection_scheduled_at": (
            request.inspection_scheduled_at.isoformat()
            if request.inspection_scheduled_at
            else None
        ),
        "accepted_at": request.accepted_at.isoformat() if request.accepted_at else None,
        "completed_at": request.completed_at.isoformat() if request.completed_at else None,
        "created_at": request.created_at.isoformat() if request.created_at else None,
        "updated_at": request.updated_at.isoformat() if request.updated_at else None,
        "quotation_count": len(request.quotations),
        "document_count": documents,
        "installation": serialise_installation(request.installation),
    }
    if include_quotations:
        data["quotations"] = [serialise_quotation(quote) for quote in request.quotations]
    return data


def _installer_profile(db: Session, user: User) -> OrganisationProfile:
    return require_organisation(db, user, require_verified=True)


def _verified_installer_ids_for_state(db: Session, state: str) -> list[int]:
    profiles = db.scalars(
        select(OrganisationProfile).where(
            OrganisationProfile.organisation_type == UserRole.SOLAR_INSTALLER.value,
            OrganisationProfile.verification_status == "VERIFIED",
            OrganisationProfile.is_suspended.is_(False),
        )
    ).all()
    ids: list[int] = []
    for profile in profiles:
        states = profile.serviceable_states or []
        if not states or state in states:
            ids.append(profile.owner_id)
    return ids


def create_request(db: Session, user: User, payload: SolarInstallationRequestCreate) -> dict[str, Any]:
    if user.role not in {UserRole.CITIZEN, UserRole.RESIDENT, UserRole.INDUSTRY}:
        raise ForbiddenError("Only citizen accounts can create solar installation requests.")
    if payload.solar_calculation_id is not None:
        calculation = db.get(SolarCalculation, payload.solar_calculation_id)
        if calculation is None or calculation.user_id != user.id:
            raise BadRequestError("The linked solar calculation was not found for your account.")

    installer_id = payload.installer_id
    if installer_id is not None:
        installer = db.get(User, installer_id)
        profile = db.scalar(
            select(OrganisationProfile).where(OrganisationProfile.owner_id == installer_id)
        )
        if (
            installer is None
            or installer.role != UserRole.SOLAR_INSTALLER
            or profile is None
            or profile.verification_status != "VERIFIED"
        ):
            raise BadRequestError("The selected installer is not verified.")

    request = SolarInstallationRequest(
        citizen_id=user.id,
        installer_id=installer_id,
        reference=make_reference("SOL"),
        project_title=payload.project_title.strip(),
        property_type=payload.property_type,
        address=payload.address.strip(),
        city=payload.city.strip(),
        state=payload.state.strip(),
        pincode=payload.pincode.strip(),
        latitude=payload.latitude,
        longitude=payload.longitude,
        roof_area_sqm=payload.roof_area_sqm,
        monthly_consumption_kwh=payload.monthly_consumption_kwh,
        desired_capacity_kwp=payload.desired_capacity_kwp,
        additional_requirements=payload.additional_requirements.strip(),
        solar_calculation_id=payload.solar_calculation_id,
        status="REQUESTED",
    )
    db.add(request)
    db.flush()

    if installer_id:
        notify(
            db,
            installer_id,
            title="New solar installation request",
            message=f"{request.project_title} ({request.city}, {request.state})",
            category="SOLAR",
            link="/installer/requests",
            entity_type="SOLAR_REQUEST",
            entity_id=request.id,
        )
    else:
        notify_many(
            db,
            _verified_installer_ids_for_state(db, request.state),
            title="New solar installation request",
            message=f"{request.project_title} ({request.city}, {request.state})",
            category="SOLAR",
            link="/installer/requests",
            entity_type="SOLAR_REQUEST",
            entity_id=request.id,
        )

    record_audit(
        db,
        user,
        action="SOLAR_REQUEST_CREATED",
        module="solar_requests",
        entity_type="SOLAR_REQUEST",
        entity_id=request.id,
        description=f"Solar installation request {request.reference} created.",
        commit=False,
    )
    db.commit()
    db.refresh(request)
    return serialise_request(request, include_quotations=True)


def _scope_filter(user: User, db: Session):
    if user.role == UserRole.ADMIN:
        return None
    if user.role in {UserRole.CITIZEN, UserRole.RESIDENT, UserRole.INDUSTRY}:
        return SolarInstallationRequest.citizen_id == user.id
    if user.role == UserRole.SOLAR_INSTALLER:
        profile = get_organisation(db, user)
        states = (profile.serviceable_states or []) if profile else []
        open_filter = SolarInstallationRequest.status == "REQUESTED"
        if states:
            open_filter = open_filter & SolarInstallationRequest.state.in_(states)
        return or_(
            SolarInstallationRequest.installer_id == user.id,
            open_filter,
        )
    return SolarInstallationRequest.citizen_id == -1


def list_requests(
    db: Session,
    user: User,
    *,
    status: str | None = None,
    state: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    stmt = select(SolarInstallationRequest)
    scope = _scope_filter(user, db)
    if scope is not None:
        stmt = stmt.where(scope)
    if status:
        stmt = stmt.where(SolarInstallationRequest.status == status)
    if state:
        stmt = stmt.where(SolarInstallationRequest.state == state)
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                SolarInstallationRequest.project_title.ilike(pattern),
                SolarInstallationRequest.reference.ilike(pattern),
                SolarInstallationRequest.city.ilike(pattern),
            )
        )
    stmt = stmt.order_by(SolarInstallationRequest.created_at.desc())
    result = paginate(stmt, db, page=page, page_size=page_size)
    result["items"] = [
        serialise_request(item, documents=_document_count(db, item.id))
        for item in result["items"]
    ]
    return result


def get_request(db: Session, user: User, request_id: int) -> SolarInstallationRequest:
    request = db.get(SolarInstallationRequest, request_id)
    if request is None:
        raise NotFoundError("Solar installation request was not found.")
    if user.role == UserRole.ADMIN:
        return request
    if user.role in {UserRole.CITIZEN, UserRole.RESIDENT, UserRole.INDUSTRY}:
        if request.citizen_id != user.id:
            raise ForbiddenError("You cannot access this solar request.")
        return request
    if user.role == UserRole.SOLAR_INSTALLER:
        if request.installer_id == user.id:
            return request
        if request.status == "REQUESTED":
            return request
        raise ForbiddenError("You can only access requests assigned to your business.")
    raise ForbiddenError("You cannot access this solar request.")


def get_request_detail(db: Session, user: User, request_id: int) -> dict[str, Any]:
    request = get_request(db, user, request_id)
    return serialise_request(
        request,
        include_quotations=True,
        documents=_document_count(db, request.id),
    )


def _assert_installer_owner(db: Session, user: User, request: SolarInstallationRequest) -> OrganisationProfile:
    profile = _installer_profile(db, user)
    if request.installer_id != user.id:
        raise ForbiddenError("This request is not assigned to your business.")
    return profile


def accept_request(db: Session, user: User, request_id: int, note: str = "") -> dict[str, Any]:
    profile = _installer_profile(db, user)
    request = get_request(db, user, request_id)
    if request.status != "REQUESTED":
        raise BadRequestError("Only new requests can be accepted.")
    if request.installer_id is not None and request.installer_id != user.id:
        raise ForbiddenError("Another installer has already been assigned to this request.")
    request.installer_id = user.id
    request.organisation_id = profile.id
    request.status = "ACCEPTED"
    request.accepted_at = utcnow()
    notify(
        db,
        request.citizen_id,
        title="Your solar request was accepted",
        message=f"{profile.name} accepted {request.reference}.",
        category="SOLAR",
        link="/citizen/solar-requests",
        entity_type="SOLAR_REQUEST",
        entity_id=request.id,
    )
    record_audit(
        db,
        user,
        action="SOLAR_REQUEST_ACCEPTED",
        module="solar_requests",
        entity_type="SOLAR_REQUEST",
        entity_id=request.id,
        description=note or "Installer accepted the solar request.",
        commit=False,
    )
    db.commit()
    db.refresh(request)
    return serialise_request(request, include_quotations=True)


def reject_request(db: Session, user: User, request_id: int, note: str = "") -> dict[str, Any]:
    _installer_profile(db, user)
    request = get_request(db, user, request_id)
    if request.installer_id != user.id:
        raise ForbiddenError("You can only reject requests assigned to your business.")
    if request.status not in {"REQUESTED", "ACCEPTED", "INSPECTION_SCHEDULED", "QUOTATION_SUBMITTED"}:
        raise BadRequestError("This request can no longer be rejected.")
    request.status = "REJECTED"
    request.rejection_reason = note or "Declined by installer."
    notify(
        db,
        request.citizen_id,
        title="Your solar request was declined",
        message=note or f"The installer declined {request.reference}.",
        category="SOLAR",
        link="/citizen/solar-requests",
        entity_type="SOLAR_REQUEST",
        entity_id=request.id,
    )
    record_audit(
        db,
        user,
        action="SOLAR_REQUEST_REJECTED",
        module="solar_requests",
        entity_type="SOLAR_REQUEST",
        entity_id=request.id,
        description=note,
        commit=False,
    )
    db.commit()
    db.refresh(request)
    return serialise_request(request, include_quotations=True)


def schedule_inspection(
    db: Session, user: User, request_id: int, payload: InspectionSchedule
) -> dict[str, Any]:
    _installer_profile(db, user)
    request = get_request(db, user, request_id)
    _assert_installer_owner(db, user, request)
    if request.status not in {"ACCEPTED", "INSPECTION_SCHEDULED"}:
        raise BadRequestError("The request must be accepted before scheduling an inspection.")
    request.status = "INSPECTION_SCHEDULED"
    request.inspection_scheduled_at = payload.scheduled_at
    notify(
        db,
        request.citizen_id,
        title="Site inspection scheduled",
        message=(
            f"Inspection for {request.reference} is scheduled for "
            f"{payload.scheduled_at.isoformat()}."
        ),
        category="SOLAR",
        link="/citizen/solar-requests",
        entity_type="SOLAR_REQUEST",
        entity_id=request.id,
    )
    record_audit(
        db,
        user,
        action="SOLAR_INSPECTION_SCHEDULED",
        module="solar_requests",
        entity_type="SOLAR_REQUEST",
        entity_id=request.id,
        description=payload.note,
        commit=False,
    )
    db.commit()
    db.refresh(request)
    return serialise_request(request, include_quotations=True)


def submit_quotation(
    db: Session, user: User, request_id: int, payload: SolarQuotationCreate
) -> dict[str, Any]:
    profile = _installer_profile(db, user)
    request = get_request(db, user, request_id)
    _assert_installer_owner(db, user, request)
    if request.status not in {"ACCEPTED", "INSPECTION_SCHEDULED", "QUOTATION_SUBMITTED"}:
        raise BadRequestError("Quotations can be submitted after acceptance or inspection.")
    existing = db.scalar(
        select(SolarQuotation).where(
            SolarQuotation.request_id == request.id,
            SolarQuotation.installer_id == user.id,
        )
    )
    if existing is not None:
        raise ConflictError("You have already submitted a quotation for this request.")
    quotation = SolarQuotation(
        request_id=request.id,
        installer_id=user.id,
        organisation_id=profile.id,
        price=payload.price,
        system_capacity_kwp=payload.system_capacity_kwp,
        equipment_details=payload.equipment_details,
        panel_details=payload.panel_details,
        inverter_details=payload.inverter_details,
        installation_duration_days=payload.installation_duration_days,
        warranty_years=payload.warranty_years,
        description=payload.description,
        valid_until=payload.valid_until,
        status="SUBMITTED",
    )
    db.add(quotation)
    request.status = "QUOTATION_SUBMITTED"
    notify(
        db,
        request.citizen_id,
        title="New solar quotation received",
        message=f"{profile.name} submitted a quotation for {request.reference}.",
        category="SOLAR",
        link="/citizen/solar-requests",
        entity_type="SOLAR_REQUEST",
        entity_id=request.id,
    )
    record_audit(
        db,
        user,
        action="SOLAR_QUOTATION_SUBMITTED",
        module="solar_requests",
        entity_type="SOLAR_QUOTATION",
        entity_id=quotation.id,
        description=f"Quotation submitted for {request.reference}.",
        commit=False,
    )
    db.commit()
    db.refresh(quotation)
    return serialise_quotation(quotation)


def withdraw_quotation(db: Session, user: User, quotation_id: int, note: str = "") -> dict[str, Any]:
    quotation = db.get(SolarQuotation, quotation_id)
    if quotation is None:
        raise NotFoundError("Quotation was not found.")
    if quotation.installer_id != user.id:
        raise ForbiddenError("You can only withdraw your own quotation.")
    if quotation.status != "SUBMITTED":
        raise BadRequestError("Only submitted quotations can be withdrawn.")
    quotation.status = "WITHDRAWN"
    request = quotation.request
    remaining = [
        quote
        for quote in request.quotations
        if quote.id != quotation.id and quote.status == "SUBMITTED"
    ]
    if not remaining and request.status == "QUOTATION_SUBMITTED":
        request.status = (
            "INSPECTION_SCHEDULED" if request.inspection_scheduled_at else "ACCEPTED"
        )
    record_audit(
        db,
        user,
        action="SOLAR_QUOTATION_WITHDRAWN",
        module="solar_requests",
        entity_type="SOLAR_QUOTATION",
        entity_id=quotation.id,
        description=note,
        commit=False,
    )
    db.commit()
    db.refresh(quotation)
    return serialise_quotation(quotation)


def list_quotations(db: Session, user: User, request_id: int) -> list[dict[str, Any]]:
    request = get_request(db, user, request_id)
    quotes = sorted(request.quotations, key=lambda quote: quote.price)
    mask = user.role == UserRole.SOLAR_INSTALLER
    return [serialise_quotation(quote, mask_installer=mask) for quote in quotes]


def accept_quotation(db: Session, user: User, quotation_id: int) -> dict[str, Any]:
    quotation = db.get(SolarQuotation, quotation_id)
    if quotation is None:
        raise NotFoundError("Quotation was not found.")
    request = quotation.request
    if request.citizen_id != user.id and user.role != UserRole.ADMIN:
        raise ForbiddenError("Only the request owner can accept a quotation.")
    if quotation.status != "SUBMITTED":
        raise BadRequestError("This quotation is no longer available.")
    if request.status not in {"ACCEPTED", "INSPECTION_SCHEDULED", "QUOTATION_SUBMITTED"}:
        raise BadRequestError("The request is not open for quotation acceptance.")

    for other in request.quotations:
        if other.id == quotation.id:
            other.status = "ACCEPTED"
        elif other.status == "SUBMITTED":
            other.status = "REJECTED"

    request.status = "QUOTE_ACCEPTED"
    installation = SolarInstallation(
        request_id=request.id,
        quotation_id=quotation.id,
        citizen_id=request.citizen_id,
        installer_id=quotation.installer_id,
        status="PENDING",
        progress_pct=0,
        milestones=[
            {
                "label": "Quotation accepted",
                "at": datetime.now(timezone.utc).isoformat(),
                "note": "",
            }
        ],
    )
    db.add(installation)
    notify(
        db,
        quotation.installer_id,
        title="Your quotation was accepted",
        message=f"{request.reference} was awarded to you.",
        category="SOLAR",
        link="/installer/installations",
        entity_type="SOLAR_REQUEST",
        entity_id=request.id,
    )
    record_audit(
        db,
        user,
        action="SOLAR_QUOTE_ACCEPTED",
        module="solar_requests",
        entity_type="SOLAR_QUOTATION",
        entity_id=quotation.id,
        description=f"Quotation accepted for {request.reference}.",
        commit=False,
    )
    db.commit()
    db.refresh(request)
    return serialise_request(request, include_quotations=True)


def reject_quotation(db: Session, user: User, quotation_id: int, note: str = "") -> dict[str, Any]:
    quotation = db.get(SolarQuotation, quotation_id)
    if quotation is None:
        raise NotFoundError("Quotation was not found.")
    request = quotation.request
    if request.citizen_id != user.id and user.role != UserRole.ADMIN:
        raise ForbiddenError("Only the request owner can reject a quotation.")
    if quotation.status != "SUBMITTED":
        raise BadRequestError("This quotation is no longer available.")
    quotation.status = "REJECTED"
    other_submitted = any(
        quote.status == "SUBMITTED" for quote in request.quotations if quote.id != quotation.id
    )
    if not other_submitted and request.status == "QUOTATION_SUBMITTED":
        request.status = (
            "INSPECTION_SCHEDULED" if request.inspection_scheduled_at else "ACCEPTED"
        )
    notify(
        db,
        quotation.installer_id,
        title="Your quotation was declined",
        message=note or f"The quotation for {request.reference} was not selected.",
        category="SOLAR",
        link="/installer/quotations",
        entity_type="SOLAR_QUOTATION",
        entity_id=quotation.id,
    )
    record_audit(
        db,
        user,
        action="SOLAR_QUOTE_REJECTED",
        module="solar_requests",
        entity_type="SOLAR_QUOTATION",
        entity_id=quotation.id,
        description=note,
        commit=False,
    )
    db.commit()
    db.refresh(quotation)
    return serialise_quotation(quotation)


def update_installation(
    db: Session, user: User, request_id: int, payload: InstallationProgressUpdate
) -> dict[str, Any]:
    request = get_request(db, user, request_id)
    if user.role != UserRole.ADMIN:
        _assert_installer_owner(db, user, request)
    installation = request.installation
    if installation is None:
        raise BadRequestError("An installation does not exist for this request.")
    if request.status not in {"QUOTE_ACCEPTED", "INSTALLATION_STARTED", "INSTALLATION_COMPLETED"}:
        raise BadRequestError("The installation cannot be updated in its current state.")

    target_status = payload.status
    now = utcnow()
    if target_status == "STARTED":
        if request.status not in {"QUOTE_ACCEPTED", "INSTALLATION_STARTED"}:
            raise BadRequestError("The installation cannot start yet.")
        request.status = "INSTALLATION_STARTED"
        installation.status = "STARTED"
        installation.started_at = installation.started_at or now
        if payload.progress_pct is None and installation.progress_pct == 0:
            installation.progress_pct = 10
    elif target_status == "ON_HOLD":
        installation.status = "ON_HOLD"
    elif target_status == "COMPLETED":
        if request.status not in {"QUOTE_ACCEPTED", "INSTALLATION_STARTED"}:
            raise BadRequestError("The installation cannot be completed yet.")
        request.status = "INSTALLATION_COMPLETED"
        request.completed_at = now
        installation.status = "COMPLETED"
        installation.progress_pct = 100
        installation.completed_at = now
        installation.completion_notes = payload.completion_notes or installation.completion_notes
    if payload.progress_pct is not None:
        installation.progress_pct = payload.progress_pct
    if payload.milestone:
        milestones = list(installation.milestones or [])
        milestones.append({"label": payload.milestone, "at": now.isoformat(), "note": ""})
        installation.milestones = milestones
    if payload.completion_notes:
        installation.completion_notes = payload.completion_notes

    notify(
        db,
        request.citizen_id,
        title="Installation update",
        message=f"{request.reference} is now {request.status.replace('_', ' ').lower()}.",
        category="SOLAR",
        link="/citizen/installation-tracking",
        entity_type="SOLAR_REQUEST",
        entity_id=request.id,
    )
    record_audit(
        db,
        user,
        action="SOLAR_INSTALLATION_UPDATED",
        module="solar_requests",
        entity_type="SOLAR_REQUEST",
        entity_id=request.id,
        description=f"Status {request.status}, progress {installation.progress_pct}%.",
        commit=False,
    )
    db.commit()
    db.refresh(request)
    return serialise_request(request, include_quotations=True)


def cancel_request(db: Session, user: User, request_id: int, note: str = "") -> dict[str, Any]:
    request = get_request(db, user, request_id)
    if request.citizen_id != user.id and user.role != UserRole.ADMIN:
        raise ForbiddenError("Only the request owner can cancel this request.")
    if request.status in {"INSTALLATION_COMPLETED", "CANCELLED", "REJECTED"}:
        raise BadRequestError("This request can no longer be cancelled.")
    request.status = "CANCELLED"
    request.cancellation_reason = note or "Cancelled by citizen."
    if request.installer_id:
        notify(
            db,
            request.installer_id,
            title="Solar request cancelled",
            message=f"{request.reference} was cancelled.",
            category="SOLAR",
            link="/installer/requests",
            entity_type="SOLAR_REQUEST",
            entity_id=request.id,
        )
    record_audit(
        db,
        user,
        action="SOLAR_REQUEST_CANCELLED",
        module="solar_requests",
        entity_type="SOLAR_REQUEST",
        entity_id=request.id,
        description=note,
        commit=False,
    )
    db.commit()
    db.refresh(request)
    return serialise_request(request, include_quotations=True)


def list_installations(
    db: Session,
    user: User,
    *,
    completed: bool | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    stmt = select(SolarInstallation)
    if user.role == UserRole.ADMIN:
        pass
    elif user.role == UserRole.SOLAR_INSTALLER:
        stmt = stmt.where(SolarInstallation.installer_id == user.id)
    else:
        stmt = stmt.where(SolarInstallation.citizen_id == user.id)
    if completed is True:
        stmt = stmt.where(SolarInstallation.status == "COMPLETED")
    elif completed is False:
        stmt = stmt.where(SolarInstallation.status != "COMPLETED")
    stmt = stmt.order_by(SolarInstallation.created_at.desc())
    result = paginate(stmt, db, page=page, page_size=page_size)
    result["items"] = [serialise_installation(item) for item in result["items"]]
    return result


def installer_directory(
    db: Session,
    *,
    search: str | None = None,
    state: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    stmt = select(OrganisationProfile).where(
        OrganisationProfile.organisation_type == UserRole.SOLAR_INSTALLER.value,
        OrganisationProfile.verification_status == "VERIFIED",
        OrganisationProfile.is_suspended.is_(False),
    )
    if search:
        stmt = stmt.where(OrganisationProfile.name.ilike(f"%{search.strip()}%"))
    stmt = stmt.order_by(OrganisationProfile.name.asc())
    profiles = list(db.scalars(stmt).all())
    if state:
        profiles = [
            profile
            for profile in profiles
            if profile.state == state or state in (profile.serviceable_states or [])
        ]
    total = len(profiles)
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    start = (page - 1) * page_size
    items = profiles[start : start + page_size]
    return {
        "items": [
            {
                "id": profile.id,
                "owner_id": profile.owner_id,
                "name": profile.name,
                "city": profile.city,
                "state": profile.state,
                "description": profile.description,
                "services": profile.services,
                "serviceable_states": profile.serviceable_states,
                "capacity_kwp": profile.capacity_kwp,
                "contact_email": profile.contact_email,
                "contact_phone": profile.contact_phone,
                "verification_status": profile.verification_status,
            }
            for profile in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)) if total else 1,
    }
