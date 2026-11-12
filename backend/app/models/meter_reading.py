"""Hourly apartment electricity meter readings."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.apartment import Apartment
    from app.models.simulation_run import SimulationRun


class MeterReading(Base):
    __tablename__ = "meter_readings"
    __table_args__ = (
        UniqueConstraint(
            "simulation_run_id",
            "apartment_id",
            "reading_time",
            name="uq_meter_readings_run_apartment_time",
        ),
        CheckConstraint(
            "consumption_kwh >= 0",
            name="ck_meter_readings_non_negative",
        ),
        Index(
            "ix_meter_readings_run_reading_time",
            "simulation_run_id",
            "reading_time",
        ),
        Index(
            "ix_meter_readings_apartment_reading_time",
            "apartment_id",
            "reading_time",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    simulation_run_id: Mapped[int] = mapped_column(
        ForeignKey("simulation_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    apartment_id: Mapped[int] = mapped_column(
        ForeignKey("apartments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reading_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    consumption_kwh: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    simulation_run: Mapped["SimulationRun"] = relationship(
        back_populates="meter_readings"
    )
    apartment: Mapped["Apartment"] = relationship(back_populates="meter_readings")

    @property
    def flat_number(self) -> str | None:
        """Convenience read-only field used by API schemas."""

        return self.apartment.flat_number if self.apartment is not None else None

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"<MeterReading run={self.simulation_run_id} "
            f"apartment={self.apartment_id} time={self.reading_time} "
            f"kwh={self.consumption_kwh}>"
        )
