"""Renewable Purchase Obligation (RPO) tracking and compliance maths (D2)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.models.green_grid import (
    RpoComplianceRecord,
    RpoComplianceRevision,
    RpoTarget,
)
from app.models.user import User, UserRole
from app.services.audit_service import record_audit
from app.services.auth_service import organisation_verified

RPO_VIEW_ROLES = {
    UserRole.ADMIN,
    UserRole.DISCOM,
    UserRole.INDUSTRY,
    UserRole.POLICYMAKER,
}
RPO_WRITE_ROLES = {UserRole.ADMIN, UserRole.DISCOM, UserRole.INDUSTRY}
RPO_YEARS = list(range(2025, 2031))

RPO_REGULATORY_BASIS = {
    "framework": "Renewable Purchase Obligation (RPO) trajectory, 2025-2030",
    "issuing_authority": "Ministry of Power / State Electricity Regulatory Commissions",
    "source_name": "MoP RPO trajectory and SERCs",
    "source_url": "https://powermin.gov.in",
    "verification_status": "REFERENCE_ONLY",
    "trajectory_note": (
        "The yearly tracker visualises targets entered by the obligated entity. "
        "Default categories separate solar and non-solar obligations; state "
        "commissions may notify different minima, multipliers or banking rules."
    ),
    "assumptions": [
        "Obligated energy is the entity's annual electricity consumption/input "
        "for the compliance year, entered in MWh.",
        "Required renewable energy = obligated energy x combined RPO percentage.",
        "Compliance percentage = actual solar + non-solar procurement / required energy.",
        "A target at or above 100% is COMPLIANT; 90-99.99% is AT_RISK; below 90% is NON_COMPLIANT.",
        "Targets and compliance filings are self-reported planning records, not statutory filings.",
    ],
    "disclaimer": (
        "Verify the applicable SERC order, solar/non-solar split, banking and "
        "carry-forward rules before relying on any compliance conclusion."
    ),
}


def _require_verified_entity(user: User) -> None:
    if not organisation_verified(user):
        raise ForbiddenError(
            "Your organisational account is pending administrator verification. "
            "You can review national data, but RPO targets and compliance cannot "
            "be created or modified until approval.",
            details={"verification_status": user.verification_status},
        )


def _can_view_all(user: User) -> bool:
    return user.role in {UserRole.ADMIN, UserRole.POLICYMAKER}


def _scoped_targets(db: Session, user: User) -> list[RpoTarget]:
    statement = select(RpoTarget).order_by(
        RpoTarget.year.asc(), RpoTarget.entity_name.asc()
    )
    if not _can_view_all(user):
        statement = statement.where(RpoTarget.owner_id == user.id)
    return db.scalars(statement).all()


def _find_target(db: Session, user: User, target_id: int) -> RpoTarget:
    target = db.get(RpoTarget, target_id)
    if target is None:
        raise NotFoundError("RPO target not found.")
    if not _can_view_all(user) and target.owner_id != user.id:
        raise ForbiddenError("You do not have access to this RPO target.")
    return target


def _can_edit(user: User, target: RpoTarget) -> bool:
    return user.role == UserRole.ADMIN or target.owner_id == user.id


def _status(compliance_pct: float) -> str:
    if compliance_pct >= 100:
        return "COMPLIANT"
    if compliance_pct >= 90:
        return "AT_RISK"
    return "NON_COMPLIANT"


def _serialise_compliance(record: RpoComplianceRecord | None) -> dict[str, Any] | None:
    if record is None:
        return None
    return {
        "id": record.id,
        "year": record.year,
        "actual_solar_mwh": round(record.actual_solar_mwh, 2),
        "actual_non_solar_mwh": round(record.actual_non_solar_mwh, 2),
        "actual_total_mwh": round(record.actual_total_mwh, 2),
        "required_mwh": round(record.required_mwh, 2),
        "target_snapshot_pct": record.target_snapshot_pct,
        "compliance_pct": round(record.compliance_pct, 2),
        "shortfall_mwh": round(record.shortfall_mwh, 2),
        "surplus_mwh": round(record.surplus_mwh, 2),
        "status": record.status,
        "notes": record.notes,
        "recorded_at": record.recorded_at,
        "recorded_by": record.recorded_by,
    }


def _serialise_target(target: RpoTarget, compliances: list[RpoComplianceRecord]) -> dict[str, Any]:
    by_year = {record.year: record for record in compliances}
    latest = compliances[-1] if compliances else None
    required = round(
        target.obligated_energy_mwh * target.total_target_pct / 100, 2
    )
    return {
        "id": target.id,
        "owner_id": target.owner_id,
        "entity_type": target.entity_type,
        "entity_name": target.entity_name,
        "entity_code": target.entity_code,
        "state": target.state,
        "year": target.year,
        "obligated_energy_mwh": round(target.obligated_energy_mwh, 2),
        "solar_target_pct": target.solar_target_pct,
        "non_solar_target_pct": target.non_solar_target_pct,
        "total_target_pct": target.total_target_pct,
        "required_mwh": required,
        "notes": target.notes,
        "created_at": target.created_at,
        "updated_at": target.updated_at,
        "latest_compliance": _serialise_compliance(latest),
        "compliance_by_year": {
            str(year): _serialise_compliance(record)
            for year, record in sorted(by_year.items())
        },
    }


def list_targets(db: Session, user: User) -> dict[str, Any]:
    targets = _scoped_targets(db, user)
    target_ids = [target.id for target in targets]
    records = (
        db.scalars(
            select(RpoComplianceRecord)
            .where(RpoComplianceRecord.target_id.in_(target_ids))
            .order_by(RpoComplianceRecord.year)
        ).all()
        if target_ids
        else []
    )
    grouped: dict[int, list[RpoComplianceRecord]] = {}
    for record in records:
        grouped.setdefault(record.target_id, []).append(record)
    return {
        "items": [
            _serialise_target(target, grouped.get(target.id, [])) for target in targets
        ],
        "total": len(targets),
        "can_manage": user.role in RPO_WRITE_ROLES and organisation_verified(user),
        "is_scoped": not _can_view_all(user),
    }


def create_target(db: Session, user: User, payload: dict[str, Any]) -> dict[str, Any]:
    if user.role not in RPO_WRITE_ROLES:
        raise ForbiddenError("Your role cannot create RPO targets.")
    _require_verified_entity(user)
    year = int(payload["year"])
    if year not in RPO_YEARS:
        raise BadRequestError("RPO tracking is supported for 2025-2030 only.")
    solar = float(payload["solar_target_pct"])
    non_solar = float(payload["non_solar_target_pct"])
    total = round(solar + non_solar, 2)
    if total > 100:
        raise BadRequestError("Combined solar and non-solar targets cannot exceed 100%.")

    existing = db.scalar(
        select(RpoTarget).where(
            RpoTarget.owner_id == user.id,
            RpoTarget.entity_name == payload["entity_name"].strip(),
            RpoTarget.year == year,
        )
    )
    if existing is not None:
        raise BadRequestError(
            "An RPO target already exists for this entity and year.",
            details={"target_id": existing.id},
        )

    target = RpoTarget(
        owner_id=user.id,
        entity_type=str(payload.get("entity_type", "DISCOM")).upper(),
        entity_name=payload["entity_name"].strip(),
        entity_code=(payload.get("entity_code") or "").strip(),
        state=payload["state"].strip(),
        year=year,
        obligated_energy_mwh=float(payload["obligated_energy_mwh"]),
        solar_target_pct=solar,
        non_solar_target_pct=non_solar,
        total_target_pct=total,
        notes=payload.get("notes", ""),
    )
    db.add(target)
    db.commit()
    db.refresh(target)
    record_audit(
        db,
        user,
        action="rpo_target_created",
        module="rpo",
        entity_type="RpoTarget",
        entity_id=target.id,
        description=f"Created {target.entity_type} RPO target for {target.entity_name} ({year}).",
    )
    return _serialise_target(target, [])


def update_target(
    db: Session, user: User, target_id: int, payload: dict[str, Any]
) -> dict[str, Any]:
    target = _find_target(db, user, target_id)
    if not _can_edit(user, target):
        raise ForbiddenError("You can only edit your own RPO targets.")
    _require_verified_entity(user)

    if "obligated_energy_mwh" in payload:
        target.obligated_energy_mwh = float(payload["obligated_energy_mwh"])
    if "solar_target_pct" in payload:
        target.solar_target_pct = float(payload["solar_target_pct"])
    if "non_solar_target_pct" in payload:
        target.non_solar_target_pct = float(payload["non_solar_target_pct"])
    target.total_target_pct = round(
        target.solar_target_pct + target.non_solar_target_pct, 2
    )
    if target.total_target_pct > 100:
        raise BadRequestError("Combined solar and non-solar targets cannot exceed 100%.")
    for field in ("entity_type", "entity_name", "entity_code", "state", "notes"):
        if field in payload and payload[field] is not None:
            setattr(target, field, str(payload[field]).strip())
    db.commit()
    db.refresh(target)
    record_audit(
        db,
        user,
        action="rpo_target_updated",
        module="rpo",
        entity_type="RpoTarget",
        entity_id=target.id,
        description=f"Updated RPO target {target.entity_name} ({target.year}).",
    )
    records = db.scalars(
        select(RpoComplianceRecord)
        .where(RpoComplianceRecord.target_id == target.id)
        .order_by(RpoComplianceRecord.year)
    ).all()
    return _serialise_target(target, records)


def record_compliance(
    db: Session, user: User, target_id: int, payload: dict[str, Any]
) -> dict[str, Any]:
    target = _find_target(db, user, target_id)
    if not _can_edit(user, target):
        raise ForbiddenError("You can only record compliance for your own RPO targets.")
    _require_verified_entity(user)

    actual_solar = float(payload["actual_solar_mwh"])
    actual_non_solar = float(payload["actual_non_solar_mwh"])
    if actual_solar < 0 or actual_non_solar < 0:
        raise BadRequestError("Actual renewable consumption cannot be negative.")

    required = round(target.obligated_energy_mwh * target.total_target_pct / 100, 2)
    actual_total = round(actual_solar + actual_non_solar, 2)
    compliance_pct = round(actual_total / required * 100, 2) if required else 0.0
    shortfall = round(max(0.0, required - actual_total), 2)
    surplus = round(max(0.0, actual_total - required), 2)
    status = _status(compliance_pct)

    record = db.scalar(
        select(RpoComplianceRecord).where(
            RpoComplianceRecord.target_id == target.id,
            RpoComplianceRecord.year == target.year,
        )
    )
    if record is None:
        record = RpoComplianceRecord(target_id=target.id, year=target.year)
        db.add(record)
    record.actual_solar_mwh = actual_solar
    record.actual_non_solar_mwh = actual_non_solar
    record.actual_total_mwh = actual_total
    record.required_mwh = required
    record.target_snapshot_pct = target.total_target_pct
    record.compliance_pct = compliance_pct
    record.shortfall_mwh = shortfall
    record.surplus_mwh = surplus
    record.status = status
    record.notes = payload.get("notes", "")
    record.recorded_by = user.id
    record.recorded_at = datetime.now(timezone.utc)
    db.add(
        RpoComplianceRevision(
            target_id=target.id,
            year=record.year,
            actual_solar_mwh=record.actual_solar_mwh,
            actual_non_solar_mwh=record.actual_non_solar_mwh,
            actual_total_mwh=record.actual_total_mwh,
            required_mwh=record.required_mwh,
            target_snapshot_pct=record.target_snapshot_pct,
            compliance_pct=record.compliance_pct,
            shortfall_mwh=record.shortfall_mwh,
            surplus_mwh=record.surplus_mwh,
            status=record.status,
            notes=record.notes,
            recorded_by=user.id,
            recorded_at=record.recorded_at,
        )
    )
    db.commit()
    db.refresh(record)
    record_audit(
        db,
        user,
        action="rpo_compliance_recorded",
        module="rpo",
        entity_type="RpoComplianceRecord",
        entity_id=record.id,
        description=(
            f"Recorded RPO compliance {compliance_pct}% for "
            f"{target.entity_name} ({target.year})."
        ),
        details={"status": status, "shortfall_mwh": shortfall},
    )
    return _serialise_compliance(record) or {}


def _serialise_revision(revision: RpoComplianceRevision) -> dict[str, Any]:
    return {
        "id": revision.id,
        "target_id": revision.target_id,
        "year": revision.year,
        "actual_solar_mwh": round(revision.actual_solar_mwh, 2),
        "actual_non_solar_mwh": round(revision.actual_non_solar_mwh, 2),
        "actual_total_mwh": round(revision.actual_total_mwh, 2),
        "required_mwh": round(revision.required_mwh, 2),
        "target_snapshot_pct": revision.target_snapshot_pct,
        "compliance_pct": round(revision.compliance_pct, 2),
        "shortfall_mwh": round(revision.shortfall_mwh, 2),
        "surplus_mwh": round(revision.surplus_mwh, 2),
        "status": revision.status,
        "notes": revision.notes,
        "recorded_by": revision.recorded_by,
        "recorded_at": revision.recorded_at,
    }


def target_history(db: Session, user: User, target_id: int) -> dict[str, Any]:
    target = _find_target(db, user, target_id)
    revisions = db.scalars(
        select(RpoComplianceRevision)
        .where(RpoComplianceRevision.target_id == target.id)
        .order_by(RpoComplianceRevision.recorded_at.desc())
    ).all()
    return {
        "target_id": target.id,
        "entity_name": target.entity_name,
        "entity_code": target.entity_code,
        "year": target.year,
        "items": [_serialise_revision(revision) for revision in revisions],
        "total": len(revisions),
        "note": (
            "Every compliance submission is appended here; earlier filings are "
            "never overwritten."
        ),
    }


def overview(db: Session, user: User) -> dict[str, Any]:
    listing = list_targets(db, user)
    targets = listing["items"]
    records = [
        compliance
        for target in targets
        for compliance in target["compliance_by_year"].values()
        if compliance
    ]

    latest_by_target: list[dict[str, Any]] = []
    for target in targets:
        compliance = target["latest_compliance"]
        latest_by_target.append(
            {
                "target_id": target["id"],
                "entity_name": target["entity_name"],
                "entity_code": target["entity_code"],
                "entity_type": target["entity_type"],
                "state": target["state"],
                "year": target["year"],
                "required_mwh": target["required_mwh"],
                "actual_total_mwh": compliance["actual_total_mwh"] if compliance else 0.0,
                "compliance_pct": compliance["compliance_pct"] if compliance else None,
                "shortfall_mwh": compliance["shortfall_mwh"] if compliance else target["required_mwh"],
                "status": compliance["status"] if compliance else "NOT_RECORDED",
            }
        )

    counts = {"COMPLIANT": 0, "AT_RISK": 0, "NON_COMPLIANT": 0, "NOT_RECORDED": 0}
    for row in latest_by_target:
        counts[row["status"]] = counts.get(row["status"], 0) + 1

    entities: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    for target in targets:
        key = (
            target["entity_type"],
            target["entity_name"],
            target["entity_code"],
            target["state"],
        )
        entity = entities.setdefault(
            key,
            {
                "entity_type": target["entity_type"],
                "entity_name": target["entity_name"],
                "entity_code": target["entity_code"],
                "state": target["state"],
                "years": [],
                "target_count": 0,
                "latest_status": "NOT_RECORDED",
                "latest_year": None,
            },
        )
        entity["years"].append(target["year"])
        entity["target_count"] += 1
        compliance = target["latest_compliance"]
        if entity["latest_year"] is None or target["year"] >= entity["latest_year"]:
            entity["latest_year"] = target["year"]
            entity["latest_status"] = (
                compliance["status"] if compliance else "NOT_RECORDED"
            )
    entity_rows = sorted(
        entities.values(), key=lambda item: (item["entity_name"], item["state"])
    )
    for entity in entity_rows:
        entity["years"] = sorted(entity["years"])

    year_rows: list[dict[str, Any]] = []
    for year in RPO_YEARS:
        year_targets = [target for target in targets if target["year"] == year]
        required = round(sum(target["required_mwh"] for target in year_targets), 2)
        year_records = [
            compliance
            for target in year_targets
            for compliance in target["compliance_by_year"].values()
            if compliance and compliance["year"] == year
        ]
        actual = round(sum(record["actual_total_mwh"] for record in year_records), 2)
        shortfall = round(sum(record["shortfall_mwh"] for record in year_records), 2)
        compliance_pct = round(actual / required * 100, 2) if required and year_records else None
        status = (
            _status(compliance_pct)
            if compliance_pct is not None
            else ("NOT_RECORDED" if year_targets else "NO_TARGET")
        )
        year_rows.append(
            {
                "year": year,
                "required_mwh": required,
                "actual_mwh": actual,
                "compliance_pct": compliance_pct,
                "shortfall_mwh": shortfall,
                "status": status,
                "target_count": len(year_targets),
                "recorded_count": len(year_records),
            }
        )

    total_required = sum(row["required_mwh"] for row in year_rows if row["recorded_count"])
    total_actual = sum(row["actual_mwh"] for row in year_rows)
    overall_pct = round(total_actual / total_required * 100, 2) if total_required else None

    return {
        "summary": {
            "target_count": len(targets),
            "compliant_count": counts.get("COMPLIANT", 0),
            "at_risk_count": counts.get("AT_RISK", 0),
            "non_compliant_count": counts.get("NON_COMPLIANT", 0),
            "not_recorded_count": counts.get("NOT_RECORDED", 0),
            "overall_compliance_pct": overall_pct,
            "total_shortfall_mwh": round(
                sum(row["shortfall_mwh"] for row in year_rows), 2
            ),
            "total_required_mwh": round(
                sum(row["required_mwh"] for row in year_rows), 2
            ),
            "total_actual_mwh": round(total_actual, 2),
        },
        "yearly_tracker": year_rows,
        "targets": latest_by_target,
        "entities": entity_rows,
        "regulatory_basis": RPO_REGULATORY_BASIS,
        "verification": {
            "status": user.verification_status,
            "can_write": (
                user.role in RPO_WRITE_ROLES and organisation_verified(user)
            ),
            "requires_approval": not organisation_verified(user),
        },
        "can_manage": listing["can_manage"] and organisation_verified(user),
        "is_scoped": listing["is_scoped"],
        "scope_note": (
            "Showing all entities (policymaker / administrator view)."
            if _can_view_all(user)
            else "Showing RPO targets created by your account."
        ),
        "years": RPO_YEARS,
        "generated_at": datetime.now(timezone.utc),
    }
