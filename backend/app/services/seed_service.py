"""Idempotent demo-account seeding.

Demo passwords are never hardcoded for production: they come from
``DEMO_ADMIN_PASSWORD`` and ``DEMO_RESIDENT_PASSWORD``. Development fallbacks
exist only so a freshly cloned project can be explored immediately.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.ecosystem import OrganisationProfile, OrganisationVerification
from app.models.user import ORGANISATION_ROLES, User, UserRole

logger = logging.getLogger(__name__)

DEV_ADMIN_PASSWORD_FALLBACK = "AdminDemo#2026"
DEV_RESIDENT_PASSWORD_FALLBACK = "ResidentDemo#2026"


@dataclass(frozen=True)
class DemoAccount:
    name: str
    email: str
    role: UserRole
    password: str
    organization: str | None = None
    state: str | None = None
    organisation_type: str | None = None
    verified: bool = True


@dataclass(frozen=True)
class SeedResult:
    email: str
    role: UserRole
    created: bool


def _demo_passwords() -> tuple[str, str]:
    admin_password = settings.demo_admin_password
    resident_password = settings.demo_resident_password

    if settings.is_production:
        if not admin_password or not resident_password:
            raise RuntimeError(
                "Refusing to seed production without DEMO_ADMIN_PASSWORD and "
                "DEMO_RESIDENT_PASSWORD."
            )
        return admin_password, resident_password

    return (
        admin_password or DEV_ADMIN_PASSWORD_FALLBACK,
        resident_password or DEV_RESIDENT_PASSWORD_FALLBACK,
    )


def demo_accounts() -> list[DemoAccount]:
    admin_password, resident_password = _demo_passwords()
    if len(admin_password.encode("utf-8")) > 72 or len(resident_password.encode("utf-8")) > 72:
        raise RuntimeError("Demo passwords must not exceed 72 UTF-8 bytes (bcrypt limit).")

    return [
        DemoAccount(
            name=settings.demo_admin_name,
            email=settings.demo_admin_email.lower(),
            role=UserRole.ADMIN,
            password=admin_password,
        ),
        DemoAccount(
            name=settings.demo_resident_1_name,
            email=settings.demo_resident_1_email.lower(),
            role=UserRole.RESIDENT,
            password=resident_password,
        ),
        DemoAccount(
            name=settings.demo_resident_2_name,
            email=settings.demo_resident_2_email.lower(),
            role=UserRole.RESIDENT,
            password=resident_password,
        ),
    ]


def seed_demo_users(db: Session) -> list[SeedResult]:
    """Create the three core demo accounts if they do not already exist."""

    results: list[SeedResult] = []
    for account in demo_accounts():
        existing = db.scalar(select(User).where(User.email == account.email))
        if existing is not None:
            results.append(
                SeedResult(email=account.email, role=existing.role, created=False)
            )
            continue

        user = User(
            name=account.name,
            email=account.email,
            hashed_password=hash_password(account.password),
            role=account.role,
            organization=account.organization,
            state=account.state,
            verification_status="VERIFIED" if account.verified else "PENDING",
        )
        db.add(user)
        results.append(SeedResult(email=account.email, role=account.role, created=True))
        logger.info("Seeding demo %s account %s", account.role.value, account.email)

    db.commit()
    return results


def _stakeholder_password() -> str:
    password = settings.demo_resident_password
    if settings.is_production and not password:
        raise RuntimeError(
            "Refusing to seed production stakeholder accounts without "
            "DEMO_RESIDENT_PASSWORD."
        )
    return password or DEV_RESIDENT_PASSWORD_FALLBACK


def stakeholder_accounts() -> list[DemoAccount]:
    """Demo accounts covering every new ecosystem role."""

    password = _stakeholder_password()
    return [
        DemoAccount(
            name="Citizen Demo",
            email="citizen@solarequity.com",
            role=UserRole.CITIZEN,
            password=password,
            state="Maharashtra",
        ),
        DemoAccount(
            name="SunEdge Solar",
            email="installer@solarequity.com",
            role=UserRole.SOLAR_INSTALLER,
            password=password,
            organization="SunEdge Solar Pvt Ltd",
            state="Maharashtra",
            organisation_type="SOLAR_INSTALLER",
        ),
        DemoAccount(
            name="GreenVolt Energy",
            email="supplier@solarequity.com",
            role=UserRole.RENEWABLE_SUPPLIER,
            password=password,
            organization="GreenVolt Energy Traders",
            state="Gujarat",
            organisation_type="RENEWABLE_SUPPLIER",
        ),
        DemoAccount(
            name="EcoLoop Recycling",
            email="recycler@solarequity.com",
            role=UserRole.RECYCLER,
            password=password,
            organization="EcoLoop Recycling",
            state="Karnataka",
            organisation_type="RECYCLER",
        ),
        DemoAccount(
            name="GreenBank India",
            email="financier@solarequity.com",
            role=UserRole.FINANCIAL_INSTITUTION,
            password=password,
            organization="GreenBank India",
            state="Maharashtra",
            organisation_type="FINANCIAL_INSTITUTION",
        ),
        DemoAccount(
            name="State DISCOM",
            email="discom@solarequity.com",
            role=UserRole.DISCOM,
            password=password,
            organization="Maharashtra State Distribution Utility",
            state="Maharashtra",
            organisation_type="DISCOM",
        ),
        DemoAccount(
            name="SteelWorks Industry",
            email="industry@solarequity.com",
            role=UserRole.INDUSTRY,
            password=password,
            organization="SteelWorks Manufacturing Ltd",
            state="Gujarat",
            organisation_type="INDUSTRY",
        ),
        DemoAccount(
            name="Policy Office",
            email="policymaker@solarequity.com",
            role=UserRole.POLICYMAKER,
            password=password,
            organization="State Electricity Regulatory Commission",
            state="Maharashtra",
        ),
    ]


def seed_stakeholder_users(db: Session) -> list[SeedResult]:
    """Create the ecosystem demo accounts and verified organisation profiles."""

    results: list[SeedResult] = []
    for account in stakeholder_accounts():
        existing = db.scalar(select(User).where(User.email == account.email))
        if existing is not None:
            user = existing
            created = False
        else:
            user = User(
                name=account.name,
                email=account.email,
                hashed_password=hash_password(account.password),
                role=account.role,
                organization=account.organization,
                state=account.state,
                verification_status="VERIFIED",
                verified_at=datetime.now(timezone.utc),
            )
            db.add(user)
            db.flush()
            created = True

        if account.organisation_type and account.role in ORGANISATION_ROLES:
            profile = db.scalar(
                select(OrganisationProfile).where(
                    OrganisationProfile.owner_id == user.id
                )
            )
            if profile is None:
                profile = OrganisationProfile(
                    owner_id=user.id,
                    organisation_type=account.organisation_type,
                    name=account.organization or account.name,
                    city="",
                    state=account.state or "",
                    contact_email=account.email,
                    description=(
                        "Demo stakeholder account seeded for workflow testing."
                    ),
                    serviceable_states=[account.state] if account.state else [],
                    verification_status="VERIFIED",
                    verification_note="Seeded demo organisation, verified automatically.",
                    verified_at=datetime.now(timezone.utc),
                )
                db.add(profile)
                db.flush()
                db.add(
                    OrganisationVerification(
                        organisation_id=profile.id,
                        action="APPROVE",
                        status_after="VERIFIED",
                        note="Seeded demo organisation.",
                        actor_id=None,
                    )
                )
        results.append(SeedResult(email=account.email, role=account.role, created=created))
        logger.info("Seeding demo %s account %s", account.role.value, account.email)

    db.commit()
    return results
