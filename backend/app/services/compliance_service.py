"""DISCOM / industry monthly RPO compliance workflow."""

from __future__ import annotations

from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.models.ecosystem import EnergyComplianceRecord
from app.models.user import User, UserRole
from app.schemas.ecosystem import ComplianceRecordCreate, ComplianceReview
from app.services.audit_service import record_audit
from app.services.ecosystem_common import (
    admin_ids,
    notify,
    paginate,
    require_organisation,
    user_brief,
    utcnow,
)

COMPLIANCE_TRANSITIONS = {
    "DRAFT": {"SUBMITTED"},
    "SUBMITTED": {"UNDER_REVIEW", "REVISION_REQUIRED", "REJECTED", "VERIFIED"},
    "UNDER_REVIEW": {"VERIFIED", "REJECTED", "REVISION_REQUIRED"},
    "REVISION_REQUIRED": {"SUBMITTED"},
    "REJECTED": {"SUBMITTED"},
    "VERIFIED": set(),
}

WRITE_ROLES = {UserRole.DISCOM, UserRole.INDUSTRY}


def calculate(
    obligated_energy_mwh: float,
    rpo_target_pct: float,
    solar_mwh: float,
    wind_mwh: float,
    hydro_mwh: float,
    other_mwh: float,
) -> dict[str, float]:
    required = obligated_energy_mwh * rpo_target_pct / 100
    actual = solar_mwh + wind_mwh + hydro_mwh + other_mwh
    compliance_pct = (actual / required * 100) if required > 0 else 0.0
    shortfall = max(0.0, required - actual)
    return {
        "required_mwh": round(required, 3),
        "actual_renewable_mwh": round(actual, 3),
        "compliance_pct": round(compliance_pct, 2),
        "shortfall_mwh": round(shortfall, 3),
    }


def serialise(record: EnergyComplianceRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "owner_id": record.owner_id,
        "owner": user_brief(record.owner) if hasattr(record, "owner") else None,
        "organisation_id": record.organisation_id,
        "entity_name": record.entity_name,
        "state": record.state,
        "period_year": record.period_year,
        "period_month": record.period_month,
        "obligated_energy_mwh": record.obligated_energy_mwh,
        "solar_mwh": record.solar_mwh,
        "wind_mwh": record.wind_mwh,
        "hydro_mwh": record.hydro_mwh,
        "other_mwh": record.other_mwh,
        "rpo_target_pct": record.rpo_target_pct,
        "required_mwh": record.required_mwh,
        "actual_renewable_mwh": record.actual_renewable_mwh,
        "compliance_pct": record.compliance_pct,
        "shortfall_mwh": record.shortfall_mwh,
        "status": record.status,
        "notes": record.notes,
        "submitted_at": record.submitted_at.isoformat() if record.submitted_at else None,
        "reviewed_at": record.reviewed_at.isoformat() if record.reviewed_at else None,
        "review_note": record.review_note,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "updated_at": record.updated_at.isoformat() if record.updated_at else None,
    }


def create_record(
    db: Session, user: User, payload: ComplianceRecordCreate
) -> dict[str, Any]:
    if user.role not in WRITE_ROLES:
        raise ForbiddenError("Only DISCOM and industry accounts can file RPO compliance.")
    profile = require_organisation(db, user, require_verified=True)
    existing = db.scalar(
        select(EnergyComplianceRecord).where(
            EnergyComplianceRecord.owner_id == user.id,
            EnergyComplianceRecord.period_year == payload.period_year,
            EnergyComplianceRecord.period_month == payload.period_month,
        )
    )
    if existing is not None:
        raise ConflictError("A compliance record already exists for this month.")
    totals = calculate(
        payload.obligated_energy_mwh,
        payload.rpo_target_pct,
        payload.solar_mwh,
        payload.wind_mwh,
        payload.hydro_mwh,
        payload.other_mwh,
    )
    record = EnergyComplianceRecord(
        owner_id=user.id,
        organisation_id=profile.id,
        entity_name=payload.entity_name,
        state=payload.state,
        period_year=payload.period_year,
        period_month=payload.period_month,
        obligated_energy_mwh=payload.obligated_energy_mwh,
        solar_mwh=payload.solar_mwh,
        wind_mwh=payload.wind_mwh,
        hydro_mwh=payload.hydro_mwh,
        other_mwh=payload.other_mwh,
        rpo_target_pct=payload.rpo_target_pct,
        notes=payload.notes,
        status="DRAFT",
        **totals,
    )
    db.add(record)
    record_audit(
        db,
        user,
        action="COMPLIANCE_RECORD_CREATED",
        module="compliance",
        entity_type="COMPLIANCE",
        entity_id=None,
        description=f"Compliance draft for {payload.period_month}/{payload.period_year}.",
        commit=False,
    )
    db.commit()
    db.refresh(record)
    return serialise(record)


def _load(db: Session, record_id: int) -> EnergyComplianceRecord:
    record = db.get(EnergyComplianceRecord, record_id)
    if record is None:
        raise NotFoundError("Compliance record was not found.")
    return record


def _can_write(user: User, record: EnergyComplianceRecord) -> bool:
    if user.role == UserRole.ADMIN:
        return True
    return record.owner_id == user.id and user.role in WRITE_ROLES


def update_record(
    db: Session, user: User, record_id: int, payload: ComplianceRecordCreate
) -> dict[str, Any]:
    record = _load(db, record_id)
    if not _can_write(user, record):
        raise ForbiddenError("You cannot edit this compliance record.")
    if record.status not in {"DRAFT", "REVISION_REQUIRED", "REJECTED"}:
        raise BadRequestError("Only draft or returned filings can be edited.")
    totals = calculate(
        payload.obligated_energy_mwh,
        payload.rpo_target_pct,
        payload.solar_mwh,
        payload.wind_mwh,
        payload.hydro_mwh,
        payload.other_mwh,
    )
    record.entity_name = payload.entity_name
    record.state = payload.state
    record.period_year = payload.period_year
    record.period_month = payload.period_month
    record.obligated_energy_mwh = payload.obligated_energy_mwh
    record.solar_mwh = payload.solar_mwh
    record.wind_mwh = payload.wind_mwh
    record.hydro_mwh = payload.hydro_mwh
    record.other_mwh = payload.other_mwh
    record.rpo_target_pct = payload.rpo_target_pct
    record.notes = payload.notes
    for key, value in totals.items():
        setattr(record, key, value)
    record_audit(
        db,
        user,
        action="COMPLIANCE_RECORD_UPDATED",
        module="compliance",
        entity_type="COMPLIANCE",
        entity_id=record.id,
        description="Compliance draft updated.",
        commit=False,
    )
    db.commit()
    db.refresh(record)
    return serialise(record)


def submit_record(db: Session, user: User, record_id: int) -> dict[str, Any]:
    record = _load(db, record_id)
    if not _can_write(user, record):
        raise ForbiddenError("You cannot submit this compliance record.")
    if record.status not in {"DRAFT", "REVISION_REQUIRED", "REJECTED"}:
        raise BadRequestError("This record has already been submitted.")
    record.status = "SUBMITTED"
    record.submitted_at = utcnow()
    for admin_id in admin_ids(db):
        notify(
            db,
            admin_id,
            title="RPO compliance submitted",
            message=f"{record.entity_name} submitted {record.period_month}/{record.period_year}.",
            category="SYSTEM",
            link="/admin/ecosystem",
            entity_type="COMPLIANCE",
            entity_id=record.id,
        )
    record_audit(
        db,
        user,
        action="COMPLIANCE_SUBMITTED",
        module="compliance",
        entity_type="COMPLIANCE",
        entity_id=record.id,
        description="Compliance record submitted for verification.",
        commit=False,
    )
    db.commit()
    db.refresh(record)
    return serialise(record)


def review_record(
    db: Session, user: User, record_id: int, payload: ComplianceReview
) -> dict[str, Any]:
    if user.role != UserRole.ADMIN:
        raise ForbiddenError("Only administrators can review compliance filings.")
    record = _load(db, record_id)
    if payload.status not in {"UNDER_REVIEW", "VERIFIED", "REJECTED", "REVISION_REQUIRED"}:
        raise BadRequestError("Invalid review decision.")
    if record.status not in {"SUBMITTED", "UNDER_REVIEW"}:
        raise BadRequestError("This record is not awaiting review.")
    if payload.status == "VERIFIED":
        allowed = record.status in {"SUBMITTED", "UNDER_REVIEW"}
    else:
        allowed = True
    if not allowed:
        raise BadRequestError("Invalid status transition.")
    record.status = payload.status
    record.review_note = payload.note
    record.reviewed_by_id = user.id
    record.reviewed_at = utcnow()
    title = "RPO compliance decision"
    notify(
        db,
        record.owner_id,
        title=title,
        message=f"{record.entity_name} {record.period_month}/{record.period_year}: {payload.status}.",
        category="SYSTEM",
        link="/discom/compliance",
        entity_type="COMPLIANCE",
        entity_id=record.id,
    )
    record_audit(
        db,
        user,
        action="COMPLIANCE_REVIEWED",
        module="compliance",
        entity_type="COMPLIANCE",
        entity_id=record.id,
        description=f"Decision {payload.status}.",
        commit=False,
    )
    db.commit()
    db.refresh(record)
    return serialise(record)


def list_records(
    db: Session,
    user: User,
    *,
    status: str | None = None,
    year: int | None = None,
    month: int | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    stmt = select(EnergyComplianceRecord)
    if user.role in WRITE_ROLES:
        stmt = stmt.where(EnergyComplianceRecord.owner_id == user.id)
    elif user.role == UserRole.ADMIN:
        pass
    elif user.role == UserRole.POLICYMAKER:
        stmt = stmt.where(EnergyComplianceRecord.status == "VERIFIED")
    else:
        raise ForbiddenError("You cannot access compliance records.")
    if status:
        stmt = stmt.where(EnergyComplianceRecord.status == status)
    if year:
        stmt = stmt.where(EnergyComplianceRecord.period_year == year)
    if month:
        stmt = stmt.where(EnergyComplianceRecord.period_month == month)
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                EnergyComplianceRecord.entity_name.ilike(pattern),
                EnergyComplianceRecord.state.ilike(pattern),
            )
        )
    stmt = stmt.order_by(
        EnergyComplianceRecord.period_year.desc(),
        EnergyComplianceRecord.period_month.desc(),
        EnergyComplianceRecord.created_at.desc(),
    )
    result = paginate(stmt, db, page=page, page_size=page_size)
    result["items"] = [serialise(item) for item in result["items"]]
    return result


def summary(db: Session, user: User) -> dict[str, Any]:
    stmt = select(EnergyComplianceRecord)
    if user.role in WRITE_ROLES:
        stmt = stmt.where(EnergyComplianceRecord.owner_id == user.id)
    elif user.role == UserRole.POLICYMAKER:
        stmt = stmt.where(EnergyComplianceRecord.status == "VERIFIED")
    elif user.role != UserRole.ADMIN:
        raise ForbiddenError("You cannot access compliance records.")
    records = db.scalars(
        stmt.order_by(
            EnergyComplianceRecord.period_year.asc(),
            EnergyComplianceRecord.period_month.asc(),
        )
    ).all()
    by_period: dict[str, dict[str, Any]] = {}
    by_status: dict[str, int] = {}
    for record in records:
        key = f"{record.period_year}-{record.period_month:02d}"
        bucket = by_period.setdefault(
            key,
            {
                "period": key,
                "obligated_mwh": 0.0,
                "actual_mwh": 0.0,
                "required_mwh": 0.0,
                "shortfall_mwh": 0.0,
            },
        )
        bucket["obligated_mwh"] += record.obligated_energy_mwh
        bucket["actual_mwh"] += record.actual_renewable_mwh
        bucket["required_mwh"] += record.required_mwh
        bucket["shortfall_mwh"] += record.shortfall_mwh
        by_status[record.status] = by_status.get(record.status, 0) + 1
    totals = {
        "records": len(records),
        "obligated_mwh": round(sum(r.obligated_energy_mwh for r in records), 2),
        "actual_mwh": round(sum(r.actual_renewable_mwh for r in records), 2),
        "required_mwh": round(sum(r.required_mwh for r in records), 2),
        "shortfall_mwh": round(sum(r.shortfall_mwh for r in records), 2),
    }
    totals["compliance_pct"] = (
        round(totals["actual_mwh"] / totals["required_mwh"] * 100, 2)
        if totals["required_mwh"]
        else 0.0
    )
    return {
        "totals": totals,
        "by_status": by_status,
        "trend": list(by_period.values()),
        "latest": serialise(records[-1]) if records else None,
        "note": (
            "Figures are calculated from platform compliance filings. "
            "They are workflow records, not an official regulatory certificate."
        ),
    }
