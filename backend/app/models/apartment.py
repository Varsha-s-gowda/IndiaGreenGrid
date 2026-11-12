"""Apartment model."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.allocation import AllocationRecord, AllocationSummary
    from app.models.billing import Bill
    from app.models.meter_reading import MeterReading
    from app.models.ownership_share import OwnershipShare


CONSUMPTION_PROFILES = (
    "LOW",
    "MEDIUM",
    "HIGH",
    "WORK_FROM_HOME",
    "NIGHT_HEAVY",
)


class Apartment(Base):
    __tablename__ = "apartments"
    __table_args__ = (
        CheckConstraint("floor_number >= 0", name="ck_apartments_floor_number_non_negative"),
        CheckConstraint("residents_count >= 0", name="ck_apartments_residents_non_negative"),
        CheckConstraint(
            "consumption_profile IN ('LOW', 'MEDIUM', 'HIGH', "
            "'WORK_FROM_HOME', 'NIGHT_HEAVY')",
            name="ck_apartments_consumption_profile",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    flat_number: Mapped[str] = mapped_column(
        String(20), unique=True, index=True, nullable=False
    )
    floor_number: Mapped[int] = mapped_column(Integer, nullable=False)
    residents_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    apartment_category: Mapped[str] = mapped_column(String(50), nullable=False)
    consumption_profile: Mapped[str] = mapped_column(
        String(30), nullable=False, default="MEDIUM", server_default="MEDIUM"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    ownership_share: Mapped["OwnershipShare | None"] = relationship(
        back_populates="apartment",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    meter_readings: Mapped[list["MeterReading"]] = relationship(
        back_populates="apartment",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    allocation_records: Mapped[list["AllocationRecord"]] = relationship(
        back_populates="apartment",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    allocation_summaries: Mapped[list["AllocationSummary"]] = relationship(
        back_populates="apartment",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    bills: Mapped[list["Bill"]] = relationship(
        back_populates="apartment",
        passive_deletes=True,
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"<Apartment id={self.id} flat={self.flat_number!r}>"
