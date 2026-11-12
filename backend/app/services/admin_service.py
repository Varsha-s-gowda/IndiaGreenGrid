"""Administrator portal aggregation and user management (D9 admin)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.models.allocation import AllocationRun
from app.models.apartment import Apartment
from app.models.billing import Bill
from app.models.green_grid import (
    AuditLog,
    FinanceScheme,
    GreenJob,
    JobApplication,
    Recycler,
    RecyclingTransaction,
    RpoTarget,
    SolarCalculation,
    StateEnergyStatistic,
    IngestionRun,
)
from app.models.simulation_run import SimulationRun
from app.models.user import User, UserRole
from app.services.audit_service import record_audit
from app.services.ecosystem_analytics import snapshot as ecosystem_snapshot
from app.services.ingestion.service import data_freshness_snapshot


def _user_dict(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "organization": user.organization,
        "state": user.state,
        "is_active": user.is_active,
        "verification_status": user.verification_status,
        "verification_note": user.verification_note,
        "verified_at": user.verified_at,
        "verified_by_id": user.verified_by_id,
        "last_login_at": user.last_login_at,
        "created_at": user.created_at,
    }


def list_users(
    db: Session,
    *,
    search: str | None = None,
    role: str | None = None,
    is_active: bool | None = None,
    verification_status: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    filters = []
    if search:
        pattern = f"%{search.strip()}%"
        filters.append(
            or_(
                User.name.ilike(pattern),
                User.email.ilike(pattern),
                User.organization.ilike(pattern),
            )
        )
    if role and role != "All":
        filters.append(User.role == UserRole(role))
    if is_active is not None:
        filters.append(User.is_active.is_(is_active))
    if verification_status and verification_status != "All":
        filters.append(User.verification_status == verification_status)
    total = db.scalar(select(func.count(User.id)).where(*filters)) or 0
    users = db.scalars(
        select(User)
        .where(*filters)
        .order_by(User.created_at.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    ).all()
    role_counts = dict(
        db.execute(select(User.role, func.count(User.id)).group_by(User.role)).all()
    )
    verification_counts = dict(
        db.execute(
            select(User.verification_status, func.count(User.id)).group_by(
                User.verification_status
            )
        ).all()
    )
    return {
        "items": [_user_dict(user) for user in users],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
        "role_counts": {role.value: role_counts.get(role, 0) for role in UserRole},
        "roles": [role.value for role in UserRole],
        "verification_counts": {
            "VERIFIED": verification_counts.get("VERIFIED", 0),
            "PENDING": verification_counts.get("PENDING", 0),
            "REJECTED": verification_counts.get("REJECTED", 0),
        },
        "verification_statuses": ["VERIFIED", "PENDING", "REJECTED"],
    }


def pending_approvals(db: Session, limit: int = 50) -> dict[str, Any]:
    users = db.scalars(
        select(User)
        .where(User.verification_status == "PENDING")
        .order_by(User.created_at.asc())
        .limit(limit)
    ).all()
    return {
        "items": [_user_dict(user) for user in users],
        "total": len(users),
        "note": (
            "Organisational accounts can read national modules while pending. "
            "Entity-scoped writes unlock once an administrator verifies them."
        ),
    }


def update_user(
    db: Session, admin: User, user_id: int, payload: dict[str, Any]
) -> dict[str, Any]:
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found.")
    if user.id == admin.id:
        if payload.get("is_active") is False:
            raise BadRequestError("You cannot deactivate your own account.")
        if payload.get("role") and payload["role"] != UserRole.ADMIN.value:
            raise ForbiddenError("You cannot remove your own administrator role.")
    if "role" in payload and payload["role"] is not None:
        try:
            user.role = UserRole(str(payload["role"]).upper())
        except ValueError as exc:
            raise BadRequestError("Unsupported role.") from exc
    if "is_active" in payload and payload["is_active"] is not None:
        user.is_active = bool(payload["is_active"])
    for field in ("name", "organization", "state"):
        if field in payload and payload[field] is not None:
            setattr(user, field, str(payload[field]).strip())
    verification_changed = False
    if payload.get("verification_status") is not None:
        status = str(payload["verification_status"]).upper()
        if status not in {"VERIFIED", "PENDING", "REJECTED"}:
            raise BadRequestError("Unsupported verification status.")
        user.verification_status = status
        user.verified_at = (
            datetime.now(timezone.utc) if status == "VERIFIED" else None
        )
        user.verified_by_id = admin.id if status == "VERIFIED" else None
        verification_changed = True
    if payload.get("verification_note") is not None:
        user.verification_note = str(payload["verification_note"]).strip()
        verification_changed = True
    db.commit()
    db.refresh(user)
    record_audit(
        db,
        admin,
        action=(
            "user_verification_updated" if verification_changed else "user_updated"
        ),
        module="admin",
        entity_type="User",
        entity_id=user.id,
        description=(
            f"Verification status for {user.email} set to "
            f"{user.verification_status}."
            if verification_changed
            else f"Updated account {user.email} (role={user.role.value})."
        ),
        details={
            "is_active": user.is_active,
            "role": user.role.value,
            "verification_status": user.verification_status,
        },
    )
    return _user_dict(user)


def recent_activity(
    db: Session,
    limit: int = 12,
    *,
    actor: User | None = None,
) -> list[dict[str, Any]]:
    statement = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    if actor is not None and actor.role != UserRole.ADMIN:
        statement = (
            select(AuditLog)
            .where(AuditLog.user_id == actor.id)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        )
    entries = db.scalars(statement).all()
    return [
        {
            "id": entry.id,
            "user_email": entry.user_email,
            "action": entry.action,
            "module": entry.module,
            "entity_type": entry.entity_type,
            "entity_id": entry.entity_id,
            "description": entry.description,
            "details": entry.details,
            "created_at": entry.created_at,
        }
        for entry in entries
    ]


def module_usage(db: Session, days: int = 30) -> list[dict[str, Any]]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = db.execute(
        select(AuditLog.module, func.count(AuditLog.id))
        .where(AuditLog.created_at >= since)
        .group_by(AuditLog.module)
        .order_by(func.count(AuditLog.id).desc())
    ).all()
    return [
        {"module": module, "events": count}
        for module, count in rows
    ]


def overview(db: Session) -> dict[str, Any]:
    role_counts = dict(
        db.execute(select(User.role, func.count(User.id)).group_by(User.role)).all()
    )
    freshness = data_freshness_snapshot(db)
    fresh = sum(1 for item in freshness if item["freshness"] == "fresh")
    stale = sum(1 for item in freshness if item["freshness"] == "stale")
    unavailable = sum(1 for item in freshness if item["status"] == "unavailable")
    status_counts = {
        label: sum(1 for item in freshness if item.get("dataset_status") == label)
        for label in ("LIVE", "SAMPLE", "ESTIMATED", "UNAVAILABLE", "STALE")
    }
    pending_users = (
        db.scalar(
            select(func.count(User.id)).where(User.verification_status == "PENDING")
        )
        or 0
    )
    recent_runs = db.scalars(
        select(IngestionRun)
        .order_by(IngestionRun.started_at.desc())
        .limit(10)
    ).all()

    total_bills = db.scalar(select(func.count(Bill.id))) or 0
    issued_bills = (
        db.scalar(select(func.count(Bill.id)).where(Bill.status == "ISSUED")) or 0
    )
    count = lambda model: db.scalar(select(func.count(model.id))) or 0

    return {
        "users": {
            "total": db.scalar(select(func.count(User.id))) or 0,
            "active": db.scalar(
                select(func.count(User.id)).where(User.is_active.is_(True))
            )
            or 0,
            "by_role": {
                role.value: role_counts.get(role, 0) for role in UserRole
            },
            "pending_verification": pending_users,
        },
        "content": {
            "jobs": count(GreenJob),
            "job_applications": count(JobApplication),
            "finance_schemes": count(FinanceScheme),
            "recyclers": count(Recycler),
            "recycling_transactions": count(RecyclingTransaction),
            "rpo_targets": count(RpoTarget),
            "solar_calculations": count(SolarCalculation),
        },
        "community_solar": {
            "apartments": count(Apartment),
            "simulation_runs": count(SimulationRun),
            "allocation_runs": count(AllocationRun),
            "bills": total_bills,
            "issued_bills": issued_bills,
        },
        "data": {
            "sources": len(freshness),
            "fresh": fresh,
            "stale": stale,
            "unavailable": unavailable,
            "status_counts": status_counts,
            "items": freshness,
        },
        "ingestion": {
            "runs_retained": db.scalar(select(func.count(IngestionRun.id))) or 0,
            "recent": [
                {
                    "id": run.id,
                    "source_code": run.source_code,
                    "status": run.status,
                    "dataset_status": run.dataset_status,
                    "records": run.records,
                    "trigger": run.trigger,
                    "started_at": run.started_at,
                    "duration_ms": run.duration_ms,
                }
                for run in recent_runs
            ],
        },
        "activity": {
            "recent": recent_activity(db, limit=10),
            "module_usage_30d": module_usage(db, days=30),
            "total_audit_events": count(AuditLog),
        },
        "ecosystem": ecosystem_snapshot(db),
        "regional_records": count(StateEnergyStatistic),
        "alerts": [
            {
                "type": "user_verification",
                "severity": "warning" if pending_users else "info",
                "message": (
                    f"{pending_users} organisational account(s) are awaiting "
                    "administrator verification."
                ),
            }
        ]
        + [
            {
                "type": "data_freshness",
                "severity": "warning",
                "message": f"{stale} data source(s) are older than their freshness window.",
            }
            for _ in ([1] if stale else [])
        ]
        + [
            {
                "type": "integration",
                "severity": "info",
                "message": (
                    f"{unavailable} external source(s) are not configured. "
                    "No data is fabricated for them."
                ),
            }
            for _ in ([1] if unavailable else [])
        ],
        "generated_at": datetime.now(timezone.utc),
    }


def activity_feed(db: Session, limit: int = 50) -> dict[str, Any]:
    entries = db.scalars(
        select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    ).all()
    return {
        "items": [
            {
                "id": entry.id,
                "user_email": entry.user_email,
                "action": entry.action,
                "module": entry.module,
                "entity_type": entry.entity_type,
                "entity_id": entry.entity_id,
                "description": entry.description,
                "details": entry.details,
                "created_at": entry.created_at,
            }
            for entry in entries
        ],
        "total": len(entries),
    }
