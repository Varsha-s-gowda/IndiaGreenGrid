"""DISCOM <-> renewable-energy supplier procurement marketplace."""

from __future__ import annotations

from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.models.ecosystem import (
    OrganisationProfile,
    RenewableProcurementRequest,
    SupplierQuotation,
)
from app.models.user import User, UserRole
from app.schemas.ecosystem import (
    ProcurementAward,
    ProcurementRequestCreate,
    ProcurementRequestUpdate,
    SupplierQuotationCreate,
)
from app.services.audit_service import record_audit
from app.services.ecosystem_common import (
    get_organisation,
    make_reference,
    notify,
    paginate,
    require_organisation,
    user_brief,
    utcnow,
)

PROCUREMENT_TRANSITIONS = {
    "DRAFT": {"OPEN", "CANCELLED"},
    "OPEN": {"QUOTATION_RECEIVED", "UNDER_REVIEW", "AWARDED", "CLOSED", "CANCELLED"},
    "QUOTATION_RECEIVED": {"UNDER_REVIEW", "AWARDED", "CLOSED", "CANCELLED"},
    "UNDER_REVIEW": {"AWARDED", "CLOSED", "CANCELLED"},
    "AWARDED": {"CLOSED"},
    "CLOSED": set(),
    "CANCELLED": set(),
}


def serialise_quotation(quotation: SupplierQuotation, *, mask_supplier: bool = False) -> dict[str, Any]:
    supplier = quotation.supplier
    profile = None
    if quotation.organisation_id:
        profile = getattr(quotation, "organisation", None)
    return {
        "id": quotation.id,
        "request_id": quotation.request_id,
        "supplier_id": quotation.supplier_id,
        "supplier_name": None if mask_supplier else (supplier.name if supplier else None),
        "supplier_email": None if mask_supplier else (supplier.email if supplier else None),
        "organisation_id": quotation.organisation_id,
        "organisation_name": profile.name if profile else None,
        "quantity_mwh": quotation.quantity_mwh,
        "price_per_mwh": quotation.price_per_mwh,
        "total_price": quotation.total_price,
        "delivery_period_days": quotation.delivery_period_days,
        "delivery_start": quotation.delivery_start.isoformat() if quotation.delivery_start else None,
        "delivery_end": quotation.delivery_end.isoformat() if quotation.delivery_end else None,
        "terms": quotation.terms,
        "status": quotation.status,
        "created_at": quotation.created_at.isoformat() if quotation.created_at else None,
    }


def serialise_request(
    request: RenewableProcurementRequest, *, include_quotations: bool = False
) -> dict[str, Any]:
    data = {
        "id": request.id,
        "reference": request.reference,
        "discom_id": request.discom_id,
        "discom": user_brief(getattr(request, "discom", None)),
        "organisation_id": request.organisation_id,
        "title": request.title,
        "energy_type": request.energy_type,
        "quantity_mwh": request.quantity_mwh,
        "delivery_start": request.delivery_start.isoformat() if request.delivery_start else None,
        "delivery_end": request.delivery_end.isoformat() if request.delivery_end else None,
        "delivery_location": request.delivery_location,
        "max_price_per_mwh": request.max_price_per_mwh,
        "description": request.description,
        "status": request.status,
        "awarded_quotation_id": request.awarded_quotation_id,
        "awarded_at": request.awarded_at.isoformat() if request.awarded_at else None,
        "closed_at": request.closed_at.isoformat() if request.closed_at else None,
        "quotation_count": len(request.quotations),
        "created_at": request.created_at.isoformat() if request.created_at else None,
        "updated_at": request.updated_at.isoformat() if request.updated_at else None,
    }
    if include_quotations:
        data["quotations"] = [serialise_quotation(quote) for quote in request.quotations]
    return data


def _supplier_profile(db: Session, user: User) -> OrganisationProfile:
    return require_organisation(db, user, require_verified=True)


def create_request(
    db: Session, user: User, payload: ProcurementRequestCreate
) -> dict[str, Any]:
    if user.role != UserRole.DISCOM:
        raise ForbiddenError("Only DISCOM accounts can create procurement requests.")
    profile = require_organisation(db, user, require_verified=True)
    request = RenewableProcurementRequest(
        discom_id=user.id,
        organisation_id=profile.id,
        reference=make_reference("PROC"),
        title=payload.title.strip(),
        energy_type=payload.energy_type,
        quantity_mwh=payload.quantity_mwh,
        delivery_start=payload.delivery_start,
        delivery_end=payload.delivery_end,
        delivery_location=payload.delivery_location.strip(),
        max_price_per_mwh=payload.max_price_per_mwh,
        description=payload.description.strip(),
        status="DRAFT",
    )
    db.add(request)
    db.flush()
    record_audit(
        db,
        user,
        action="PROCUREMENT_REQUEST_CREATED",
        module="procurement",
        entity_type="PROCUREMENT_REQUEST",
        entity_id=request.id,
        description=f"Procurement request {request.reference} created.",
        commit=False,
    )
    db.commit()
    db.refresh(request)
    return serialise_request(request, include_quotations=True)


def _load(db: Session, request_id: int) -> RenewableProcurementRequest:
    request = db.get(RenewableProcurementRequest, request_id)
    if request is None:
        raise NotFoundError("Procurement request was not found.")
    return request


def update_request(
    db: Session, user: User, request_id: int, payload: ProcurementRequestUpdate
) -> dict[str, Any]:
    request = _load(db, request_id)
    if request.discom_id != user.id and user.role != UserRole.ADMIN:
        raise ForbiddenError("You cannot edit this procurement request.")
    data = payload.model_dump(exclude_unset=True)
    target_status = data.pop("status", None)
    if request.status in {"CLOSED", "CANCELLED", "AWARDED"} and target_status is None:
        raise BadRequestError("This procurement request is closed for edits.")
    for field, value in data.items():
        if value is not None:
            setattr(request, field, value.strip() if isinstance(value, str) else value)
    if target_status:
        _set_status(db, user, request, target_status)
    record_audit(
        db,
        user,
        action="PROCUREMENT_REQUEST_UPDATED",
        module="procurement",
        entity_type="PROCUREMENT_REQUEST",
        entity_id=request.id,
        description="Procurement request updated.",
        commit=False,
    )
    db.commit()
    db.refresh(request)
    return serialise_request(request, include_quotations=True)


def _set_status(
    db: Session,
    user: User,
    request: RenewableProcurementRequest,
    target: str,
    note: str = "",
) -> None:
    if target not in PROCUREMENT_TRANSITIONS.get(request.status, set()):
        raise BadRequestError(
            f"Cannot move procurement request from {request.status} to {target}."
        )
    if target == "OPEN":
        profile = get_organisation(db, user)
        if profile is None or profile.verification_status != "VERIFIED":
            raise ForbiddenError("Your organisation must be verified before publishing.")
        _notify_suppliers(db, request)
    if target == "CLOSED":
        request.closed_at = utcnow()
    request.status = target
    record_audit(
        db,
        user,
        action=f"PROCUREMENT_{target}",
        module="procurement",
        entity_type="PROCUREMENT_REQUEST",
        entity_id=request.id,
        description=note or f"Procurement status set to {target}.",
        commit=False,
    )


def _notify_suppliers(db: Session, request: RenewableProcurementRequest) -> None:
    profiles = db.scalars(
        select(OrganisationProfile).where(
            OrganisationProfile.organisation_type == UserRole.RENEWABLE_SUPPLIER.value,
            OrganisationProfile.verification_status == "VERIFIED",
            OrganisationProfile.is_suspended.is_(False),
        )
    ).all()
    for profile in profiles:
        energy_types = profile.energy_types or []
        if energy_types and request.energy_type not in energy_types and request.energy_type != "ANY":
            continue
        states = profile.serviceable_states or []
        if states and request.delivery_location and request.delivery_location not in states:
            continue
        notify(
            db,
            profile.owner_id,
            title="New renewable procurement request",
            message=f"{request.title} · {request.quantity_mwh:g} MWh",
            category="PROCUREMENT",
            link="/supplier/marketplace",
            entity_type="PROCUREMENT_REQUEST",
            entity_id=request.id,
        )


def publish_request(db: Session, user: User, request_id: int) -> dict[str, Any]:
    request = _load(db, request_id)
    if request.discom_id != user.id and user.role != UserRole.ADMIN:
        raise ForbiddenError("You cannot publish this procurement request.")
    _set_status(db, user, request, "OPEN")
    db.commit()
    db.refresh(request)
    return serialise_request(request, include_quotations=True)


def close_request(db: Session, user: User, request_id: int, note: str = "") -> dict[str, Any]:
    request = _load(db, request_id)
    if request.discom_id != user.id and user.role != UserRole.ADMIN:
        raise ForbiddenError("You cannot close this procurement request.")
    _set_status(db, user, request, "CLOSED", note)
    db.commit()
    db.refresh(request)
    return serialise_request(request, include_quotations=True)


def cancel_request(db: Session, user: User, request_id: int, note: str = "") -> dict[str, Any]:
    request = _load(db, request_id)
    if request.discom_id != user.id and user.role != UserRole.ADMIN:
        raise ForbiddenError("You cannot cancel this procurement request.")
    _set_status(db, user, request, "CANCELLED", note)
    db.commit()
    db.refresh(request)
    return serialise_request(request, include_quotations=True)


def list_requests(
    db: Session,
    user: User,
    *,
    status: str | None = None,
    energy_type: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    stmt = select(RenewableProcurementRequest)
    if user.role == UserRole.DISCOM:
        stmt = stmt.where(RenewableProcurementRequest.discom_id == user.id)
    elif user.role == UserRole.ADMIN:
        pass
    elif user.role == UserRole.RENEWABLE_SUPPLIER:
        profile = get_organisation(db, user)
        states = (profile.serviceable_states or []) if profile else []
        quoted = select(SupplierQuotation.request_id).where(
            SupplierQuotation.supplier_id == user.id
        )
        visibility = RenewableProcurementRequest.status.in_(
            {"OPEN", "QUOTATION_RECEIVED", "UNDER_REVIEW", "AWARDED", "CLOSED"}
        )
        stmt = stmt.where(
            or_(
                RenewableProcurementRequest.id.in_(quoted),
                visibility,
            )
        )
        if states:
            stmt = stmt.where(
                or_(
                    RenewableProcurementRequest.delivery_location == "",
                    RenewableProcurementRequest.delivery_location.in_(states),
                )
            )
    elif user.role == UserRole.POLICYMAKER:
        stmt = stmt.where(RenewableProcurementRequest.status.in_({"AWARDED", "CLOSED"}))
    else:
        raise ForbiddenError("You cannot access procurement requests.")
    if status:
        stmt = stmt.where(RenewableProcurementRequest.status == status)
    if energy_type:
        stmt = stmt.where(RenewableProcurementRequest.energy_type == energy_type)
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                RenewableProcurementRequest.title.ilike(pattern),
                RenewableProcurementRequest.reference.ilike(pattern),
                RenewableProcurementRequest.delivery_location.ilike(pattern),
            )
        )
    stmt = stmt.order_by(RenewableProcurementRequest.created_at.desc())
    result = paginate(stmt, db, page=page, page_size=page_size)
    result["items"] = [serialise_request(item) for item in result["items"]]
    return result


def get_request(db: Session, user: User, request_id: int) -> dict[str, Any]:
    request = _load(db, request_id)
    if user.role == UserRole.ADMIN or user.role == UserRole.POLICYMAKER:
        pass
    elif user.role == UserRole.DISCOM:
        if request.discom_id != user.id:
            raise ForbiddenError("You cannot access this procurement request.")
    elif user.role == UserRole.RENEWABLE_SUPPLIER:
        quoted = db.scalar(
            select(SupplierQuotation.id).where(
                SupplierQuotation.request_id == request.id,
                SupplierQuotation.supplier_id == user.id,
            )
        )
        if request.status == "DRAFT" or (request.status not in {"OPEN", "QUOTATION_RECEIVED", "UNDER_REVIEW", "AWARDED", "CLOSED"} and not quoted):
            raise ForbiddenError("You cannot access this procurement request.")
    else:
        raise ForbiddenError("You cannot access this procurement request.")
    data = serialise_request(request, include_quotations=True)
    if user.role == UserRole.RENEWABLE_SUPPLIER:
        data["quotations"] = [
            quote for quote in data["quotations"] if quote["supplier_id"] == user.id
        ]
    return data


def submit_quotation(
    db: Session, user: User, request_id: int, payload: SupplierQuotationCreate
) -> dict[str, Any]:
    if user.role != UserRole.RENEWABLE_SUPPLIER:
        raise ForbiddenError("Only renewable suppliers can submit procurement quotations.")
    profile = _supplier_profile(db, user)
    request = _load(db, request_id)
    if request.status not in {"OPEN", "QUOTATION_RECEIVED"}:
        raise BadRequestError("This procurement request is not accepting quotations.")
    if request.energy_type != "ANY":
        energy_types = profile.energy_types or []
        if energy_types and request.energy_type not in energy_types:
            raise BadRequestError("Your organisation does not supply this energy type.")
    existing = db.scalar(
        select(SupplierQuotation).where(
            SupplierQuotation.request_id == request.id,
            SupplierQuotation.supplier_id == user.id,
        )
    )
    if existing is not None:
        raise ConflictError("You have already submitted a quotation for this request.")
    quotation = SupplierQuotation(
        request_id=request.id,
        supplier_id=user.id,
        organisation_id=profile.id,
        quantity_mwh=payload.quantity_mwh,
        price_per_mwh=payload.price_per_mwh,
        total_price=round(payload.quantity_mwh * payload.price_per_mwh, 2),
        delivery_period_days=payload.delivery_period_days,
        delivery_start=payload.delivery_start,
        delivery_end=payload.delivery_end,
        terms=payload.terms,
        status="SUBMITTED",
    )
    db.add(quotation)
    request.status = "QUOTATION_RECEIVED"
    notify(
        db,
        request.discom_id,
        title="New supplier quotation",
        message=f"{profile.name} quoted ₹{payload.price_per_mwh:g}/MWh for {request.reference}.",
        category="PROCUREMENT",
        link="/discom/procurement",
        entity_type="PROCUREMENT_REQUEST",
        entity_id=request.id,
    )
    record_audit(
        db,
        user,
        action="SUPPLIER_QUOTATION_SUBMITTED",
        module="procurement",
        entity_type="SUPPLIER_QUOTATION",
        entity_id=quotation.id,
        description=f"Quotation for {request.reference}.",
        commit=False,
    )
    db.commit()
    db.refresh(quotation)
    return serialise_quotation(quotation)


def withdraw_quotation(
    db: Session, user: User, quotation_id: int, note: str = ""
) -> dict[str, Any]:
    quotation = db.get(SupplierQuotation, quotation_id)
    if quotation is None:
        raise NotFoundError("Quotation was not found.")
    if quotation.supplier_id != user.id:
        raise ForbiddenError("You can only withdraw your own quotation.")
    if quotation.status != "SUBMITTED":
        raise BadRequestError("Only submitted quotations can be withdrawn.")
    quotation.status = "WITHDRAWN"
    remaining = db.scalar(
        select(SupplierQuotation.id).where(
            SupplierQuotation.request_id == quotation.request_id,
            SupplierQuotation.status == "SUBMITTED",
            SupplierQuotation.id != quotation.id,
        )
    )
    if remaining is None:
        quotation.request.status = "OPEN"
    record_audit(
        db,
        user,
        action="SUPPLIER_QUOTATION_WITHDRAWN",
        module="procurement",
        entity_type="SUPPLIER_QUOTATION",
        entity_id=quotation.id,
        description=note,
        commit=False,
    )
    db.commit()
    db.refresh(quotation)
    return serialise_quotation(quotation)


def list_my_quotations(
    db: Session,
    user: User,
    *,
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    if user.role not in {UserRole.RENEWABLE_SUPPLIER, UserRole.DISCOM, UserRole.ADMIN}:
        raise ForbiddenError("You cannot access supplier quotations.")
    stmt = select(SupplierQuotation)
    if user.role == UserRole.RENEWABLE_SUPPLIER:
        stmt = stmt.where(SupplierQuotation.supplier_id == user.id)
    elif user.role == UserRole.DISCOM:
        stmt = stmt.join(
            RenewableProcurementRequest,
            SupplierQuotation.request_id == RenewableProcurementRequest.id,
        ).where(RenewableProcurementRequest.discom_id == user.id)
    if status:
        stmt = stmt.where(SupplierQuotation.status == status)
    stmt = stmt.order_by(SupplierQuotation.created_at.desc())
    result = paginate(stmt, db, page=page, page_size=page_size)
    result["items"] = [serialise_quotation(item) for item in result["items"]]
    return result


def award_quotation(
    db: Session, user: User, request_id: int, payload: ProcurementAward
) -> dict[str, Any]:
    request = _load(db, request_id)
    if request.discom_id != user.id and user.role != UserRole.ADMIN:
        raise ForbiddenError("You cannot award this procurement request.")
    if request.status not in {"OPEN", "QUOTATION_RECEIVED", "UNDER_REVIEW"}:
        raise BadRequestError("This procurement request cannot be awarded in its current state.")
    quotation = db.get(SupplierQuotation, payload.quotation_id)
    if quotation is None or quotation.request_id != request.id:
        raise NotFoundError("Quotation was not found for this request.")
    if quotation.status not in {"SUBMITTED", "SHORTLISTED"}:
        raise BadRequestError("This quotation is no longer available for award.")
    for quote in request.quotations:
        if quote.id == quotation.id:
            quote.status = "AWARDED"
        elif quote.status in {"SUBMITTED", "SHORTLISTED"}:
            quote.status = "REJECTED"
    request.status = "AWARDED"
    request.awarded_quotation_id = quotation.id
    request.awarded_at = utcnow()
    notify(
        db,
        quotation.supplier_id,
        title="Your quotation was awarded",
        message=f"{request.reference} was awarded to your organisation.",
        category="PROCUREMENT",
        link="/supplier/contracts",
        entity_type="PROCUREMENT_REQUEST",
        entity_id=request.id,
    )
    for quote in request.quotations:
        if quote.id != quotation.id:
            notify(
                db,
                quote.supplier_id,
                title="Procurement decision",
                message=f"{request.reference} was awarded to another supplier.",
                category="PROCUREMENT",
                link="/supplier/quotations",
                entity_type="PROCUREMENT_REQUEST",
                entity_id=request.id,
            )
    record_audit(
        db,
        user,
        action="PROCUREMENT_AWARDED",
        module="procurement",
        entity_type="PROCUREMENT_REQUEST",
        entity_id=request.id,
        description=payload.note or f"Awarded quotation {quotation.id}.",
        commit=False,
    )
    db.commit()
    db.refresh(request)
    return serialise_request(request, include_quotations=True)
