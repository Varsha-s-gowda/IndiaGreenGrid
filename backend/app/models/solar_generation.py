"""Hourly shared rooftop solar generation readings."""

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
    from app.models.simulation_run import SimulationRun


class SolarGeneration(Base):
    __tablename__ = "solar_generation"
    __table_args__ = (
        UniqueConstraint(
            "simulation_run_id",
            "reading_time",
            name="uq_solar_generation_run_reading_time",
        ),
        CheckConstraint(
            "generation_kwh >= 0",
            name="ck_solar_generation_non_negative",
        ),
        CheckConstraint(
            "capacity_kwp > 0",
            name="ck_solar_generation_capacity_positive",
        ),
        CheckConstraint(
            "weather_factor >= 0",
            name="ck_solar_generation_weather_non_negative",
        ),
        Index(
            "ix_solar_generation_run_reading_time",
            "simulation_run_id",
            "reading_time",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    simulation_run_id: Mapped[int] = mapped_column(
        ForeignKey("simulation_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reading_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    generation_kwh: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    capacity_kwp: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    weather_factor: Mapped[Decimal] = mapped_column(
        Numeric(7, 4), nullable=False, default=0
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    simulation_run: Mapped["SimulationRun"] = relationship(
        back_populates="solar_generation"
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"<SolarGeneration run={self.simulation_run_id} "
            f"time={self.reading_time} kwh={self.generation_kwh}>"
        )
