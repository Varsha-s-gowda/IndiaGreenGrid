"""SolarVault battery storage models.

Three concerns are kept separate, mirroring the versioned-configuration pattern
used by BillFair and RoofMax:

* :class:`BatteryConfiguration` stores administrator battery assumptions.  A
  configuration is never edited in place: ``PUT /api/solarvault/configuration``
  appends a new version and deactivates the previous one, so historical
  simulations keep pointing at the parameters they were produced with.
* :class:`BatterySimulation` is an immutable snapshot of one hourly battery
  dispatch over stored SolarTwin readings.  Every energy value is computed in
  Python by :mod:`app.services.battery_engine`.
* :class:`BatteryHourlyRecord` stores the per-interval charge, discharge, SOC,
  grid-import and surplus accounting for one simulation.

All tables are additive.  Parts 1-5 rows are never rewritten or deleted.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.simulation_run import SimulationRun
    from app.models.user import User


class SimulationState:
    """Publishing lifecycle for a stored battery simulation."""

    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"

    ALL = (DRAFT, PUBLISHED)


class BatteryConfiguration(Base):
    """Versioned battery operating assumptions."""

    __tablename__ = "battery_configurations"
    __table_args__ = (
        CheckConstraint(
            "capacity_kwh >= 0",
            name="ck_battery_configurations_capacity_non_negative",
        ),
        CheckConstraint(
            "max_charge_kw >= 0 AND max_discharge_kw >= 0",
            name="ck_battery_configurations_power_non_negative",
        ),
        CheckConstraint(
            "charge_efficiency_pct > 0 AND charge_efficiency_pct <= 100",
            name="ck_battery_configurations_charge_efficiency_range",
        ),
        CheckConstraint(
            "discharge_efficiency_pct > 0 AND discharge_efficiency_pct <= 100",
            name="ck_battery_configurations_discharge_efficiency_range",
        ),
        CheckConstraint(
            "initial_soc_pct >= 0 AND initial_soc_pct <= 100",
            name="ck_battery_configurations_initial_soc_range",
        ),
        CheckConstraint(
            "min_soc_pct >= 0 AND min_soc_pct <= 100",
            name="ck_battery_configurations_min_soc_range",
        ),
        CheckConstraint(
            "max_soc_pct >= 0 AND max_soc_pct <= 100",
            name="ck_battery_configurations_max_soc_range",
        ),
        CheckConstraint(
            "min_soc_pct <= max_soc_pct",
            name="ck_battery_configurations_soc_order",
        ),
        CheckConstraint(
            "initial_soc_pct >= min_soc_pct AND initial_soc_pct <= max_soc_pct",
            name="ck_battery_configurations_initial_within_bounds",
        ),
        Index(
            "ix_battery_configurations_active_created",
            "is_active",
            "created_at",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)

    capacity_kwh: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    max_charge_kw: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    max_discharge_kw: Mapped[Decimal] = mapped_column(
        Numeric(10, 3), nullable=False
    )
    charge_efficiency_pct: Mapped[Decimal] = mapped_column(
        Numeric(6, 3), nullable=False
    )
    discharge_efficiency_pct: Mapped[Decimal] = mapped_column(
        Numeric(6, 3), nullable=False
    )
    initial_soc_pct: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False)
    min_soc_pct: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False)
    max_soc_pct: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False)

    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "users.id",
            name="fk_battery_configurations_created_by",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    created_by: Mapped["User | None"] = relationship(foreign_keys=[created_by_id])
    simulations: Mapped[list["BatterySimulation"]] = relationship(
        back_populates="configuration", passive_deletes=True
    )

    @property
    def usable_capacity_kwh(self) -> float:
        return max(
            0.0,
            float(self.capacity_kwh)
            * (float(self.max_soc_pct) - float(self.min_soc_pct))
            / 100.0,
        )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"<BatteryConfiguration id={self.id} capacity={self.capacity_kwh} "
            f"active={self.is_active}>"
        )


class BatterySimulation(Base):
    """Immutable snapshot of one battery dispatch over stored readings."""

    __tablename__ = "battery_simulations"
    __table_args__ = (
        UniqueConstraint(
            "simulation_code", name="uq_battery_simulations_code"
        ),
        CheckConstraint(
            "status IN ('DRAFT', 'PUBLISHED')",
            name="ck_battery_simulations_status",
        ),
        CheckConstraint(
            "hour_count >= 0",
            name="ck_battery_simulations_hour_count_non_negative",
        ),
        CheckConstraint(
            "capacity_kwh >= 0 AND max_charge_kw >= 0 AND max_discharge_kw >= 0",
            name="ck_battery_simulations_battery_non_negative",
        ),
        CheckConstraint(
            "final_soc_pct >= 0 AND final_soc_pct <= 100",
            name="ck_battery_simulations_final_soc_range",
        ),
        CheckConstraint(
            "grid_import_kwh >= 0 AND baseline_grid_import_kwh >= 0",
            name="ck_battery_simulations_grid_non_negative",
        ),
        Index(
            "ix_battery_simulations_run_created",
            "simulation_run_id",
            "created_at",
        ),
        Index(
            "ix_battery_simulations_status_created",
            "status",
            "created_at",
        ),
        Index("ix_battery_simulations_input_hash", "input_hash"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    simulation_code: Mapped[str] = mapped_column(String(40), nullable=False)
    simulation_run_id: Mapped[int] = mapped_column(
        ForeignKey(
            "simulation_runs.id",
            name="fk_battery_simulations_run",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )
    battery_configuration_id: Mapped[int] = mapped_column(
        ForeignKey(
            "battery_configurations.id",
            name="fk_battery_simulations_configuration",
            ondelete="RESTRICT",
        ),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SimulationState.DRAFT
    )

    period_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    period_end: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    hour_count: Mapped[int] = mapped_column(Integer, nullable=False)
    tariff_price_per_kwh: Mapped[Decimal] = mapped_column(
        Numeric(10, 4), nullable=False, default=0
    )
    tariff_source: Mapped[str] = mapped_column(
        String(40), nullable=False, default="STORED_TARIFF"
    )

    capacity_kwh: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    max_charge_kw: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    max_discharge_kw: Mapped[Decimal] = mapped_column(
        Numeric(10, 3), nullable=False
    )
    charge_efficiency_pct: Mapped[Decimal] = mapped_column(
        Numeric(6, 3), nullable=False
    )
    discharge_efficiency_pct: Mapped[Decimal] = mapped_column(
        Numeric(6, 3), nullable=False
    )
    initial_soc_pct: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False)
    min_soc_pct: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False)
    max_soc_pct: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False)

    initial_stored_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    final_stored_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    initial_soc_actual_pct: Mapped[Decimal] = mapped_column(
        Numeric(7, 4), nullable=False
    )
    final_soc_pct: Mapped[Decimal] = mapped_column(Numeric(7, 4), nullable=False)

    total_solar_generation_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    total_apartment_consumption_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    total_common_consumption_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    total_building_demand_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    direct_solar_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )

    total_charged_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    total_stored_gain_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    total_discharged_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    total_stored_used_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    total_charge_loss_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    total_discharge_loss_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    total_losses_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )

    baseline_grid_import_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    baseline_surplus_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    grid_import_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    remaining_surplus_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    baseline_solar_utilization_pct: Mapped[Decimal] = mapped_column(
        Numeric(7, 4), nullable=False
    )
    solar_utilization_pct: Mapped[Decimal] = mapped_column(
        Numeric(7, 4), nullable=False
    )
    grid_reduction_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    grid_reduction_pct: Mapped[Decimal] = mapped_column(
        Numeric(7, 4), nullable=False
    )
    estimated_savings: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False
    )

    conservation_ok: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    max_conservation_error_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 9), nullable=False, default=0
    )

    assumptions: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    warnings: Mapped[list[Any]] = mapped_column(JSON, nullable=False)
    limitations: Mapped[list[Any]] = mapped_column(JSON, nullable=False)

    algorithm_version: Mapped[str] = mapped_column(String(20), nullable=False)
    input_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "users.id",
            name="fk_battery_simulations_created_by",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )
    published_by_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "users.id",
            name="fk_battery_simulations_published_by",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    simulation_run: Mapped["SimulationRun"] = relationship()
    configuration: Mapped["BatteryConfiguration"] = relationship(
        back_populates="simulations"
    )
    created_by: Mapped["User | None"] = relationship(foreign_keys=[created_by_id])
    published_by: Mapped["User | None"] = relationship(
        foreign_keys=[published_by_id]
    )
    hourly_records: Mapped[list["BatteryHourlyRecord"]] = relationship(
        back_populates="simulation",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="BatteryHourlyRecord.timestamp",
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"<BatterySimulation id={self.id} code={self.simulation_code!r} "
            f"status={self.status}>"
        )


class BatteryHourlyRecord(Base):
    """One hourly battery dispatch interval inside one simulation."""

    __tablename__ = "battery_hourly_records"
    __table_args__ = (
        UniqueConstraint(
            "simulation_id",
            "timestamp",
            name="uq_battery_hourly_records_simulation_timestamp",
        ),
        CheckConstraint(
            "solar_generation_kwh >= 0 AND apartment_consumption_kwh >= 0 "
            "AND common_consumption_kwh >= 0 AND total_demand_kwh >= 0",
            name="ck_battery_hourly_records_source_non_negative",
        ),
        CheckConstraint(
            "direct_solar_kwh >= 0 AND charge_energy_kwh >= 0 "
            "AND discharge_energy_kwh >= 0 AND grid_import_kwh >= 0 "
            "AND surplus_kwh >= 0",
            name="ck_battery_hourly_records_flow_non_negative",
        ),
        CheckConstraint(
            "soc_kwh >= 0 AND soc_percentage >= 0 AND soc_percentage <= 100",
            name="ck_battery_hourly_records_soc_range",
        ),
        CheckConstraint(
            "NOT (charge_energy_kwh > 0 AND discharge_energy_kwh > 0)",
            name="ck_battery_hourly_records_no_simultaneous_flow",
        ),
        Index(
            "ix_battery_hourly_records_simulation_timestamp",
            "simulation_id",
            "timestamp",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    simulation_id: Mapped[int] = mapped_column(
        ForeignKey(
            "battery_simulations.id",
            name="fk_battery_hourly_records_simulation",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    solar_generation_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    apartment_consumption_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    common_consumption_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    total_demand_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )

    direct_solar_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    direct_common_solar_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    direct_apartment_solar_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )

    charge_energy_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    stored_gain_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    discharge_energy_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    stored_used_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    charge_loss_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    discharge_loss_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )

    soc_kwh: Mapped[Decimal] = mapped_column(Numeric(16, 4), nullable=False)
    soc_percentage: Mapped[Decimal] = mapped_column(Numeric(7, 4), nullable=False)

    grid_import_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    surplus_kwh: Mapped[Decimal] = mapped_column(Numeric(16, 4), nullable=False)
    baseline_grid_import_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    baseline_surplus_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )

    simulation: Mapped["BatterySimulation"] = relationship(
        back_populates="hourly_records"
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"<BatteryHourlyRecord simulation={self.simulation_id} "
            f"time={self.timestamp} soc={self.soc_percentage}>"
        )
