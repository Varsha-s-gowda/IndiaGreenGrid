"""Hourly common-area electricity consumption readings."""

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
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.simulation_run import SimulationRun


class CommonAreaCategory:
    """Supported common-area load categories."""

    LIFTS = "lifts"
    WATER_PUMPS = "water_pumps"
    CORRIDOR_LIGHTS = "corridor_lights"
    SECURITY_SYSTEMS = "security_systems"

    ALL = (LIFTS, WATER_PUMPS, CORRIDOR_LIGHTS, SECURITY_SYSTEMS)


class CommonConsumption(Base):
    __tablename__ = "common_consumption"
    __table_args__ = (
        UniqueConstraint(
            "simulation_run_id",
            "category",
            "reading_time",
            name="uq_common_consumption_run_category_time",
        ),
        CheckConstraint(
            "consumption_kwh >= 0",
            name="ck_common_consumption_non_negative",
        ),
        CheckConstraint(
            "category IN ('lifts', 'water_pumps', 'corridor_lights', 'security_systems')",
            name="ck_common_consumption_category",
        ),
        Index(
            "ix_common_consumption_run_reading_time",
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
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    reading_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    consumption_kwh: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    simulation_run: Mapped["SimulationRun"] = relationship(
        back_populates="common_consumptions"
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"<CommonConsumption run={self.simulation_run_id} "
            f"category={self.category!r} time={self.reading_time} "
            f"kwh={self.consumption_kwh}>"
        )
