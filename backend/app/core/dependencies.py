"""Reusable FastAPI security dependencies and role guards."""

from __future__ import annotations

from typing import Annotated, Callable

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.security import decode_access_token
from app.database import get_db
from app.models.user import User, UserRole
from app.services.auth_service import get_user_by_id

bearer_scheme = HTTPBearer(
    auto_error=False,
    scheme_name="BearerAuth",
    description="Paste the access_token returned by POST /api/auth/login.",
)

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise UnauthorizedError("Missing bearer token.")

    payload = decode_access_token(credentials.credentials)
    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise UnauthorizedError("Invalid access token payload.") from exc

    user = get_user_by_id(db, user_id)
    if user is None:
        raise UnauthorizedError("The account for this token no longer exists.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*allowed_roles: UserRole) -> Callable[..., User]:
    """Dependency factory for role-based route protection."""

    allowed = set(allowed_roles)

    def _guard(current_user: CurrentUser) -> User:
        if current_user.role not in allowed:
            raise ForbiddenError(
                "You do not have permission to access this resource.",
                details={"required_roles": sorted(role.value for role in allowed)},
            )
        return current_user

    return _guard


AdminUser = Annotated[User, Depends(require_roles(UserRole.ADMIN))]


NATIONAL_ANALYTICS_ROLES = (
    UserRole.ADMIN,
    UserRole.DISCOM,
    UserRole.INDUSTRY,
    UserRole.FINANCIAL_INSTITUTION,
    UserRole.POLICYMAKER,
)
IMPACT_ROLES = NATIONAL_ANALYTICS_ROLES
FORECAST_ROLES = NATIONAL_ANALYTICS_ROLES
JOBS_ROLES = (
    UserRole.ADMIN,
    UserRole.RESIDENT,
    UserRole.CITIZEN,
    UserRole.INDUSTRY,
    UserRole.POLICYMAKER,
)
FINANCE_ROLES = (
    UserRole.ADMIN,
    UserRole.RESIDENT,
    UserRole.CITIZEN,
    UserRole.INDUSTRY,
    UserRole.FINANCIAL_INSTITUTION,
    UserRole.POLICYMAKER,
)
CIRCULAR_ROLES = (
    UserRole.ADMIN,
    UserRole.RESIDENT,
    UserRole.CITIZEN,
    UserRole.INDUSTRY,
    UserRole.POLICYMAKER,
)
SOLAR_CALCULATOR_ROLES = (
    UserRole.ADMIN,
    UserRole.RESIDENT,
    UserRole.CITIZEN,
    UserRole.INDUSTRY,
    UserRole.FINANCIAL_INSTITUTION,
)
COMMUNITY_ROLES = (
    UserRole.ADMIN,
    UserRole.RESIDENT,
    UserRole.CITIZEN,
    UserRole.DISCOM,
    UserRole.POLICYMAKER,
)
BILLING_ROLES = (
    UserRole.ADMIN,
    UserRole.RESIDENT,
    UserRole.CITIZEN,
)
ALLOCATION_ROLES = (
    UserRole.ADMIN,
    UserRole.RESIDENT,
    UserRole.CITIZEN,
)
SIMULATION_ROLES = (
    UserRole.ADMIN,
    UserRole.DISCOM,
)
ROOFMAX_ROLES = (
    UserRole.ADMIN,
    UserRole.RESIDENT,
    UserRole.CITIZEN,
    UserRole.DISCOM,
    UserRole.INDUSTRY,
    UserRole.FINANCIAL_INSTITUTION,
)
SOLARVAULT_ROLES = ROOFMAX_ROLES
APARTMENT_ROLES = (
    UserRole.ADMIN,
    UserRole.DISCOM,
    UserRole.POLICYMAKER,
)
APARTMENT_SUMMARY_ROLES = (
    UserRole.ADMIN,
    UserRole.RESIDENT,
    UserRole.CITIZEN,
    UserRole.DISCOM,
    UserRole.POLICYMAKER,
)

NationalAnalyticsViewer = Annotated[
    User, Depends(require_roles(*NATIONAL_ANALYTICS_ROLES))
]
ImpactViewer = Annotated[User, Depends(require_roles(*IMPACT_ROLES))]
ForecastViewer = Annotated[User, Depends(require_roles(*FORECAST_ROLES))]
JobsViewer = Annotated[User, Depends(require_roles(*JOBS_ROLES))]
FinanceViewer = Annotated[User, Depends(require_roles(*FINANCE_ROLES))]
CircularViewer = Annotated[User, Depends(require_roles(*CIRCULAR_ROLES))]
SolarCalculatorViewer = Annotated[
    User, Depends(require_roles(*SOLAR_CALCULATOR_ROLES))
]
CommunityViewer = Annotated[User, Depends(require_roles(*COMMUNITY_ROLES))]
BillingViewer = Annotated[User, Depends(require_roles(*BILLING_ROLES))]
AllocationViewer = Annotated[User, Depends(require_roles(*ALLOCATION_ROLES))]
SimulationViewer = Annotated[User, Depends(require_roles(*SIMULATION_ROLES))]
RoofMaxViewer = Annotated[User, Depends(require_roles(*ROOFMAX_ROLES))]
SolarVaultViewer = Annotated[User, Depends(require_roles(*SOLARVAULT_ROLES))]
ApartmentViewer = Annotated[User, Depends(require_roles(*APARTMENT_ROLES))]
ApartmentSummaryViewer = Annotated[
    User, Depends(require_roles(*APARTMENT_SUMMARY_ROLES))
]
