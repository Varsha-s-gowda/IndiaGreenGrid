"""Organisation profiles, admin verification and platform analytics endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.core.dependencies import AdminUser, CurrentUser, DbSession
from app.schemas.ecosystem import OrganisationProfileUpdate, OrganisationReview
from app.services import organisation_service

router = APIRouter(tags=["Organisations & Platform"])


@router.get("/organisations/me", summary="My organisation profile and verification history")
def my_profile(db: DbSession, current_user: CurrentUser) -> dict:
    return organisation_service.get_my_profile(db, current_user)


@router.put("/organisations/me", summary="Update my organisation profile")
def update_my_profile(
    payload: OrganisationProfileUpdate, db: DbSession, current_user: CurrentUser
) -> dict:
    return organisation_service.update_my_profile(db, current_user, payload)


@router.post("/organisations/me/submit", summary="Submit my organisation for verification")
def submit_verification(db: DbSession, current_user: CurrentUser) -> dict:
    return organisation_service.submit_for_verification(db, current_user)


@router.get("/organisations", summary="Administrator: list organisation registrations")
def list_organisations(
    db: DbSession,
    admin: AdminUser,
    status_filter: Annotated[str | None, Query(alias="status", max_length=20)] = None,
    organisation_type: Annotated[str | None, Query(max_length=40)] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    return organisation_service.list_organisations(
        db,
        admin,
        status=status_filter,
        organisation_type=organisation_type,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.get("/organisations/{organisation_id}", summary="Organisation profile and history")
def organisation_detail(
    organisation_id: int, db: DbSession, current_user: CurrentUser
) -> dict:
    return organisation_service.get_organisation_detail(db, current_user, organisation_id)


@router.get(
    "/organisations/{organisation_id}/history",
    summary="Organisation verification history",
)
def organisation_history(
    organisation_id: int, db: DbSession, current_user: CurrentUser
) -> dict:
    return {
        "items": organisation_service.verification_history(
            db, current_user, organisation_id
        )
    }


@router.post("/organisations/{organisation_id}/review", summary="Administrator verification decision")
def review_organisation(
    organisation_id: int,
    payload: OrganisationReview,
    db: DbSession,
    admin: AdminUser,
) -> dict:
    return organisation_service.review_organisation(
        db, admin, organisation_id, action=payload.action, note=payload.note
    )


@router.get("/platform/overview", summary="Administrator: live platform monitoring")
def platform_overview(db: DbSession, admin: AdminUser) -> dict:
    return organisation_service.platform_overview(db)


@router.get("/platform/policy-aggregates", summary="Policymaker: aggregated platform activity")
def policy_aggregates(db: DbSession, current_user: CurrentUser) -> dict:
    if current_user.role.value not in {"ADMIN", "POLICYMAKER"}:
        from app.core.exceptions import ForbiddenError

        raise ForbiddenError("Only administrators and policymakers can access this resource.")
    return organisation_service.policy_aggregates(db)
