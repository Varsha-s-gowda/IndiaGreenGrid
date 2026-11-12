"""Fair-share solar allocation runs, hourly records and apartment summaries.

Part 3 keeps allocation results completely separate from SolarTwin readings.
A saved allocation run is an immutable audit snapshot: it references the
simulation run it was calculated from, stores the algorithm version and an
input hash, and owns its records through cascading foreign keys.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.apartment import Apartment
    from app.models.billing import Bill
    from app.models.simulation_run import SimulationRun
    from app.models.user import User


class AllocationMethod:
    """The three supported fair-allocation policies."""

    EQUAL_SHARE = "EQUAL_SHARE"
    CONSUMPTION_BASED = "CONSUMPTION_BASED"
    OWNERSHIP_BASED = "OWNERSHIP_BASED"

    ALL = (EQUAL_SHARE, CONSUMPTION_BASED, OWNERSHIP_BASED)
    LABELS = {
        EQUAL_SHARE: "Equal share",
        CONSUMPTION_BASED: "Consumption based",
        OWNERSHIP_BASED: "Ownership based",
    }


class AllocationRunStatus:
    """Persisted allocation lifecycle states."""

    SAVED = "SAVED"
    SAVED_WITH_GAPS = "SAVED_WITH_GAPS"

    ALL = (SAVED, SAVED_WITH_GAPS)


class AllocationRun(Base):
    __tablename__ = "allocation_runs"
    __table_args__ = (
        UniqueConstraint(
            "simulation_run_id",
            "method",
            "date_from",
            "date_to",
            "algorithm_version",
            "input_hash",
            name="uq_allocation_runs_identity",
        ),
        CheckConstraint(
            "method IN ('EQUAL_SHARE', 'CONSUMPTION_BASED', 'OWNERSHIP_BASED')",
            name="ck_allocation_runs_method",
        ),
        CheckConstraint(
            "status IN ('SAVED', 'SAVED_WITH_GAPS')",
            name="ck_allocation_runs_status",
        ),
        CheckConstraint(
            "date_to >= date_from",
            name="ck_allocation_runs_period_valid",
        ),
        CheckConstraint(
            "total_available_energy_kwh >= 0 AND total_allocated_energy_kwh >= 0 "
            "AND total_surplus_energy_kwh >= 0 AND total_consumption_kwh >= 0 "
            "AND total_grid_import_kwh >= 0",
            name="ck_allocation_runs_totals_non_negative",
        ),
        CheckConstraint(
            "total_allocated_energy_kwh "
            "<= total_available_energy_kwh + 0.000001",
            name="ck_allocation_runs_allocation_within_available",
        ),
        Index(
            "ix_allocation_runs_simulation_method_dates",
            "simulation_run_id",
            "method",
            "date_from",
        ),
        Index("ix_allocation_runs_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    simulation_run_id: Mapped[int] = mapped_column(
        ForeignKey("simulation_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    method: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default=AllocationRunStatus.SAVED
    )
    date_from: Mapped[date] = mapped_column(Date, nullable=False)
    date_to: Mapped[date] = mapped_column(Date, nullable=False)
    total_solar_generation_kwh: Mapped[Decimal] = mapped_column(
        Numeric(18, 6), nullable=False
    )
    common_solar_consumption_kwh: Mapped[Decimal] = mapped_column(
        Numeric(18, 6), nullable=False
    )
    total_available_energy_kwh: Mapped[Decimal] = mapped_column(
        Numeric(18, 6), nullable=False
    )
    total_allocated_energy_kwh: Mapped[Decimal] = mapped_column(
        Numeric(18, 6), nullable=False
    )
    total_surplus_energy_kwh: Mapped[Decimal] = mapped_column(
        Numeric(18, 6), nullable=False
    )
    total_consumption_kwh: Mapped[Decimal] = mapped_column(
        Numeric(18, 6), nullable=False
    )
    total_grid_import_kwh: Mapped[Decimal] = mapped_column(
        Numeric(18, 6), nullable=False
    )
    average_coverage_percentage: Mapped[Decimal] = mapped_column(
        Numeric(7, 3), nullable=False, default=0
    )
    tariff_price_per_kwh: Mapped[Decimal] = mapped_column(
        Numeric(10, 4), nullable=False, default=0
    )
    algorithm_version: Mapped[str] = mapped_column(String(20), nullable=False)
    input_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    is_hypothetical: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    incomplete_data: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    policy_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    simulation_run: Mapped["SimulationRun"] = relationship(
        back_populates="allocation_runs"
    )
    created_by: Mapped["User | None"] = relationship(back_populates="allocation_runs")
    records: Mapped[list["AllocationRecord"]] = relationship(
        back_populates="allocation_run",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    summaries: Mapped[list["AllocationSummary"]] = relationship(
        back_populates="allocation_run",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    bills: Mapped[list["Bill"]] = relationship(
        back_populates="allocation_run",
        passive_deletes=True,
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"<AllocationRun id={self.id} method={self.method!r} "
            f"simulation_run={self.simulation_run_id} "
            f"period={self.date_from}..{self.date_to}>"
        )


class AllocationRecord(Base):
    __tablename__ = "allocation_records"
    __table_args__ = (
        UniqueConstraint(
            "allocation_run_id",
            "apartment_id",
            "reading_time",
            name="uq_allocation_records_run_apartment_time",
        ),
        CheckConstraint(
            "consumption_kwh >= 0",
            name="ck_allocation_records_consumption_non_negative",
        ),
        CheckConstraint(
            "allocated_solar_kwh >= 0",
            name="ck_allocation_records_allocation_non_negative",
        ),
        CheckConstraint(
            "grid_import_kwh >= 0",
            name="ck_allocation_records_grid_non_negative",
        ),
        CheckConstraint(
            "allocated_solar_kwh <= consumption_kwh + 0.000001",
            name="ck_allocation_records_allocation_within_demand",
        ),
        CheckConstraint(
            "ownership_percentage >= 0 AND ownership_percentage <= 100",
            name="ck_allocation_records_ownership_range",
        ),
        CheckConstraint(
            "allocation_weight >= 0 AND allocation_weight <= 1",
            name="ck_allocation_records_weight_range",
        ),
        Index(
            "ix_allocation_records_run_reading_time",
            "allocation_run_id",
            "reading_time",
        ),
        Index(
            "ix_allocation_records_apartment_reading_time",
            "apartment_id",
            "reading_time",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    allocation_run_id: Mapped[int] = mapped_column(
        ForeignKey("allocation_runs.id", ondelete="CASCADE"),
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
    allocated_solar_kwh: Mapped[Decimal] = mapped_column(
        Numeric(12, 6), nullable=False
    )
    grid_import_kwh: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False)
    ownership_percentage: Mapped[Decimal] = mapped_column(
        Numeric(7, 3), nullable=False, default=0
    )
    allocation_weight: Mapped[Decimal] = mapped_column(
        Numeric(12, 10), nullable=False, default=0
    )

    allocation_run: Mapped["AllocationRun"] = relationship(back_populates="records")
    apartment: Mapped["Apartment"] = relationship(back_populates="allocation_records")

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"<AllocationRecord run={self.allocation_run_id} "
            f"apartment={self.apartment_id} time={self.reading_time} "
            f"allocated={self.allocated_solar_kwh}>"
        )


class AllocationSummary(Base):
    __tablename__ = "allocation_summaries"
    __table_args__ = (
        UniqueConstraint(
            "allocation_run_id",
            "apartment_id",
            name="uq_allocation_summaries_run_apartment",
        ),
        CheckConstraint(
            "total_consumption_kwh >= 0 AND total_solar_allocation_kwh >= 0 "
            "AND total_grid_import_kwh >= 0",
            name="ck_allocation_summaries_totals_non_negative",
        ),
        CheckConstraint(
            "total_solar_allocation_kwh <= total_consumption_kwh + 0.000001",
            name="ck_allocation_summaries_allocation_within_demand",
        ),
        CheckConstraint(
            "solar_coverage_percentage >= 0 AND solar_coverage_percentage <= 100",
            name="ck_allocation_summaries_coverage_range",
        ),
        CheckConstraint(
            "estimated_solar_credit >= 0",
            name="ck_allocation_summaries_credit_non_negative",
        ),
        Index(
            "ix_allocation_summaries_run_coverage",
            "allocation_run_id",
            "solar_coverage_percentage",
        ),
        Index("ix_allocation_summaries_apartment", "apartment_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    allocation_run_id: Mapped[int] = mapped_column(
        ForeignKey("allocation_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    apartment_id: Mapped[int] = mapped_column(
        ForeignKey("apartments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    total_consumption_kwh: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False
    )
    total_solar_allocation_kwh: Mapped[Decimal] = mapped_column(
        Numeric(14, 6), nullable=False
    )
    total_grid_import_kwh: Mapped[Decimal] = mapped_column(
        Numeric(14, 6), nullable=False
    )
    solar_coverage_percentage: Mapped[Decimal] = mapped_column(
        Numeric(7, 3), nullable=False
    )
    estimated_solar_credit: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=0
    )
    ownership_percentage: Mapped[Decimal] = mapped_column(
        Numeric(7, 3), nullable=False, default=0
    )

    allocation_run: Mapped["AllocationRun"] = relationship(
        back_populates="summaries"
    )
    apartment: Mapped["Apartment"] = relationship(
        back_populates="allocation_summaries"
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"<AllocationSummary run={self.allocation_run_id} "
            f"apartment={self.apartment_id} "
            f"coverage={self.solar_coverage_percentage}>"
        )
