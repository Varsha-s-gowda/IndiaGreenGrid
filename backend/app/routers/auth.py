"""Registration, login, profile and current-user endpoints."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.core.dependencies import CurrentUser, DbSession
from app.models.user import User
from app.schemas.auth import TokenResponse, UserLogin, UserRead, UserRegister
from app.schemas.platform import PasswordChangeRequest, ProfileUpdate
from app.services.auth_service import (
    authenticate_user,
    build_token_response,
    change_password,
    register_resident,
    update_profile,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Register a citizen or stakeholder account",
)
def register(payload: UserRegister, db: DbSession) -> User:
    return register_resident(db, payload)


@router.post("/login", response_model=TokenResponse, summary="Obtain a JWT access token")
def login(payload: UserLogin, db: DbSession) -> TokenResponse:
    user = authenticate_user(db, str(payload.email), payload.password)
    return build_token_response(user)


@router.get("/me", response_model=UserRead, summary="Current authenticated account")
def me(current_user: CurrentUser) -> User:
    return current_user


@router.put("/profile", response_model=UserRead, summary="Update your profile")
def profile(payload: ProfileUpdate, db: DbSession, current_user: CurrentUser) -> User:
    return update_profile(db, current_user, payload)


@router.post("/change-password", summary="Change your password")
def password(
    payload: PasswordChangeRequest, db: DbSession, current_user: CurrentUser
) -> dict[str, str]:
    change_password(db, current_user, payload)
    return {"message": "Password updated successfully."}
