"""Citizen <-> recycler pickup and processing workflow."""

from __future__ import annotations

from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.models.ecosystem import (
    OrganisationProfile,
    RecyclingRequest,
    RecyclingRequestEvent,
)
from app.models.user import User, UserRole
from app.schemas.ecosystem import (
    CollectionUpdate,
    PickupSchedule,
    ProcessingUpdate,
    RecyclingRequestCreate,
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

RECYCLING_TRANSITIONS = {
    "REQUESTED": {"ACCEPTED", "REJECTED", "CANCELLED"},
    "ACCEPTED": {"PICKUP_SCHEDULED", "REJECTED", "CANCELLED"},
    "PICKUP_SCHEDULED": {"COLLECTED", "CANCELLED"},
    "COLLECTED": {"PROCESSING", "CANCELLED"},
    "PROCESSING": {"COMPLETED"},
    "COMPLETED": set(),
    "REJECTED": set(),
    "CANCELLED": set(),
}


def _add_event(
    db: Session,
    request: RecyclingRequest,
    user: User | None,
    status: str,
    note: str = "",
) -> None:
    db.add(
        RecyclingRequestEvent(
            request_id=request.id,
            status=status,
            note=note,
            actor_id=user.id if user else None,
            actor_role=user.role.value if user else "SYSTEM",
        )
    )


def serialise_event(event: RecyclingRequestEvent) -> dict[str, Any]:
    return {
        "id": event.id,
        "status": event.status,
        "note": event.note,
        "actor_id": event.actor_id,
        "actor_role": event.actor_role,
        "created_at": event.created_at.isoformat() if event.created_at else None,
    }


def serialise(request: RecyclingRequest, *, include_events: bool = False) -> dict[str, Any]:
    data = {
        "id": request.id,
        "reference": request.reference,
        "citizen_id": request.citizen_id,
        "citizen": user_brief(getattr(request, "citizen", None)),
        "recycler_id": request.recycler_id,
        "recycler": user_brief(getattr(request, "recycler", None)),
        "organisation_id": request.organisation_id,
        "organisation_name": getattr(getattr(request, "organisation", None), "name", None),
        "waste_category": request.waste_category,
        "estimated_weight_kg": request.estimated_weight_kg,
        "actual_weight_kg": request.actual_weight_kg,
        "address": request.address,
        "city": request.city,
        "state": request.state,
        "pincode": request.pincode,
        "preferred_pickup_date": (
            request.preferred_pickup_date.isoformat() if request.preferred_pickup_date else None
        ),
        "scheduled_pickup_at": (
            request.scheduled_pickup_at.isoformat() if request.scheduled_pickup_at else None
        ),
        "description": request.description,
        "status": request.status,
        "rejection_reason": request.rejection_reason,
        "cancellation_reason": request.cancellation_reason,
        "assigned_personnel": request.assigned_personnel,
        "collected_at": request.collected_at.isoformat() if request.collected_at else None,
        "completed_at": request.completed_at.isoformat() if request.completed_at else None,
        "processing_details": request.processing_details,
        "recovered_materials": request.recovered_materials,
        "certificate_code": request.certificate_code,
        "created_at": request.created_at.isoformat() if request.created_at else None,
        "updated_at": request.updated_at.isoformat() if request.updated_at else None,
    }
    if include_events:
        data["events"] = [
            serialise_event(event)
            for event in sorted(request.events, key=lambda item: item.created_at or utcnow())
        ]
    return data


def _recycler_profile(db: Session, user: User) -> OrganisationProfile:
    return require_organisation(db, user, require_verified=True)


def _matching_recycler_ids(db: Session, request: RecyclingRequest) -> list[int]:
    profiles = db.scalars(
        select(OrganisationProfile).where(
            OrganisationProfile.organisation_type == UserRole.RECYCLER.value,
            OrganisationProfile.verification_status == "VERIFIED",
            OrganisationProfile.is_suspended.is_(False),
        )
    ).all()
    ids: list[int] = []
    for profile in profiles:
        categories = profile.accepted_categories or []
        states = profile.serviceable_states or []
        if categories and request.waste_category not in categories:
            continue
        if states and request.state not in states:
            continue
        ids.append(profile.owner_id)
    return ids


def create_request(
    db: Session, user: User, payload: RecyclingRequestCreate
) -> dict[str, Any]:
    if user.role not in {UserRole.CITIZEN, UserRole.RESIDENT, UserRole.INDUSTRY}:
        raise ForbiddenError("Only citizen accounts can request a recycling pickup.")
    recycler_id = payload.recycler_id
    organisation_id = None
    if recycler_id is not None:
        profile = db.scalar(
            select(OrganisationProfile).where(OrganisationProfile.owner_id == recycler_id)
        )
        if (
            profile is None
            or profile.organisation_type != UserRole.RECYCLER.value
            or profile.verification_status != "VERIFIED"
            or profile.is_suspended
        ):
            raise BadRequestError("The selected recycling centre is not verified.")
        categories = profile.accepted_categories or []
        if categories and payload.waste_category not in categories:
            raise BadRequestError("The selected recycling centre does not accept this waste category.")
        organisation_id = profile.id
    request = RecyclingRequest(
        reference=make_reference("REC"),
        citizen_id=user.id,
        recycler_id=recycler_id,
        organisation_id=organisation_id,
        waste_category=payload.waste_category,
        estimated_weight_kg=payload.estimated_weight_kg,
        address=payload.address.strip(),
        city=payload.city.strip(),
        state=payload.state.strip(),
        pincode=payload.pincode.strip(),
        preferred_pickup_date=payload.preferred_pickup_date,
        description=payload.description.strip(),
        status="REQUESTED",
    )
    db.add(request)
    db.flush()
    _add_event(db, request, user, "REQUESTED", "Pickup request created.")
    if recycler_id:
        notify(
            db,
            recycler_id,
            title="New recycling pickup request",
            message=f"{payload.waste_category} · {payload.estimated_weight_kg:g} kg in {payload.city}.",
            category="RECYCLING",
            link="/recycler/requests",
            entity_type="RECYCLING_REQUEST",
            entity_id=request.id,
        )
    else:
        notify_many(
            db,
            _matching_recycler_ids(db, request),
            title="New recycling pickup request",
            message=f"{payload.waste_category} · {payload.estimated_weight_kg:g} kg in {payload.city}.",
            category="RECYCLING",
            link="/recycler/requests",
            entity_type="RECYCLING_REQUEST",
            entity_id=request.id,
        )
    record_audit(
        db,
        user,
        action="RECYCLING_REQUEST_CREATED",
        module="recycling",
        entity_type="RECYCLING_REQUEST",
        entity_id=request.id,
        description=f"Recycling request {request.reference} created.",
        commit=False,
    )
    db.commit()
    db.refresh(request)
    return serialise(request, include_events=True)


def _load(db: Session, request_id: int) -> RecyclingRequest:
    request = db.get(RecyclingRequest, request_id)
    if request is None:
        raise NotFoundError("Recycling request was not found.")
    return request


def get_request(db: Session, user: User, request_id: int) -> RecyclingRequest:
    request = _load(db, request_id)
    if user.role == UserRole.ADMIN:
        return request
    if user.role in {UserRole.CITIZEN, UserRole.RESIDENT, UserRole.INDUSTRY}:
        if request.citizen_id != user.id:
            raise ForbiddenError("You cannot access this recycling request.")
        return request
    if user.role == UserRole.RECYCLER:
        if request.recycler_id == user.id:
            return request
        if request.status == "REQUESTED":
            return request
        raise ForbiddenError("You can only access requests assigned to your facility.")
    raise ForbiddenError("You cannot access this recycling request.")


def get_detail(db: Session, user: User, request_id: int) -> dict[str, Any]:
    request = get_request(db, user, request_id)
    return serialise(request, include_events=True)


def _assert_assigned(db: Session, user: User, request: RecyclingRequest) -> OrganisationProfile:
    profile = _recycler_profile(db, user)
    if request.recycler_id != user.id:
        raise ForbiddenError("This recycling request is not assigned to your facility.")
    return profile


def list_requests(
    db: Session,
    user: User,
    *,
    status: str | None = None,
    waste_category: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    stmt = select(RecyclingRequest)
    if user.role == UserRole.ADMIN:
        pass
    elif user.role in {UserRole.CITIZEN, UserRole.RESIDENT, UserRole.INDUSTRY}:
        stmt = stmt.where(RecyclingRequest.citizen_id == user.id)
    elif user.role == UserRole.RECYCLER:
        profile = get_organisation(db, user)
        categories = (profile.accepted_categories or []) if profile else []
        states = (profile.serviceable_states or []) if profile else []
        open_filter = RecyclingRequest.status == "REQUESTED"
        if categories:
            open_filter = open_filter & RecyclingRequest.waste_category.in_(categories)
        if states:
            open_filter = open_filter & RecyclingRequest.state.in_(states)
        stmt = stmt.where(
            or_(RecyclingRequest.recycler_id == user.id, open_filter)
        )
    else:
        raise ForbiddenError("You cannot access recycling requests.")
    if status:
        stmt = stmt.where(RecyclingRequest.status == status)
    if waste_category:
        stmt = stmt.where(RecyclingRequest.waste_category == waste_category)
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                RecyclingRequest.reference.ilike(pattern),
                RecyclingRequest.city.ilike(pattern),
                RecyclingRequest.address.ilike(pattern),
            )
        )
    stmt = stmt.order_by(RecyclingRequest.created_at.desc())
    result = paginate(stmt, db, page=page, page_size=page_size)
    result["items"] = [serialise(item) for item in result["items"]]
    return result


def accept_request(db: Session, user: User, request_id: int, note: str = "") -> dict[str, Any]:
    profile = _recycler_profile(db, user)
    request = get_request(db, user, request_id)
    if request.status != "REQUESTED":
        raise BadRequestError("Only new pickup requests can be accepted.")
    if request.recycler_id is not None and request.recycler_id != user.id:
        raise ForbiddenError("Another recycling centre has already accepted this request.")
    request.recycler_id = user.id
    request.organisation_id = profile.id
    request.status = "ACCEPTED"
    _add_event(db, request, user, "ACCEPTED", note or "Accepted by recycling centre.")
    notify(
        db,
        request.citizen_id,
        title="Recycling pickup accepted",
        message=f"{profile.name} accepted {request.reference}.",
        category="RECYCLING",
        link="/citizen/recycling-requests",
        entity_type="RECYCLING_REQUEST",
        entity_id=request.id,
    )
    record_audit(
        db,
        user,
        action="RECYCLING_REQUEST_ACCEPTED",
        module="recycling",
        entity_type="RECYCLING_REQUEST",
        entity_id=request.id,
        description=note,
        commit=False,
    )
    db.commit()
    db.refresh(request)
    return serialise(request, include_events=True)


def reject_request(db: Session, user: User, request_id: int, note: str = "") -> dict[str, Any]:
    _recycler_profile(db, user)
    request = get_request(db, user, request_id)
    if request.recycler_id != user.id:
        raise ForbiddenError("You can only reject requests assigned to your facility.")
    if request.status not in {"REQUESTED", "ACCEPTED"}:
        raise BadRequestError("This request can no longer be rejected.")
    request.status = "REJECTED"
    request.rejection_reason = note or "Declined by recycling centre."
    _add_event(db, request, user, "REJECTED", request.rejection_reason)
    notify(
        db,
        request.citizen_id,
        title="Recycling pickup declined",
        message=note or f"{request.reference} was declined.",
        category="RECYCLING",
        link="/citizen/recycling-requests",
        entity_type="RECYCLING_REQUEST",
        entity_id=request.id,
    )
    record_audit(
        db,
        user,
        action="RECYCLING_REQUEST_REJECTED",
        module="recycling",
        entity_type="RECYCLING_REQUEST",
        entity_id=request.id,
        description=note,
        commit=False,
    )
    db.commit()
    db.refresh(request)
    return serialise(request, include_events=True)


def schedule_pickup(
    db: Session, user: User, request_id: int, payload: PickupSchedule
) -> dict[str, Any]:
    _recycler_profile(db, user)
    request = get_request(db, user, request_id)
    _assert_assigned(db, user, request)
    if request.status != "ACCEPTED":
        raise BadRequestError("The request must be accepted before scheduling a pickup.")
    request.status = "PICKUP_SCHEDULED"
    request.scheduled_pickup_at = payload.scheduled_pickup_at
    request.assigned_personnel = payload.assigned_personnel
    _add_event(db, request, user, "PICKUP_SCHEDULED", payload.note or "Pickup scheduled.")
    notify(
        db,
        request.citizen_id,
        title="Recycling pickup scheduled",
        message=f"{request.reference} is scheduled for {payload.scheduled_pickup_at.isoformat()}.",
        category="RECYCLING",
        link="/citizen/recycling-requests",
        entity_type="RECYCLING_REQUEST",
        entity_id=request.id,
    )
    record_audit(
        db,
        user,
        action="RECYCLING_PICKUP_SCHEDULED",
        module="recycling",
        entity_type="RECYCLING_REQUEST",
        entity_id=request.id,
        description=payload.note,
        commit=False,
    )
    db.commit()
    db.refresh(request)
    return serialise(request, include_events=True)


def record_collection(
    db: Session, user: User, request_id: int, payload: CollectionUpdate
) -> dict[str, Any]:
    _recycler_profile(db, user)
    request = get_request(db, user, request_id)
    _assert_assigned(db, user, request)
    if request.status not in {"PICKUP_SCHEDULED", "COLLECTED"}:
        raise BadRequestError("The pickup must be scheduled before recording collection.")
    request.status = "COLLECTED"
    request.actual_weight_kg = payload.actual_weight_kg
    request.collected_at = utcnow()
    _add_event(
        db,
        request,
        user,
        "COLLECTED",
        payload.note or f"Collected {payload.actual_weight_kg:g} kg.",
    )
    notify(
        db,
        request.citizen_id,
        title="Recycling material collected",
        message=f"{request.actual_weight_kg:g} kg collected for {request.reference}.",
        category="RECYCLING",
        link="/citizen/recycling-requests",
        entity_type="RECYCLING_REQUEST",
        entity_id=request.id,
    )
    record_audit(
        db,
        user,
        action="RECYCLING_COLLECTED",
        module="recycling",
        entity_type="RECYCLING_REQUEST",
        entity_id=request.id,
        description=payload.note,
        commit=False,
    )
    db.commit()
    db.refresh(request)
    return serialise(request, include_events=True)


def record_processing(
    db: Session, user: User, request_id: int, payload: ProcessingUpdate
) -> dict[str, Any]:
    _recycler_profile(db, user)
    request = get_request(db, user, request_id)
    _assert_assigned(db, user, request)
    if request.status not in {"COLLECTED", "PROCESSING"}:
        raise BadRequestError("Material must be collected before processing.")
    request.status = "PROCESSING"
    request.processing_details = payload.processing_details
    if payload.recovered_materials:
        request.recovered_materials = payload.recovered_materials
    _add_event(db, request, user, "PROCESSING", payload.note or "Processing recorded.")
    record_audit(
        db,
        user,
        action="RECYCLING_PROCESSING_RECORDED",
        module="recycling",
        entity_type="RECYCLING_REQUEST",
        entity_id=request.id,
        description=payload.processing_details,
        commit=False,
    )
    db.commit()
    db.refresh(request)
    return serialise(request, include_events=True)


def complete_request(
    db: Session, user: User, request_id: int, note: str = ""
) -> dict[str, Any]:
    _recycler_profile(db, user)
    request = get_request(db, user, request_id)
    _assert_assigned(db, user, request)
    if request.status not in {"COLLECTED", "PROCESSING"}:
        raise BadRequestError("Material must be collected before completion.")
    request.status = "COMPLETED"
    request.completed_at = utcnow()
    request.certificate_code = f"CERT-{request.reference}"
    _add_event(db, request, user, "COMPLETED", note or "Processing completed.")
    notify(
        db,
        request.citizen_id,
        title="Recycling completed",
        message=f"Certificate {request.certificate_code} is available for {request.reference}.",
        category="RECYCLING",
        link="/citizen/recycling-requests",
        entity_type="RECYCLING_REQUEST",
        entity_id=request.id,
    )
    record_audit(
        db,
        user,
        action="RECYCLING_COMPLETED",
        module="recycling",
        entity_type="RECYCLING_REQUEST",
        entity_id=request.id,
        description=note or "Processing completed.",
        commit=False,
    )
    db.commit()
    db.refresh(request)
    return serialise(request, include_events=True)


def cancel_request(db: Session, user: User, request_id: int, note: str = "") -> dict[str, Any]:
    request = get_request(db, user, request_id)
    if request.citizen_id != user.id and user.role != UserRole.ADMIN:
        raise ForbiddenError("Only the request owner can cancel this request.")
    if request.status in {"COMPLETED", "CANCELLED", "REJECTED"}:
        raise BadRequestError("This request can no longer be cancelled.")
    request.status = "CANCELLED"
    request.cancellation_reason = note or "Cancelled by citizen."
    _add_event(db, request, user, "CANCELLED", request.cancellation_reason)
    if request.recycler_id:
        notify(
            db,
            request.recycler_id,
            title="Recycling request cancelled",
            message=f"{request.reference} was cancelled.",
            category="RECYCLING",
            link="/recycler/requests",
            entity_type="RECYCLING_REQUEST",
            entity_id=request.id,
        )
    record_audit(
        db,
        user,
        action="RECYCLING_REQUEST_CANCELLED",
        module="recycling",
        entity_type="RECYCLING_REQUEST",
        entity_id=request.id,
        description=note,
        commit=False,
    )
    db.commit()
    db.refresh(request)
    return serialise(request, include_events=True)


def recycler_analytics(db: Session, user: User) -> dict[str, Any]:
    if user.role == UserRole.RECYCLER:
        stmt = select(RecyclingRequest).where(RecyclingRequest.recycler_id == user.id)
    elif user.role == UserRole.ADMIN:
        stmt = select(RecyclingRequest)
    else:
        raise ForbiddenError("You cannot access recycler analytics.")
    requests = db.scalars(stmt).all()
    by_status: dict[str, int] = {}
    by_category: dict[str, dict[str, float]] = {}
    recovered_total = 0.0
    for request in requests:
        by_status[request.status] = by_status.get(request.status, 0) + 1
        bucket = by_category.setdefault(
            request.waste_category, {"requests": 0, "estimated_kg": 0.0, "collected_kg": 0.0}
        )
        bucket["requests"] += 1
        bucket["estimated_kg"] += request.estimated_weight_kg
        bucket["collected_kg"] += request.actual_weight_kg or 0
        for material in request.recovered_materials or []:
            try:
                recovered_total += float(material.get("quantity_kg") or 0)
            except (TypeError, ValueError):
                continue
    completed = [request for request in requests if request.status == "COMPLETED"]
    return {
        "requests": len(requests),
        "completed": len(completed),
        "by_status": by_status,
        "by_category": by_category,
        "estimated_weight_kg": round(sum(r.estimated_weight_kg for r in requests), 2),
        "collected_weight_kg": round(
            sum(r.actual_weight_kg or 0 for r in requests), 2
        ),
        "recovered_material_kg": round(recovered_total, 2),
        "certificates": sum(1 for request in completed if request.certificate_code),
    }


def recycled_category_options() -> list[dict[str, str]]:
    labels = {
        "LITHIUM_ION": "Lithium-ion batteries",
        "EV_BATTERY": "EV batteries",
        "SOLAR_PANEL": "Solar panels",
        "EWASTE": "Electronic waste",
        "LEAD_ACID": "Lead-acid batteries",
        "OTHER": "Other approved recyclable materials",
    }
    return [{"value": key, "label": value} for key, value in labels.items()]
