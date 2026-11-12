"""Apartment ownership shares in the shared rooftop solar asset."""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.apartment import Apartment


class OwnershipShare(Base):
    __tablename__ = "ownership_shares"
    __table_args__ = (
        CheckConstraint(
            "contribution_amount >= 0",
            name="ck_ownership_shares_contribution_non_negative",
        ),
        CheckConstraint(
            "ownership_percentage >= 0 AND ownership_percentage <= 100",
            name="ck_ownership_shares_percentage_range",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    apartment_id: Mapped[int] = mapped_column(
        ForeignKey("apartments.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    contribution_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    ownership_percentage: Mapped[Decimal] = mapped_column(Numeric(7, 3), nullable=False)

    apartment: Mapped["Apartment"] = relationship(back_populates="ownership_share")

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"<OwnershipShare apartment_id={self.apartment_id} "
            f"percentage={self.ownership_percentage}>"
        )
