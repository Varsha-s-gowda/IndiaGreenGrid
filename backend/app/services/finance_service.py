"""Green finance aggregator (D5)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import distinct, func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, NotFoundError
from app.models.green_grid import FinanceScheme
from app.models.user import User
from app.services.audit_service import record_audit
from app.services.ecosystem_analytics import loan_catalogue

VERIFICATION_STATUSES = ("VERIFIED_EXTERNAL", "SAMPLE", "UNVERIFIED")


def _serialise(scheme: FinanceScheme) -> dict[str, Any]:
    return {
        "id": scheme.id,
        "name": scheme.name,
        "provider": scheme.provider,
        "scheme_type": scheme.scheme_type,
        "category": scheme.category,
        "description": scheme.description,
        "eligibility": scheme.eligibility,
        "benefits": scheme.benefits,
        "interest_rate_min": scheme.interest_rate_min,
        "interest_rate_max": scheme.interest_rate_max,
        "rate_verified": scheme.rate_verified,
        "rate_note": scheme.rate_note,
        "tenure_months_min": scheme.tenure_months_min,
        "tenure_months_max": scheme.tenure_months_max,
        "max_amount": scheme.max_amount,
        "application_url": scheme.application_url,
        "source_url": scheme.source_url,
        "limitations": scheme.limitations or "",
        "last_verified_at": scheme.last_verified_at,
        "verification_status": scheme.verification_status,
        "is_verified_external": scheme.verification_status == "VERIFIED_EXTERNAL",
        "is_active": scheme.is_active,
        "is_sample": scheme.verification_status == "SAMPLE",
        "updated_at": scheme.updated_at,
    }


def list_schemes(
    db: Session,
    *,
    search: str | None = None,
    scheme_type: str | None = None,
    category: str | None = None,
    verification_status: str | None = None,
    page: int = 1,
    page_size: int = 9,
) -> dict[str, Any]:
    filters = [FinanceScheme.is_active.is_(True)]
    if search:
        pattern = f"%{search.strip()}%"
        filters.append(
            or_(
                FinanceScheme.name.ilike(pattern),
                FinanceScheme.provider.ilike(pattern),
                FinanceScheme.description.ilike(pattern),
                FinanceScheme.category.ilike(pattern),
            )
        )
    if scheme_type and scheme_type != "All":
        filters.append(FinanceScheme.scheme_type == scheme_type)
    if category and category != "All":
        filters.append(FinanceScheme.category == category)
    if verification_status and verification_status != "All":
        filters.append(FinanceScheme.verification_status == verification_status)

    total = db.scalar(select(func.count(FinanceScheme.id)).where(*filters)) or 0
    rows = db.scalars(
        select(FinanceScheme)
        .where(*filters)
        .order_by(FinanceScheme.name)
        .limit(page_size)
        .offset((page - 1) * page_size)
    ).all()

    types = sorted(
        db.scalars(
            select(distinct(FinanceScheme.scheme_type)).where(
                FinanceScheme.is_active.is_(True)
            )
        ).all()
    )
    categories = sorted(
        db.scalars(
            select(distinct(FinanceScheme.category)).where(
                FinanceScheme.is_active.is_(True)
            )
        ).all()
    )
    verification_counts = dict(
        db.execute(
            select(
                FinanceScheme.verification_status, func.count(FinanceScheme.id)
            ).group_by(FinanceScheme.verification_status)
        ).all()
    )
    return {
        "items": [_serialise(scheme) for scheme in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
        "facets": {
            "scheme_types": types,
            "categories": categories,
            "verification_statuses": list(VERIFICATION_STATUSES),
        },
        "verification_summary": {
            "verified_external": verification_counts.get("VERIFIED_EXTERNAL", 0),
            "unverified": verification_counts.get("UNVERIFIED", 0),
            "sample": verification_counts.get("SAMPLE", 0),
        },
        "is_sample": verification_counts.get("VERIFIED_EXTERNAL", 0) == 0,
        "disclaimer": (
            "Catalogue entries marked SAMPLE are demonstration data. "
            "VERIFIED_EXTERNAL entries cite a source and a last-verified date; "
            "interest rates, eligibility and availability can change, so confirm "
            "every term with the provider before applying."
        ),
        "generated_at": datetime.now(timezone.utc),
    }


def get_scheme(db: Session, scheme_id: int) -> dict[str, Any]:
    scheme = db.get(FinanceScheme, scheme_id)
    if scheme is None:
        raise NotFoundError("Finance scheme not found.")
    return _serialise(scheme)


def compare(db: Session, ids: list[int]) -> dict[str, Any]:
    if len(ids) < 2 or len(ids) > 4:
        raise BadRequestError("Select between 2 and 4 schemes to compare.")
    schemes = db.scalars(select(FinanceScheme).where(FinanceScheme.id.in_(ids))).all()
    if len(schemes) != len(set(ids)):
        raise NotFoundError("One or more selected schemes could not be found.")
    ordered = sorted(
        schemes, key=lambda scheme: ids.index(scheme.id) if scheme.id in ids else 999
    )
    return {
        "items": [_serialise(scheme) for scheme in ordered],
        "total": len(ordered),
        "note": (
            "Comparison uses published catalogue fields only. The platform does "
            "not calculate loan eligibility or recommend a financial product."
        ),
    }


def create_scheme(db: Session, user: User, payload: dict[str, Any]) -> dict[str, Any]:
    verification_status = str(
        payload.get("verification_status", "SAMPLE")
    ).upper()
    if verification_status not in VERIFICATION_STATUSES:
        raise BadRequestError(
            "Unsupported verification status.",
            details={"supported": list(VERIFICATION_STATUSES)},
        )
    scheme = FinanceScheme(
        name=payload["name"].strip(),
        provider=payload["provider"].strip(),
        scheme_type=str(payload["scheme_type"]).upper(),
        category=payload["category"].strip(),
        description=payload["description"].strip(),
        eligibility=payload["eligibility"].strip(),
        benefits=payload["benefits"].strip(),
        interest_rate_min=payload.get("interest_rate_min"),
        interest_rate_max=payload.get("interest_rate_max"),
        rate_verified=bool(payload.get("rate_verified", False)),
        rate_note=payload.get("rate_note", "") or "",
        tenure_months_min=payload.get("tenure_months_min"),
        tenure_months_max=payload.get("tenure_months_max"),
        max_amount=payload.get("max_amount"),
        application_url=payload.get("application_url"),
        source_url=payload.get("source_url"),
        limitations=(payload.get("limitations") or "").strip(),
        last_verified_at=payload.get("last_verified_at"),
        verification_status=verification_status,
        is_active=bool(payload.get("is_active", True)),
        is_sample=verification_status == "SAMPLE",
    )
    db.add(scheme)
    db.commit()
    db.refresh(scheme)
    record_audit(
        db,
        user,
        action="finance_scheme_created",
        module="finance",
        entity_type="FinanceScheme",
        entity_id=scheme.id,
        description=f"Created finance scheme '{scheme.name}'.",
    )
    return _serialise(scheme)


def update_scheme(
    db: Session, user: User, scheme_id: int, payload: dict[str, Any]
) -> dict[str, Any]:
    scheme = db.get(FinanceScheme, scheme_id)
    if scheme is None:
        raise NotFoundError("Finance scheme not found.")
    for field in (
        "name",
        "provider",
        "scheme_type",
        "category",
        "description",
        "eligibility",
        "benefits",
        "rate_note",
        "application_url",
        "source_url",
        "limitations",
    ):
        if field in payload and payload[field] is not None:
            setattr(scheme, field, payload[field])
    for field in (
        "interest_rate_min",
        "interest_rate_max",
        "tenure_months_min",
        "tenure_months_max",
        "max_amount",
        "last_verified_at",
    ):
        if field in payload:
            setattr(scheme, field, payload[field])
    if "rate_verified" in payload:
        scheme.rate_verified = bool(payload["rate_verified"])
    if "verification_status" in payload and payload["verification_status"] is not None:
        status = str(payload["verification_status"]).upper()
        if status not in VERIFICATION_STATUSES:
            raise BadRequestError(
                "Unsupported verification status.",
                details={"supported": list(VERIFICATION_STATUSES)},
            )
        scheme.verification_status = status
        scheme.is_sample = status == "SAMPLE"
    if "is_active" in payload:
        scheme.is_active = bool(payload["is_active"])
    db.commit()
    db.refresh(scheme)
    record_audit(
        db,
        user,
        action="finance_scheme_updated",
        module="finance",
        entity_type="FinanceScheme",
        entity_id=scheme.id,
        description=f"Updated finance scheme '{scheme.name}'.",
    )
    return _serialise(scheme)


def admin_schemes(db: Session) -> dict[str, Any]:
    schemes = db.scalars(
        select(FinanceScheme).order_by(FinanceScheme.name)
    ).all()
    return {
        "items": [_serialise(scheme) for scheme in schemes],
        "total": len(schemes),
        "loan_marketplace": loan_catalogue(db),
    }
