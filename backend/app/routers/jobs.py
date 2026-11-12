"""D4 - Green jobs portal endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.core.dependencies import AdminUser, DbSession, JobsViewer
from app.schemas.common import MessageResponse
from app.schemas.platform import JobApplicationRequest, JobCreate, JobUpdate
from app.services import jobs_service
from app.services.jobs_service import validate_salary

router = APIRouter(prefix="/jobs", tags=["Green Jobs"])


@router.get("", summary="Search and filter green job opportunities")
def list_jobs(
    db: DbSession,
    current_user: JobsViewer,
    search: Annotated[str | None, Query(max_length=120)] = None,
    category: Annotated[str | None, Query(max_length=60)] = None,
    location: Annotated[str | None, Query(max_length=120)] = None,
    state: Annotated[str | None, Query(max_length=80)] = None,
    employment_type: Annotated[str | None, Query(max_length=40)] = None,
    verification_status: Annotated[str | None, Query(max_length=40)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 9,
    include_inactive: bool = False,
    include_expired: bool = False,
) -> dict:
    is_admin = current_user.role.value == "ADMIN"
    return jobs_service.list_jobs(
        db,
        current_user,
        search=search,
        category=category,
        location=location,
        state=state,
        employment_type=employment_type,
        verification_status=verification_status,
        page=page,
        page_size=page_size,
        include_inactive=include_inactive and is_admin,
        include_expired=include_expired and is_admin,
    )


@router.get("/applications/me", summary="Your job applications")
def my_applications(db: DbSession, current_user: JobsViewer) -> dict:
    return jobs_service.my_applications(db, current_user)


@router.get("/admin/all", summary="All job listings including inactive (admin)")
def admin_all(db: DbSession, admin: AdminUser) -> dict:
    return jobs_service.admin_jobs(db)


@router.post("", status_code=201, summary="Create a job listing (admin)")
def create_job(payload: JobCreate, db: DbSession, admin: AdminUser) -> dict:
    data = payload.model_dump()
    validate_salary(data)
    if data.get("application_url") is not None:
        data["application_url"] = str(data["application_url"])
    if data.get("source_url") is not None:
        data["source_url"] = str(data["source_url"])
    return jobs_service.create_job(db, admin, data)


@router.patch("/{job_id}", summary="Update a job listing (admin)")
def update_job(
    job_id: int, payload: JobUpdate, db: DbSession, admin: AdminUser
) -> dict:
    data = payload.model_dump(exclude_unset=True)
    validate_salary(data)
    if data.get("application_url") is not None:
        data["application_url"] = str(data["application_url"])
    if data.get("source_url") is not None:
        data["source_url"] = str(data["source_url"])
    return jobs_service.update_job(db, admin, job_id, data)


@router.get("/{job_id}", summary="Job details")
def get_job(job_id: int, db: DbSession, current_user: JobsViewer) -> dict:
    return jobs_service.get_job(db, current_user, job_id)


@router.post(
    "/{job_id}/apply",
    response_model=MessageResponse,
    summary="Apply to a job (records the application on the platform)",
)
def apply(
    job_id: int,
    payload: JobApplicationRequest,
    db: DbSession,
    current_user: JobsViewer,
) -> MessageResponse:
    application = jobs_service.apply(db, current_user, job_id, payload.cover_note)
    return MessageResponse(
        message=f"Application submitted for job #{application['job_id']}."
    )
