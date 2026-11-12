"""Rooftop solar installation configuration."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SolarConfiguration(Base):
    __tablename__ = "solar_configurations"
    __table_args__ = (
        CheckConstraint("capacity_kwp > 0", name="ck_solar_configurations_capacity_positive"),
        CheckConstraint("rooftop_area > 0", name="ck_solar_configurations_area_positive"),
        CheckConstraint(
            "installation_cost >= 0",
            name="ck_solar_configurations_cost_non_negative",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    capacity_kwp: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    rooftop_area: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    installation_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"<SolarConfiguration id={self.id} capacity_kwp={self.capacity_kwp}>"
