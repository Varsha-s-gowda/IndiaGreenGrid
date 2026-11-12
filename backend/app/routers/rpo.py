"""D2 - RPO compliance tracker endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.dependencies import CurrentUser, DbSession, require_roles
from app.models.user import User, UserRole
from app.schemas.platform import RpoComplianceCreate, RpoTargetCreate, RpoTargetUpdate
from app.services import rpo_service

router = APIRouter(prefix="/rpo", tags=["RPO Compliance"])

RpoViewer = Annotated[
    User,
    Depends(
        require_roles(
            UserRole.ADMIN,
            UserRole.DISCOM,
            UserRole.INDUSTRY,
            UserRole.POLICYMAKER,
        )
    ),
]


@router.get("/overview", summary="RPO summary and 2025-2030 yearly tracker")
def overview(db: DbSession, user: RpoViewer) -> dict:
    return rpo_service.overview(db, user)


@router.get("/targets", summary="List RPO targets in your scope")
def targets(db: DbSession, user: RpoViewer) -> dict:
    return rpo_service.list_targets(db, user)


@router.post("/targets", summary="Create an RPO target (DISCOM / industry / admin)")
def create_target(payload: RpoTargetCreate, db: DbSession, user: RpoViewer) -> dict:
    return rpo_service.create_target(db, user, payload.model_dump())


@router.patch("/targets/{target_id}", summary="Update an RPO target")
def update_target(
    target_id: int, payload: RpoTargetUpdate, db: DbSession, user: RpoViewer
) -> dict:
    return rpo_service.update_target(
        db, user, target_id, payload.model_dump(exclude_unset=True)
    )


@router.post(
    "/targets/{target_id}/compliance",
    summary="Record actual renewable consumption and calculate compliance",
)
def record_compliance(
    target_id: int,
    payload: RpoComplianceCreate,
    db: DbSession,
    user: RpoViewer,
) -> dict:
    return rpo_service.record_compliance(db, user, target_id, payload.model_dump())


@router.get(
    "/targets/{target_id}/history",
    summary="Immutable compliance submission history for one target",
)
def target_history(target_id: int, db: DbSession, user: RpoViewer) -> dict:
    return rpo_service.target_history(db, user, target_id)
