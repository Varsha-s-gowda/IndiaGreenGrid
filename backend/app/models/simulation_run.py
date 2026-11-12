"""Synthetic simulation run metadata.

Every generated dataset is attached to one ``SimulationRun``.  Keeping runs
separate lets an administrator regenerate a period without ever mixing the new
readings with historical data, and it gives the query APIs a stable scope.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.allocation import AllocationRun
    from app.models.common_consumption import CommonConsumption
    from app.models.meter_reading import MeterReading
    from app.models.solar_generation import SolarGeneration


class SimulationStatus:
    """Allowed lifecycle states for a simulation run."""

    PENDING = "PENDING"
    RUNNING = "RUNNING"
    PARTIAL = "PARTIAL"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

    ALL = (PENDING, RUNNING, PARTIAL, COMPLETED, FAILED)


class SimulationRun(Base):
    __tablename__ = "simulation_runs"
    __table_args__ = (
        CheckConstraint(
            "solar_capacity_kwp > 0",
            name="ck_simulation_runs_capacity_positive",
        ),
        CheckConstraint("days > 0", name="ck_simulation_runs_days_positive"),
        CheckConstraint(
            "end_date >= start_date",
            name="ck_simulation_runs_period_valid",
        ),
        CheckConstraint(
            "status IN ('PENDING', 'RUNNING', 'PARTIAL', 'COMPLETED', 'FAILED')",
            name="ck_simulation_runs_status",
        ),
        Index("ix_simulation_runs_status_created", "status", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SimulationStatus.PENDING
    )
    solar_capacity_kwp: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    days: Mapped[int] = mapped_column(Integer, nullable=False)
    random_seed: Mapped[int] = mapped_column(Integer, nullable=False, default=360)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    solar_generation: Mapped[list["SolarGeneration"]] = relationship(
        back_populates="simulation_run",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    meter_readings: Mapped[list["MeterReading"]] = relationship(
        back_populates="simulation_run",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    common_consumptions: Mapped[list["CommonConsumption"]] = relationship(
        back_populates="simulation_run",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    allocation_runs: Mapped[list["AllocationRun"]] = relationship(
        back_populates="simulation_run",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"<SimulationRun id={self.id} status={self.status!r} "
            f"period={self.start_date}..{self.end_date}>"
        )
