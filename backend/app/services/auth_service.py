"""Authentication business logic."""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, UnauthorizedError
from app.core.security import (
    access_token_expires_in_seconds,
    create_access_token,
    hash_password,
    verify_password,
)
from app.models.user import (
    ORGANISATION_ROLES,
    SELF_VERIFIED_ROLES,
    STAKEHOLDER_ROLES,
    User,
    UserRole,
)
from app.schemas.auth import TokenResponse, UserRead, UserRegister
from app.schemas.platform import PasswordChangeRequest, ProfileUpdate

logger = logging.getLogger(__name__)

_DUMMY_PASSWORD_HASH = hash_password("solarequity-dummy-password")


def normalise_email(email: str) -> str:
    return email.strip().lower()


def organisation_verified(user: User) -> bool:
    """True when an organisational account may perform entity-scoped writes.

    Admin accounts are always allowed. Resident/Citizen accounts never need
    organisational approval. Meta-table reads remain available while pending.
    """

    if user.role == UserRole.ADMIN:
        return True
    if user.role not in ORGANISATION_ROLES:
        return True
    return user.verification_status == "VERIFIED"


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == normalise_email(email)))


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def register_resident(db: Session, payload: UserRegister) -> User:
    """Register a public account. Public registration can never create admins."""

    email = normalise_email(str(payload.email))
    if get_user_by_email(db, email):
        raise ConflictError("An account with this email already exists.")

    requested_role = payload.role or UserRole.RESIDENT
    role = (
        requested_role
        if requested_role in STAKEHOLDER_ROLES
        else UserRole.RESIDENT
    )
    self_verified = role in SELF_VERIFIED_ROLES
    from datetime import datetime, timezone

    user = User(
        name=payload.name,
        email=email,
        hashed_password=hash_password(payload.password),
        role=role,
        organization=(payload.organization or "").strip() or None,
        state=(payload.state or "").strip() or None,
        is_active=True,
        verification_status="VERIFIED" if self_verified else "PENDING",
        verification_note=(
            ""
            if self_verified
            else (
                "Organisational account pending administrator verification. "
                "Read-only national modules are available immediately; "
                "entity-scoped writes require approval."
            )
        ),
        verified_at=datetime.now(timezone.utc) if self_verified else None,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("An account with this email already exists.") from exc

    if role in ORGANISATION_ROLES and role != UserRole.POLICYMAKER:
        _create_organisation_registration(db, user, payload)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("An account with this email already exists.") from exc

    db.refresh(user)
    logger.info("Registered new %s account id=%s", role.value, user.id)
    return user


def _create_organisation_registration(
    db: Session, user: User, payload: UserRegister
) -> None:
    """Create the pending organisation profile and alert administrators."""

    from app.models.ecosystem import Notification, OrganisationProfile, OrganisationVerification
    from app.models.user import User as UserModel

    profile = OrganisationProfile(
        owner_id=user.id,
        organisation_type=user.role.value,
        name=(payload.organization or user.name).strip(),
        state=(payload.state or "").strip(),
        contact_email=user.email,
        verification_status="PENDING",
        verification_note="Registration submitted. Awaiting administrator review.",
    )
    db.add(profile)
    db.flush()
    db.add(
        OrganisationVerification(
            organisation_id=profile.id,
            action="SUBMITTED",
            status_after="PENDING",
            note="Organisation registration submitted.",
            actor_id=user.id,
        )
    )
    admin_ids = db.scalars(select(UserModel.id).where(UserModel.role == UserRole.ADMIN))
    for admin_id in admin_ids:
        db.add(
            Notification(
                user_id=admin_id,
                title="New organisation registration",
                message=f"{profile.name} registered as {user.role.value}.",
                category="ORGANISATION",
                link="/admin/ecosystem",
                entity_type="ORGANISATION",
                entity_id=profile.id,
            )
        )


def authenticate_user(db: Session, email: str, password: str) -> User:
    user = get_user_by_email(db, email)
    if user is None:
        verify_password(password, _DUMMY_PASSWORD_HASH)
        raise UnauthorizedError("Invalid email or password.")

    if not verify_password(password, user.hashed_password):
        raise UnauthorizedError("Invalid email or password.")

    if not user.is_active:
        raise UnauthorizedError(
            "This account has been deactivated. Contact a platform administrator."
        )

    from datetime import datetime, timezone

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return user


def build_token_response(user: User) -> TokenResponse:
    token = create_access_token(
        subject=user.id,
        role=user.role.value,
    )
    return TokenResponse(
        access_token=token,
        expires_in=access_token_expires_in_seconds(),
        user=UserRead.model_validate(user),
    )


def update_profile(db: Session, user: User, payload: ProfileUpdate) -> User:
    data = payload.model_dump(exclude_unset=True)
    for field in ("name", "organization", "state"):
        if field in data and data[field] is not None:
            setattr(user, field, str(data[field]).strip() or None)
    if not user.name:
        raise ConflictError("Name must not be blank.")
    db.commit()
    db.refresh(user)
    return user


def change_password(db: Session, user: User, payload: PasswordChangeRequest) -> None:
    if not verify_password(payload.current_password, user.hashed_password):
        raise UnauthorizedError("Your current password is incorrect.")
    user.hashed_password = hash_password(payload.new_password)
    db.commit()
