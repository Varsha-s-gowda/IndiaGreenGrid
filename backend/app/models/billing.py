"""BillFair billing configuration, bills, line items and audit records.

Part 4 deliberately keeps three concerns separate:

* :class:`BillingConfiguration` stores society-level solar credit, maintenance
  and other-charge rules.  Tariffs themselves continue to live in the existing
  ``electricity_tariffs`` table so Parts 1-3 keep their source of truth.
* :class:`Bill` and :class:`BillLineItem` are immutable accounting snapshots.
  Recalculating a bill never overwrites an issued record; the previous version
  is marked ``SUPERSEDED`` and a new version is appended.
* :class:`BillingAudit` is written by the independent audit service.  Audits
  never modify a bill, even when a discrepancy is found.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
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
    from app.models.allocation import AllocationRun
    from app.models.apartment import Apartment
    from app.models.user import User


class BillStatus:
    ISSUED = "ISSUED"
    SUPERSEDED = "SUPERSEDED"
    VOID = "VOID"

    ALL = (ISSUED, SUPERSEDED, VOID)


class BillLineType:
    GRID_CHARGE = "GRID_CHARGE"
    SOLAR_CREDIT = "SOLAR_CREDIT"
    MAINTENANCE = "MAINTENANCE"
    OTHER_CHARGE = "OTHER_CHARGE"

    ALL = (GRID_CHARGE, SOLAR_CREDIT, MAINTENANCE, OTHER_CHARGE)


class AuditStatus:
    PASS = "PASS"
    WARNING = "WARNING"
    FAIL = "FAIL"
    REVIEWED = "REVIEWED"

    ALL = (PASS, WARNING, FAIL, REVIEWED)
    OPEN = (WARNING, FAIL)


class AuditCheckType:
    BILL_RECALCULATION = "BILL_RECALCULATION"
    CONSUMPTION = "CONSUMPTION"
    SOLAR_ALLOCATION = "SOLAR_ALLOCATION"
    GRID_IMPORT = "GRID_IMPORT"
    TARIFF = "TARIFF"
    GRID_CHARGE = "GRID_CHARGE"
    SOLAR_CREDIT = "SOLAR_CREDIT"
    MAINTENANCE = "MAINTENANCE"
    OTHER_CHARGES = "OTHER_CHARGES"
    NET_PAYABLE = "NET_PAYABLE"
    SAVINGS = "SAVINGS"
    LINE_ITEMS = "LINE_ITEMS"
    MISSING_BILL = "MISSING_BILL"
    DUPLICATE_BILL = "DUPLICATE_BILL"

    ALL = (
        BILL_RECALCULATION,
        CONSUMPTION,
        SOLAR_ALLOCATION,
        GRID_IMPORT,
        TARIFF,
        GRID_CHARGE,
        SOLAR_CREDIT,
        MAINTENANCE,
        OTHER_CHARGES,
        NET_PAYABLE,
        SAVINGS,
        LINE_ITEMS,
        MISSING_BILL,
        DUPLICATE_BILL,
    )


class BillingConfiguration(Base):
    """Society billing rules that are configurable in PostgreSQL.

    The row effective on a billing day supplies the solar credit rate for that
    day.  Maintenance and other charges are monthly amounts and are prorated by
    calendar day across a billing period.
    """

    __tablename__ = "billing_configurations"
    __table_args__ = (
        UniqueConstraint(
            "effective_from",
            name="uq_billing_configurations_effective_from",
        ),
        CheckConstraint(
            "solar_credit_rate_per_kwh >= 0",
            name="ck_billing_configurations_credit_rate_non_negative",
        ),
        CheckConstraint(
            "maintenance_charge >= 0 AND other_charges >= 0",
            name="ck_billing_configurations_charges_non_negative",
        ),
        CheckConstraint(
            "effective_to IS NULL OR effective_to >= effective_from",
            name="ck_billing_configurations_valid_period",
        ),
        Index("ix_billing_configurations_effective", "effective_from", "effective_to"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(
        String(120), nullable=False, default="Society billing rules"
    )
    solar_credit_rate_per_kwh: Mapped[Decimal] = mapped_column(
        Numeric(10, 4), nullable=False
    )
    maintenance_charge: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=0
    )
    other_charges: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=0
    )
    other_charges_description: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    effective_from: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    bills: Mapped[list["Bill"]] = relationship(back_populates="configuration")

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"<BillingConfiguration id={self.id} credit={self.solar_credit_rate_per_kwh} "
            f"from={self.effective_from}>"
        )


class Bill(Base):
    __tablename__ = "bills"
    __table_args__ = (
        UniqueConstraint("bill_number", name="uq_bills_bill_number"),
        UniqueConstraint(
            "apartment_id",
            "billing_period_start",
            "billing_period_end",
            "allocation_run_id",
            "version",
            name="uq_bills_apartment_period_run_version",
        ),
        CheckConstraint(
            "billing_period_end >= billing_period_start",
            name="ck_bills_period_valid",
        ),
        CheckConstraint("version >= 1", name="ck_bills_version_positive"),
        CheckConstraint(
            "status IN ('ISSUED', 'SUPERSEDED', 'VOID')",
            name="ck_bills_status",
        ),
        CheckConstraint(
            "consumption_kwh >= 0 AND solar_allocation_kwh >= 0 "
            "AND grid_import_kwh >= 0",
            name="ck_bills_energy_non_negative",
        ),
        CheckConstraint(
            "solar_allocation_kwh <= consumption_kwh + 0.000001",
            name="ck_bills_allocation_within_consumption",
        ),
        CheckConstraint(
            "solar_coverage_percentage >= 0 AND solar_coverage_percentage <= 100",
            name="ck_bills_coverage_range",
        ),
        CheckConstraint(
            "grid_charge >= 0 AND solar_credit >= 0 AND maintenance_charge >= 0 "
            "AND other_charges >= 0",
            name="ck_bills_charges_non_negative",
        ),
        CheckConstraint("hour_count >= 0", name="ck_bills_hour_count_non_negative"),
        Index("ix_bills_apartment_period", "apartment_id", "billing_period_start"),
        Index("ix_bills_status_current", "status", "is_current"),
        Index("ix_bills_allocation_run", "allocation_run_id"),
        Index("ix_bills_billing_period", "billing_period_start", "billing_period_end"),
        Index("ix_bills_generated_at", "generated_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    bill_number: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    apartment_id: Mapped[int] = mapped_column(
        ForeignKey("apartments.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    allocation_run_id: Mapped[int] = mapped_column(
        ForeignKey("allocation_runs.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    simulation_run_id: Mapped[int] = mapped_column(
        ForeignKey("simulation_runs.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    billing_configuration_id: Mapped[int | None] = mapped_column(
        ForeignKey("billing_configurations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    allocation_method: Mapped[str] = mapped_column(String(30), nullable=False)
    billing_period_start: Mapped[date] = mapped_column(Date, nullable=False)
    billing_period_end: Mapped[date] = mapped_column(Date, nullable=False)
    billing_period_label: Mapped[str] = mapped_column(String(60), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=BillStatus.ISSUED
    )
    is_current: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    supersedes_bill_id: Mapped[int | None] = mapped_column(
        ForeignKey("bills.id", ondelete="SET NULL"), nullable=True
    )

    consumption_kwh: Mapped[Decimal] = mapped_column(Numeric(16, 6), nullable=False)
    solar_allocation_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 6), nullable=False
    )
    grid_import_kwh: Mapped[Decimal] = mapped_column(Numeric(16, 6), nullable=False)
    solar_coverage_percentage: Mapped[Decimal] = mapped_column(
        Numeric(7, 3), nullable=False, default=0
    )
    tariff_price_per_kwh: Mapped[Decimal] = mapped_column(
        Numeric(10, 4), nullable=False, default=0
    )
    solar_credit_rate_per_kwh: Mapped[Decimal] = mapped_column(
        Numeric(10, 4), nullable=False, default=0
    )

    grid_charge: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    solar_credit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    maintenance_charge: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=0
    )
    other_charges: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=0
    )
    other_charges_description: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    net_payable: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    no_solar_baseline_cost: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False
    )
    actual_estimated_cost: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False
    )
    estimated_savings: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False
    )

    tariff_snapshot: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    charge_snapshot: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )
    hour_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    algorithm_version: Mapped[str] = mapped_column(String(20), nullable=False)
    input_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    issued_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    apartment: Mapped["Apartment"] = relationship(back_populates="bills")
    allocation_run: Mapped["AllocationRun"] = relationship(back_populates="bills")
    configuration: Mapped["BillingConfiguration | None"] = relationship(
        back_populates="bills"
    )
    generated_by: Mapped["User | None"] = relationship(
        foreign_keys=[generated_by_id]
    )
    line_items: Mapped[list["BillLineItem"]] = relationship(
        back_populates="bill",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="BillLineItem.sort_order",
    )
    audits: Mapped[list["BillingAudit"]] = relationship(
        back_populates="bill",
        passive_deletes=True,
    )
    supersedes: Mapped["Bill | None"] = relationship(
        remote_side="Bill.id", foreign_keys=[supersedes_bill_id]
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"<Bill id={self.id} number={self.bill_number!r} "
            f"apartment={self.apartment_id} v{self.version} {self.status}>"
        )


class BillLineItem(Base):
    __tablename__ = "bill_line_items"
    __table_args__ = (
        UniqueConstraint(
            "bill_id",
            "charge_type",
            "sort_order",
            name="uq_bill_line_items_bill_type_order",
        ),
        CheckConstraint(
            "charge_type IN ('GRID_CHARGE', 'SOLAR_CREDIT', 'MAINTENANCE', "
            "'OTHER_CHARGE')",
            name="ck_bill_line_items_charge_type",
        ),
        CheckConstraint("quantity >= 0", name="ck_bill_line_items_quantity_non_negative"),
        CheckConstraint("rate >= 0", name="ck_bill_line_items_rate_non_negative"),
        Index("ix_bill_line_items_bill", "bill_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    bill_id: Mapped[int] = mapped_column(
        ForeignKey("bills.id", ondelete="CASCADE"), nullable=False, index=True
    )
    charge_type: Mapped[str] = mapped_column(String(30), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(16, 6), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False, default="kWh")
    rate: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    bill: Mapped["Bill"] = relationship(back_populates="line_items")

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"<BillLineItem bill={self.bill_id} type={self.charge_type!r} "
            f"amount={self.amount}>"
        )


class BillingAudit(Base):
    __tablename__ = "billing_audits"
    __table_args__ = (
        CheckConstraint(
            "status IN ('PASS', 'WARNING', 'FAIL', 'REVIEWED')",
            name="ck_billing_audits_status",
        ),
        CheckConstraint(
            "severity IN ('INFO', 'WARNING', 'ERROR')",
            name="ck_billing_audits_severity",
        ),
        Index("ix_billing_audits_batch", "audit_batch_id"),
        Index("ix_billing_audits_status", "status"),
        Index("ix_billing_audits_bill", "bill_id"),
        Index("ix_billing_audits_apartment_period", "apartment_id", "billing_period_start"),
        Index("ix_billing_audits_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    audit_batch_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    bill_id: Mapped[int | None] = mapped_column(
        ForeignKey("bills.id", ondelete="SET NULL"), nullable=True, index=True
    )
    apartment_id: Mapped[int | None] = mapped_column(
        ForeignKey("apartments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    allocation_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("allocation_runs.id", ondelete="SET NULL"), nullable=True
    )
    billing_period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    billing_period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    check_type: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="INFO")
    expected_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 2), nullable=True
    )
    calculated_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 2), nullable=True
    )
    discrepancy: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    reviewed_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    bill: Mapped["Bill | None"] = relationship(back_populates="audits")
    apartment: Mapped["Apartment | None"] = relationship()
    created_by: Mapped["User | None"] = relationship(foreign_keys=[created_by_id])
    reviewed_by: Mapped["User | None"] = relationship(foreign_keys=[reviewed_by_id])

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"<BillingAudit id={self.id} batch={self.audit_batch_id!r} "
            f"type={self.check_type!r} status={self.status}>"
        )
