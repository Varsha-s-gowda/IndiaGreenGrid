"""Circular economy tracker: solar panel, e-waste and battery recycling (D6)."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import distinct, func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.models.green_grid import Recycler, RecyclingEvent, RecyclingTransaction
from app.models.user import User, UserRole
from app.services.audit_service import record_audit
from app.services.ecosystem_analytics import recycling_recovery

WASTE_CATEGORIES = [
    "SOLAR_PANEL",
    "EWASTE",
    "EV_BATTERY",
    "LITHIUM_ION",
    "LEAD_ACID",
    "IT_EQUIPMENT",
    "CABLES",
    "GLASS",
    "ALUMINIUM",
]
TRANSACTION_STATUSES = [
    "LOGGED",
    "SCHEDULED",
    "IN_TRANSIT",
    "RECYCLED",
    "CANCELLED",
]


def _serialise_recycler(recycler: Recycler) -> dict[str, Any]:
    return {
        "id": recycler.id,
        "name": recycler.name,
        "city": recycler.city,
        "state": recycler.state,
        "address": recycler.address,
        "accepted_categories": recycler.accepted_categories or [],
        "capacity_tonnes_per_month": recycler.capacity_tonnes_per_month,
        "certification": recycler.certification,
        "contact_email": recycler.contact_email,
        "contact_phone": recycler.contact_phone,
        "is_verified": recycler.is_verified,
        "is_sample": recycler.is_sample,
    }


def _serialise_event(event: RecyclingEvent) -> dict[str, Any]:
    return {
        "id": event.id,
        "status": event.status,
        "note": event.note,
        "actor_id": event.actor_id,
        "actor_role": event.actor_role,
        "created_at": event.created_at,
    }


def _record_event(
    db: Session,
    transaction: RecyclingTransaction,
    user: User,
    status: str,
    note: str = "",
) -> RecyclingEvent:
    event = RecyclingEvent(
        transaction_id=transaction.id,
        status=status,
        note=note,
        actor_id=user.id,
        actor_role=user.role.value,
        created_at=datetime.now(timezone.utc),
    )
    db.add(event)
    return event


def _serialise_transaction(tx: RecyclingTransaction) -> dict[str, Any]:
    return {
        "id": tx.id,
        "user_id": tx.user_id,
        "recycler_id": tx.recycler_id,
        "recycler_name": tx.recycler.name if tx.recycler else None,
        "recycler_city": tx.recycler.city if tx.recycler else None,
        "recycler_verified": bool(tx.recycler.is_verified) if tx.recycler else False,
        "waste_category": tx.waste_category,
        "quantity_kg": tx.quantity_kg,
        "material_recovered_kg": tx.material_recovered_kg,
        "recovery_rate_pct": (
            round(tx.material_recovered_kg / tx.quantity_kg * 100, 2)
            if tx.quantity_kg
            else 0.0
        ),
        "status": tx.status,
        "verification_status": tx.verification_status,
        "is_verified": tx.verification_status == "VERIFIED",
        "pickup_date": tx.pickup_date,
        "completed_at": tx.completed_at,
        "traceability_code": tx.traceability_code,
        "notes": tx.notes,
        "is_sample": tx.verification_status == "SAMPLE",
        "created_at": tx.created_at,
        "updated_at": tx.updated_at,
    }


def list_recyclers(
    db: Session,
    *,
    search: str | None = None,
    state: str | None = None,
    category: str | None = None,
) -> dict[str, Any]:
    filters = []
    if search:
        pattern = f"%{search.strip()}%"
        filters.append(
            or_(
                Recycler.name.ilike(pattern),
                Recycler.city.ilike(pattern),
                Recycler.certification.ilike(pattern),
            )
        )
    if state and state != "All":
        filters.append(Recycler.state == state)
    recyclers = db.scalars(
        select(Recycler).where(*filters).order_by(Recycler.state, Recycler.city)
    ).all()
    if category and category != "All":
        recyclers = [
            recycler
            for recycler in recyclers
            if category in (recycler.accepted_categories or [])
        ]
    states = sorted(
        db.scalars(select(distinct(Recycler.state))).all()
    )
    verified_count = sum(1 for recycler in recyclers if recycler.is_verified)
    return {
        "items": [_serialise_recycler(recycler) for recycler in recyclers],
        "total": len(recyclers),
        "facets": {"states": states, "categories": WASTE_CATEGORIES},
        "verification_summary": {
            "verified": verified_count,
            "unverified": len(recyclers) - verified_count,
        },
        "is_sample": all(recycler.is_sample for recycler in recyclers)
        if recyclers
        else True,
        "disclaimer": (
            "Recyclers marked verified have platform verification on record. "
            "Sample entries are demonstration data. Confirm CPCB/state "
            "authorisation and certification directly with the recycler before "
            "handover."
        ),
    }


def list_transactions(
    db: Session,
    user: User,
    *,
    status: str | None = None,
    waste_category: str | None = None,
    verification_status: str | None = None,
    limit: int = 100,
) -> dict[str, Any]:
    filters = []
    if user.role != UserRole.ADMIN:
        filters.append(RecyclingTransaction.user_id == user.id)
    if status and status != "All":
        filters.append(RecyclingTransaction.status == status)
    if waste_category and waste_category != "All":
        filters.append(RecyclingTransaction.waste_category == waste_category)
    if verification_status and verification_status != "All":
        filters.append(
            RecyclingTransaction.verification_status == verification_status
        )
    transactions = db.scalars(
        select(RecyclingTransaction)
        .where(*filters)
        .order_by(RecyclingTransaction.created_at.desc())
        .limit(limit)
    ).all()
    return {
        "items": [_serialise_transaction(tx) for tx in transactions],
        "total": len(transactions),
        "statuses": TRANSACTION_STATUSES,
        "categories": WASTE_CATEGORIES,
        "verification_statuses": ["VERIFIED", "SAMPLE", "REJECTED"],
        "is_scoped": user.role != UserRole.ADMIN,
    }


def summary(db: Session, user: User) -> dict[str, Any]:
    if user.role == UserRole.ADMIN:
        filters = []
    else:
        filters = [RecyclingTransaction.user_id == user.id]
    transactions = db.scalars(select(RecyclingTransaction).where(*filters)).all()
    recycler_count = db.scalar(select(func.count(Recycler.id))) or 0

    by_category: dict[str, dict[str, float]] = {
        category: {"quantity_kg": 0.0, "transactions": 0} for category in WASTE_CATEGORIES
    }
    by_status: dict[str, dict[str, float]] = {
        status: {"quantity_kg": 0.0, "transactions": 0}
        for status in TRANSACTION_STATUSES
    }
    for tx in transactions:
        bucket = by_category.setdefault(
            tx.waste_category, {"quantity_kg": 0.0, "transactions": 0}
        )
        bucket["quantity_kg"] += tx.quantity_kg
        bucket["transactions"] += 1
        status_bucket = by_status.setdefault(
            tx.status, {"quantity_kg": 0.0, "transactions": 0}
        )
        status_bucket["quantity_kg"] += tx.quantity_kg
        status_bucket["transactions"] += 1

    recycled_kg = sum(
        tx.quantity_kg for tx in transactions if tx.status == "RECYCLED"
    )
    total_kg = sum(tx.quantity_kg for tx in transactions)
    actual_recovered_kg = sum(
        tx.material_recovered_kg or 0 for tx in transactions
    )
    verified_count = sum(
        1 for tx in transactions if tx.verification_status == "VERIFIED"
    )
    sample_count = sum(1 for tx in transactions if tx.verification_status == "SAMPLE")
    verified_kg = sum(
        tx.quantity_kg
        for tx in transactions
        if tx.verification_status == "VERIFIED"
    )
    return {
        "totals": {
            "total_quantity_kg": round(total_kg, 2),
            "recycled_quantity_kg": round(recycled_kg, 2),
            "in_progress_quantity_kg": round(
                sum(
                    tx.quantity_kg
                    for tx in transactions
                    if tx.status in {"SCHEDULED", "IN_TRANSIT", "LOGGED"}
                ),
                2,
            ),
            "transaction_count": len(transactions),
            "recycler_count": recycler_count,
            "recycling_rate_pct": round(recycled_kg / total_kg * 100, 2)
            if total_kg
            else 0.0,
            "recorded_material_recovery_kg": round(actual_recovered_kg, 2),
            "estimated_material_recovery_kg": round(recycled_kg * 0.75, 2),
            "estimated_co2_saved_kg": round(recycled_kg * 1.5, 2),
            "verified_transactions": verified_count,
            "sample_transactions": sample_count,
            "verified_quantity_kg": round(verified_kg, 2),
        },
        "by_category": [
            {"category": category, **values}
            for category, values in sorted(by_category.items())
        ],
        "by_status": [
            {"status": status, **values}
            for status, values in sorted(by_status.items())
        ],
        "is_scoped": user.role != UserRole.ADMIN,
        "ecosystem_recycling": recycling_recovery(db),
        "note": (
            "Recorded material recovery comes from verified admin entries. "
            "Where no recovery figure is recorded, a 75% planning yield is "
            "applied and labelled as an estimate. Neither is an audited "
            "recycling yield."
        ),
        "generated_at": datetime.now(timezone.utc),
    }


def create_transaction(
    db: Session, user: User, payload: dict[str, Any]
) -> dict[str, Any]:
    recycler = db.get(Recycler, int(payload["recycler_id"]))
    if recycler is None:
        raise NotFoundError("Recycler not found.")
    category = str(payload["waste_category"]).upper()
    if category not in WASTE_CATEGORIES:
        raise BadRequestError("Unsupported waste category.")
    if category not in (recycler.accepted_categories or []):
        raise BadRequestError(
            "The selected recycler does not accept this waste category.",
            details={"accepted_categories": recycler.accepted_categories},
        )
    quantity = float(payload["quantity_kg"])
    if quantity <= 0:
        raise BadRequestError("Quantity must be greater than zero.")

    status = str(payload.get("status", "LOGGED")).upper()
    if status not in TRANSACTION_STATUSES:
        raise BadRequestError("Unsupported transaction status.")
    pickup = payload.get("pickup_date")
    if isinstance(pickup, str) and pickup:
        pickup = date.fromisoformat(pickup)

    reference = f"IGG-{datetime.now(timezone.utc):%Y%m}-{uuid.uuid4().hex[:8].upper()}"
    transaction = RecyclingTransaction(
        user_id=user.id,
        recycler_id=recycler.id,
        waste_category=category,
        quantity_kg=quantity,
        status=status,
        pickup_date=pickup,
        traceability_code=reference,
        notes=payload.get("notes", ""),
        is_sample=True,
    )
    db.add(transaction)
    db.flush()
    _record_event(
        db,
        transaction,
        user,
        status,
        note=f"Transaction logged with traceability code {reference}.",
    )
    db.commit()
    db.refresh(transaction)
    record_audit(
        db,
        user,
        action="recycling_transaction_created",
        module="circular",
        entity_type="RecyclingTransaction",
        entity_id=transaction.id,
        description=(
            f"Logged {quantity} kg of {category} with {recycler.name} "
            f"({reference})."
        ),
    )
    return _serialise_transaction(transaction)


def get_transaction(db: Session, user: User, transaction_id: int) -> dict[str, Any]:
    transaction = db.get(RecyclingTransaction, transaction_id)
    if transaction is None:
        raise NotFoundError("Recycling transaction not found.")
    if user.role != UserRole.ADMIN and transaction.user_id != user.id:
        raise ForbiddenError("You do not have access to this transaction.")
    events = db.scalars(
        select(RecyclingEvent)
        .where(RecyclingEvent.transaction_id == transaction.id)
        .order_by(RecyclingEvent.created_at.asc(), RecyclingEvent.id.asc())
    ).all()
    return {
        **_serialise_transaction(transaction),
        "events": [_serialise_event(event) for event in events],
        "traceability_note": (
            "Every status transition is appended to this trail. Recycled "
            "material recovery is only shown as verified when an administrator "
            "confirms the recovery weight."
        ),
    }


def update_transaction(
    db: Session, user: User, transaction_id: int, payload: dict[str, Any]
) -> dict[str, Any]:
    transaction = db.get(RecyclingTransaction, transaction_id)
    if transaction is None:
        raise NotFoundError("Recycling transaction not found.")
    is_admin = user.role == UserRole.ADMIN
    if not is_admin and transaction.user_id != user.id:
        raise ForbiddenError("You do not have access to this transaction.")
    new_status = payload.get("status")
    if new_status is not None:
        new_status = str(new_status).upper()
        if new_status not in TRANSACTION_STATUSES:
            raise BadRequestError("Unsupported transaction status.")
        if not is_admin and new_status != "CANCELLED":
            raise ForbiddenError(
                "Only an administrator can advance recycling status. "
                "You may cancel your own logged transaction."
            )
        if new_status != transaction.status:
            previous = transaction.status
            transaction.status = new_status
            if new_status == "RECYCLED":
                transaction.completed_at = datetime.now(timezone.utc)
            _record_event(
                db,
                transaction,
                user,
                new_status,
                note=payload.get("event_note", "")
                or f"Status changed from {previous} to {new_status}.",
            )
    if "notes" in payload and payload["notes"] is not None:
        transaction.notes = payload["notes"]
    if "pickup_date" in payload and payload["pickup_date"] is not None:
        pickup = payload["pickup_date"]
        transaction.pickup_date = (
            date.fromisoformat(pickup) if isinstance(pickup, str) else pickup
        )
    if "material_recovered_kg" in payload and payload["material_recovered_kg"] is not None:
        if not is_admin:
            raise ForbiddenError(
                "Only an administrator can record verified material recovery."
            )
        recovered = float(payload["material_recovered_kg"])
        if recovered > transaction.quantity_kg:
            raise BadRequestError(
                "Recovered material cannot exceed the logged quantity.",
                details={"quantity_kg": transaction.quantity_kg},
            )
        transaction.material_recovered_kg = recovered
    if "verification_status" in payload and payload["verification_status"] is not None:
        if not is_admin:
            raise ForbiddenError(
                "Only an administrator can verify a recycling transaction."
            )
        status = str(payload["verification_status"]).upper()
        if status not in {"VERIFIED", "SAMPLE", "REJECTED"}:
            raise BadRequestError("Unsupported verification status.")
        transaction.verification_status = status
    db.commit()
    db.refresh(transaction)
    record_audit(
        db,
        user,
        action="recycling_transaction_updated",
        module="circular",
        entity_type="RecyclingTransaction",
        entity_id=transaction.id,
        description=f"Updated recycling transaction {transaction.traceability_code}.",
        details={"status": transaction.status},
    )
    return _serialise_transaction(transaction)


def create_recycler(db: Session, user: User, payload: dict[str, Any]) -> dict[str, Any]:
    recycler = Recycler(
        name=payload["name"].strip(),
        city=payload["city"].strip(),
        state=payload["state"].strip(),
        address=payload.get("address", ""),
        accepted_categories=payload.get("accepted_categories") or [],
        capacity_tonnes_per_month=payload.get("capacity_tonnes_per_month"),
        certification=payload.get("certification", ""),
        contact_email=payload.get("contact_email"),
        contact_phone=payload.get("contact_phone"),
        is_verified=bool(payload.get("is_verified", False)),
        is_sample=True,
    )
    db.add(recycler)
    db.commit()
    db.refresh(recycler)
    record_audit(
        db,
        user,
        action="recycler_created",
        module="circular",
        entity_type="Recycler",
        entity_id=recycler.id,
        description=f"Added recycler '{recycler.name}' ({recycler.city}).",
    )
    return _serialise_recycler(recycler)


def update_recycler(
    db: Session, user: User, recycler_id: int, payload: dict[str, Any]
) -> dict[str, Any]:
    recycler = db.get(Recycler, recycler_id)
    if recycler is None:
        raise NotFoundError("Recycler not found.")
    for field in (
        "name",
        "city",
        "state",
        "address",
        "certification",
        "contact_email",
        "contact_phone",
    ):
        if field in payload and payload[field] is not None:
            setattr(recycler, field, payload[field])
    if "accepted_categories" in payload and payload["accepted_categories"] is not None:
        recycler.accepted_categories = payload["accepted_categories"]
    if "capacity_tonnes_per_month" in payload:
        recycler.capacity_tonnes_per_month = payload["capacity_tonnes_per_month"]
    if "is_verified" in payload:
        recycler.is_verified = bool(payload["is_verified"])
    db.commit()
    db.refresh(recycler)
    record_audit(
        db,
        user,
        action="recycler_updated",
        module="circular",
        entity_type="Recycler",
        entity_id=recycler.id,
        description=f"Updated recycler '{recycler.name}'.",
    )
    return _serialise_recycler(recycler)
