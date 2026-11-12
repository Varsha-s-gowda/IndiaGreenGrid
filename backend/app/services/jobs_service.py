"""Green jobs portal (D4)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import String, cast, distinct, func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.green_grid import GreenJob, JobApplication
from app.models.user import User
from app.services.audit_service import record_audit


VERIFICATION_STATUSES = ("VERIFIED_EXTERNAL", "SAMPLE", "UNVERIFIED")


def listing_status(job: GreenJob, now: datetime | None = None) -> str:
    """ACTIVE / EXPIRED / INACTIVE derived from the listing's own fields."""

    now = now or datetime.now(timezone.utc)
    if not job.is_active:
        return "INACTIVE"
    if job.expires_at is not None and _aware(job.expires_at) < now:
        return "EXPIRED"
    return "ACTIVE"


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _serialise(job: GreenJob, applied_job_ids: set[int] | None = None) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    status = listing_status(job, now)
    days_until_expiry = None
    if job.expires_at is not None:
        days_until_expiry = (_aware(job.expires_at) - now).days
    return {
        "id": job.id,
        "title": job.title,
        "category": job.category,
        "organization": job.organization,
        "location": job.location,
        "state": job.state,
        "employment_type": job.employment_type,
        "experience_level": job.experience_level,
        "salary_min": job.salary_min,
        "salary_max": job.salary_max,
        "salary_currency": "INR",
        "skills": job.skills or [],
        "description": job.description,
        "eligibility": job.eligibility or "",
        "application_url": job.application_url,
        "source_name": job.source_name or "",
        "source_url": job.source_url,
        "verification_status": job.verification_status,
        "is_verified_external": job.verification_status == "VERIFIED_EXTERNAL",
        "expires_at": job.expires_at,
        "days_until_expiry": days_until_expiry,
        "listing_status": status,
        "is_active": job.is_active,
        "is_sample": job.verification_status == "SAMPLE",
        "posted_at": job.posted_at,
        "has_applied": job.id in (applied_job_ids or set()),
    }


def list_jobs(
    db: Session,
    user: User,
    *,
    search: str | None = None,
    category: str | None = None,
    location: str | None = None,
    employment_type: str | None = None,
    state: str | None = None,
    verification_status: str | None = None,
    page: int = 1,
    page_size: int = 9,
    include_inactive: bool = False,
    include_expired: bool = False,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    filters = []
    if not include_inactive:
        filters.append(GreenJob.is_active.is_(True))
    if not include_expired and not include_inactive:
        filters.append(
            or_(GreenJob.expires_at.is_(None), GreenJob.expires_at >= now)
        )
    if search:
        pattern = f"%{search.strip()}%"
        filters.append(
            or_(
                GreenJob.title.ilike(pattern),
                GreenJob.organization.ilike(pattern),
                GreenJob.description.ilike(pattern),
                cast(GreenJob.skills, String).ilike(pattern),
            )
        )
    if category and category != "All":
        filters.append(GreenJob.category == category)
    if location and location != "All":
        filters.append(GreenJob.location == location)
    if state and state != "All":
        filters.append(GreenJob.state == state)
    if employment_type and employment_type != "All":
        filters.append(GreenJob.employment_type == employment_type)
    if verification_status and verification_status != "All":
        filters.append(GreenJob.verification_status == verification_status)

    total = db.scalar(select(func.count(GreenJob.id)).where(*filters)) or 0
    rows = db.scalars(
        select(GreenJob)
        .where(*filters)
        .order_by(GreenJob.posted_at.desc(), GreenJob.id.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    ).all()

    applied_ids = set(
        db.scalars(
            select(JobApplication.job_id).where(JobApplication.user_id == user.id)
        ).all()
    )

    category_filters = [GreenJob.is_active.is_(True)] if not include_inactive else []
    categories = sorted(
        db.scalars(
            select(distinct(GreenJob.category)).where(*category_filters)
        ).all()
    )
    locations = sorted(
        db.scalars(
            select(distinct(GreenJob.location)).where(*category_filters)
        ).all()
    )
    states = sorted(
        db.scalars(select(distinct(GreenJob.state)).where(*category_filters)).all()
    )
    employment_types = sorted(
        db.scalars(
            select(distinct(GreenJob.employment_type)).where(*category_filters)
        ).all()
    )
    verification_counts = dict(
        db.execute(
            select(GreenJob.verification_status, func.count(GreenJob.id)).group_by(
                GreenJob.verification_status
            )
        ).all()
    )
    expired_count = sum(
        1
        for job in db.scalars(
            select(GreenJob).where(GreenJob.is_active.is_(True))
        ).all()
        if listing_status(job, now) == "EXPIRED"
    )
    return {
        "items": [_serialise(job, applied_ids) for job in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
        "facets": {
            "categories": categories,
            "locations": locations,
            "states": states,
            "employment_types": employment_types,
            "verification_statuses": list(VERIFICATION_STATUSES),
        },
        "verification_summary": {
            "verified_external": verification_counts.get("VERIFIED_EXTERNAL", 0),
            "unverified": verification_counts.get("UNVERIFIED", 0),
            "sample": verification_counts.get("SAMPLE", 0),
            "expired": expired_count,
        },
        "is_sample": verification_counts.get("VERIFIED_EXTERNAL", 0) == 0,
        "disclaimer": (
            "Listings marked SAMPLE are demonstration records, not live "
            "vacancies. VERIFIED_EXTERNAL listings cite an external source and "
            "were checked at the time shown; always confirm the vacancy on the "
            "employer's own page before applying."
        ),
        "generated_at": now,
    }


def get_job(db: Session, user: User, job_id: int) -> dict[str, Any]:
    job = db.get(GreenJob, job_id)
    if job is None:
        raise NotFoundError("Job listing not found.")
    applied = db.scalar(
        select(JobApplication).where(
            JobApplication.job_id == job.id,
            JobApplication.user_id == user.id,
        )
    )
    return {
        **_serialise(job, {job.id} if applied else set()),
        "application": _serialise_application(applied) if applied else None,
    }


def create_job(db: Session, user: User, payload: dict[str, Any]) -> dict[str, Any]:
    verification_status = str(
        payload.get("verification_status", "SAMPLE")
    ).upper()
    if verification_status not in VERIFICATION_STATUSES:
        raise BadRequestError(
            "Unsupported verification status.",
            details={"supported": list(VERIFICATION_STATUSES)},
        )
    job = GreenJob(
        title=payload["title"].strip(),
        category=payload["category"].strip(),
        organization=payload["organization"].strip(),
        location=payload["location"].strip(),
        state=payload.get("state", "").strip() or payload["location"].strip(),
        employment_type=str(payload.get("employment_type", "FULL_TIME")).upper(),
        experience_level=str(payload.get("experience_level", "MID")).upper(),
        salary_min=payload.get("salary_min"),
        salary_max=payload.get("salary_max"),
        skills=payload.get("skills") or [],
        description=payload["description"].strip(),
        eligibility=(payload.get("eligibility") or "").strip(),
        application_url=payload.get("application_url"),
        source_name=(payload.get("source_name") or "").strip(),
        source_url=payload.get("source_url"),
        verification_status=verification_status,
        expires_at=payload.get("expires_at"),
        is_active=bool(payload.get("is_active", True)),
        is_sample=verification_status == "SAMPLE",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    record_audit(
        db,
        user,
        action="job_created",
        module="jobs",
        entity_type="GreenJob",
        entity_id=job.id,
        description=f"Created green job listing '{job.title}'.",
    )
    return _serialise(job)


def update_job(
    db: Session, user: User, job_id: int, payload: dict[str, Any]
) -> dict[str, Any]:
    job = db.get(GreenJob, job_id)
    if job is None:
        raise NotFoundError("Job listing not found.")
    for field in (
        "title",
        "category",
        "organization",
        "location",
        "state",
        "employment_type",
        "experience_level",
        "description",
        "eligibility",
        "application_url",
        "source_name",
        "source_url",
    ):
        if field in payload and payload[field] is not None:
            setattr(job, field, payload[field])
    if "salary_min" in payload:
        job.salary_min = payload["salary_min"]
    if "salary_max" in payload:
        job.salary_max = payload["salary_max"]
    if "skills" in payload and payload["skills"] is not None:
        job.skills = payload["skills"]
    if "expires_at" in payload:
        job.expires_at = payload["expires_at"]
    if "verification_status" in payload and payload["verification_status"] is not None:
        status = str(payload["verification_status"]).upper()
        if status not in VERIFICATION_STATUSES:
            raise BadRequestError(
                "Unsupported verification status.",
                details={"supported": list(VERIFICATION_STATUSES)},
            )
        job.verification_status = status
        job.is_sample = status == "SAMPLE"
    if "is_active" in payload:
        job.is_active = bool(payload["is_active"])
    db.commit()
    db.refresh(job)
    record_audit(
        db,
        user,
        action="job_updated",
        module="jobs",
        entity_type="GreenJob",
        entity_id=job.id,
        description=f"Updated green job listing '{job.title}'.",
    )
    return _serialise(job)


def _serialise_application(application: JobApplication) -> dict[str, Any]:
    return {
        "id": application.id,
        "job_id": application.job_id,
        "status": application.status,
        "cover_note": application.cover_note,
        "applied_at": application.applied_at,
        "job_title": application.job.title if application.job else None,
        "organization": application.job.organization if application.job else None,
    }


def apply(
    db: Session, user: User, job_id: int, cover_note: str = ""
) -> dict[str, Any]:
    job = db.get(GreenJob, job_id)
    if job is None or listing_status(job) != "ACTIVE":
        raise NotFoundError("This job listing is not available.")
    existing = db.scalar(
        select(JobApplication).where(
            JobApplication.job_id == job.id,
            JobApplication.user_id == user.id,
        )
    )
    if existing is not None:
        raise ConflictError("You have already applied to this job.")
    application = JobApplication(
        job_id=job.id,
        user_id=user.id,
        cover_note=cover_note.strip(),
        status="SUBMITTED",
    )
    db.add(application)
    db.commit()
    db.refresh(application)
    record_audit(
        db,
        user,
        action="job_application_submitted",
        module="jobs",
        entity_type="JobApplication",
        entity_id=application.id,
        description=f"Applied to '{job.title}' at {job.organization}.",
    )
    return _serialise_application(application)


def my_applications(db: Session, user: User) -> dict[str, Any]:
    applications = db.scalars(
        select(JobApplication)
        .where(JobApplication.user_id == user.id)
        .order_by(JobApplication.applied_at.desc())
    ).all()
    return {
        "items": [_serialise_application(item) for item in applications],
        "total": len(applications),
    }


def admin_jobs(db: Session, *, include_inactive: bool = True) -> dict[str, Any]:
    statement = select(GreenJob).order_by(GreenJob.posted_at.desc())
    if not include_inactive:
        statement = statement.where(GreenJob.is_active.is_(True))
    jobs = db.scalars(statement).all()
    application_counts = dict(
        db.execute(
            select(JobApplication.job_id, func.count(JobApplication.id)).group_by(
                JobApplication.job_id
            )
        ).all()
    )
    items = []
    for job in jobs:
        item = _serialise(job)
        item["application_count"] = application_counts.get(job.id, 0)
        items.append(item)
    return {"items": items, "total": len(items)}


def validate_salary(payload: dict[str, Any]) -> None:
    minimum = payload.get("salary_min")
    maximum = payload.get("salary_max")
    if minimum is not None and maximum is not None and minimum > maximum:
        raise BadRequestError("Minimum salary cannot exceed maximum salary.")
