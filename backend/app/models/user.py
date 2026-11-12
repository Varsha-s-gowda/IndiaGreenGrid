"""User account model and roles."""

from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.allocation import AllocationRun
    from app.models.apartment import Apartment


class UserRole(str, enum.Enum):
    """Platform roles.

    ``RESIDENT`` remains for community-solar flat owners; ``CITIZEN`` is the
    general public stakeholder portal.  The remaining roles map to the PS1
    stakeholder portals.
    """

    ADMIN = "ADMIN"
    RESIDENT = "RESIDENT"
    CITIZEN = "CITIZEN"
    DISCOM = "DISCOM"
    INDUSTRY = "INDUSTRY"
    FINANCIAL_INSTITUTION = "FINANCIAL_INSTITUTION"
    POLICYMAKER = "POLICYMAKER"
    SOLAR_INSTALLER = "SOLAR_INSTALLER"
    RENEWABLE_SUPPLIER = "RENEWABLE_SUPPLIER"
    RECYCLER = "RECYCLER"


STAKEHOLDER_ROLES = (
    UserRole.RESIDENT,
    UserRole.CITIZEN,
    UserRole.DISCOM,
    UserRole.INDUSTRY,
    UserRole.FINANCIAL_INSTITUTION,
    UserRole.POLICYMAKER,
    UserRole.SOLAR_INSTALLER,
    UserRole.RENEWABLE_SUPPLIER,
    UserRole.RECYCLER,
)

ORGANISATION_ROLES = (
    UserRole.DISCOM,
    UserRole.INDUSTRY,
    UserRole.FINANCIAL_INSTITUTION,
    UserRole.POLICYMAKER,
    UserRole.SOLAR_INSTALLER,
    UserRole.RENEWABLE_SUPPLIER,
    UserRole.RECYCLER,
)

SELF_VERIFIED_ROLES = {UserRole.RESIDENT, UserRole.CITIZEN}

VERIFICATION_STATUSES = ("VERIFIED", "PENDING", "REJECTED")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(
            UserRole,
            name="ck_users_role",
            native_enum=False,
            create_constraint=True,
            length=30,
            validate_strings=True,
        ),
        nullable=False,
        default=UserRole.RESIDENT,
        server_default=UserRole.RESIDENT.value,
    )
    organization: Mapped[str | None] = mapped_column(String(160), nullable=True)
    state: Mapped[str | None] = mapped_column(String(80), nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )
    verification_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="VERIFIED", server_default="VERIFIED"
    )
    verification_note: Mapped[str] = mapped_column(
        Text, nullable=False, default="", server_default=""
    )
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    verified_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    apartment_id: Mapped[int | None] = mapped_column(
        ForeignKey("apartments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    apartment: Mapped["Apartment | None"] = relationship(
        foreign_keys=[apartment_id]
    )
    allocation_runs: Mapped[list["AllocationRun"]] = relationship(
        back_populates="created_by",
        foreign_keys="AllocationRun.created_by_id",
    )

    @property
    def flat_number(self) -> str | None:
        """Convenience accessor so residents can resolve their own flat."""

        return self.apartment.flat_number if self.apartment is not None else None

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"<User id={self.id} email={self.email!r} role={self.role.value}>"
