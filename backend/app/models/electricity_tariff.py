"""Electricity tariff revisions."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ElectricityTariff(Base):
    __tablename__ = "electricity_tariffs"
    __table_args__ = (
        UniqueConstraint("effective_from", name="uq_electricity_tariffs_effective_from"),
        CheckConstraint(
            "price_per_kwh > 0", name="ck_electricity_tariffs_price_positive"
        ),
        CheckConstraint(
            "effective_to IS NULL OR effective_to >= effective_from",
            name="ck_electricity_tariffs_valid_period",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    price_per_kwh: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"<ElectricityTariff id={self.id} price={self.price_per_kwh} "
            f"from={self.effective_from}>"
        )
