"""RoofMax rooftop capacity planning models.

Part 5 keeps three concerns separate:

* :class:`RoofConfiguration` stores the administrator's planning assumptions
  (roof area, panel geometry, irradiation, costs and scenario variations).  A
  configuration is never edited in place: ``PUT /api/roofmax/configuration``
  appends a new version and marks the previous version inactive, so historical
  analyses keep pointing at the assumptions they were produced with.
* :class:`SolarCapacityAnalysis` is an immutable snapshot of one optimisation
  run over stored SolarTwin demand.  All energy and money values are computed
  in Python by :mod:`app.services.solar_optimization`.
* :class:`CapacityScenario` stores each evaluated capacity option for the
  conservative, standard and optimistic assumption sets.
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
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.simulation_run import SimulationRun
    from app.models.user import User


class AnalysisStatus:
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"

    ALL = (DRAFT, PUBLISHED)


class ScenarioType:
    CONSERVATIVE = "CONSERVATIVE"
    STANDARD = "STANDARD"
    OPTIMISTIC = "OPTIMISTIC"

    ALL = (CONSERVATIVE, STANDARD, OPTIMISTIC)
    LABELS = {
        CONSERVATIVE: "Conservative",
        STANDARD: "Standard",
        OPTIMISTIC: "Optimistic",
    }


class RoofConfiguration(Base):
    """Versioned rooftop and financial planning assumptions."""

    __tablename__ = "roof_configurations"
    __table_args__ = (
        CheckConstraint(
            "usable_roof_area_m2 > 0",
            name="ck_roof_configurations_area_positive",
        ),
        CheckConstraint(
            "panel_length_m > 0 AND panel_width_m > 0",
            name="ck_roof_configurations_panel_dimensions_positive",
        ),
        CheckConstraint(
            "panel_capacity_wp > 0",
            name="ck_roof_configurations_panel_capacity_positive",
        ),
        CheckConstraint(
            "panel_efficiency_pct > 0 AND panel_efficiency_pct <= 100",
            name="ck_roof_configurations_panel_efficiency_range",
        ),
        CheckConstraint(
            "performance_ratio_pct > 0 AND performance_ratio_pct <= 100",
            name="ck_roof_configurations_performance_ratio_range",
        ),
        CheckConstraint(
            "system_loss_pct >= 0 AND system_loss_pct < 100",
            name="ck_roof_configurations_system_loss_range",
        ),
        CheckConstraint(
            "solar_irradiation_kwh_m2_day > 0",
            name="ck_roof_configurations_irradiation_positive",
        ),
        CheckConstraint(
            "installation_cost_per_kwp >= 0",
            name="ck_roof_configurations_install_cost_non_negative",
        ),
        CheckConstraint(
            "maintenance_cost_per_kwp_year >= 0",
            name="ck_roof_configurations_maintenance_cost_non_negative",
        ),
        CheckConstraint(
            "tariff_override_per_kwh IS NULL OR tariff_override_per_kwh >= 0",
            name="ck_roof_configurations_tariff_override_non_negative",
        ),
        CheckConstraint(
            "tariff_escalation_pct >= 0 AND maintenance_escalation_pct >= 0",
            name="ck_roof_configurations_escalation_non_negative",
        ),
        CheckConstraint(
            "conservative_yield_variation_pct >= 0 "
            "AND optimistic_yield_variation_pct >= 0 "
            "AND conservative_tariff_variation_pct >= 0 "
            "AND optimistic_tariff_variation_pct >= 0 "
            "AND conservative_cost_variation_pct >= 0 "
            "AND optimistic_cost_variation_pct >= 0",
            name="ck_roof_configurations_variation_non_negative",
        ),
        Index("ix_roof_configurations_active_created", "is_active", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    location: Mapped[str] = mapped_column(String(160), nullable=False)

    usable_roof_area_m2: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    panel_length_m: Mapped[Decimal] = mapped_column(Numeric(7, 3), nullable=False)
    panel_width_m: Mapped[Decimal] = mapped_column(Numeric(7, 3), nullable=False)
    panel_capacity_wp: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    panel_efficiency_pct: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False)

    performance_ratio_pct: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False)
    system_loss_pct: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False)
    solar_irradiation_kwh_m2_day: Mapped[Decimal] = mapped_column(
        Numeric(8, 3), nullable=False
    )

    installation_cost_per_kwp: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False
    )
    maintenance_cost_per_kwp_year: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False
    )
    tariff_override_per_kwh: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 4), nullable=True
    )
    tariff_escalation_pct: Mapped[Decimal] = mapped_column(
        Numeric(6, 3), nullable=False, default=0
    )
    maintenance_escalation_pct: Mapped[Decimal] = mapped_column(
        Numeric(6, 3), nullable=False, default=0
    )

    conservative_yield_variation_pct: Mapped[Decimal] = mapped_column(
        Numeric(6, 3), nullable=False, default=0
    )
    conservative_tariff_variation_pct: Mapped[Decimal] = mapped_column(
        Numeric(6, 3), nullable=False, default=0
    )
    conservative_cost_variation_pct: Mapped[Decimal] = mapped_column(
        Numeric(6, 3), nullable=False, default=0
    )
    optimistic_yield_variation_pct: Mapped[Decimal] = mapped_column(
        Numeric(6, 3), nullable=False, default=0
    )
    optimistic_tariff_variation_pct: Mapped[Decimal] = mapped_column(
        Numeric(6, 3), nullable=False, default=0
    )
    optimistic_cost_variation_pct: Mapped[Decimal] = mapped_column(
        Numeric(6, 3), nullable=False, default=0
    )

    short_horizon_years: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    long_horizon_years: Mapped[int] = mapped_column(Integer, nullable=False, default=20)

    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "users.id",
            name="fk_roof_configurations_created_by",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    created_by: Mapped["User | None"] = relationship(foreign_keys=[created_by_id])
    analyses: Mapped[list["SolarCapacityAnalysis"]] = relationship(
        back_populates="configuration", passive_deletes=True
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"<RoofConfiguration id={self.id} area={self.usable_roof_area_m2} "
            f"active={self.is_active}>"
        )


class SolarCapacityAnalysis(Base):
    """Immutable snapshot of one RoofMax optimisation over stored demand."""

    __tablename__ = "solar_capacity_analyses"
    __table_args__ = (
        UniqueConstraint("analysis_code", name="uq_solar_capacity_analyses_code"),
        CheckConstraint(
            "demand_days > 0 AND demand_hour_count > 0",
            name="ck_solar_capacity_analyses_demand_positive",
        ),
        CheckConstraint(
            "total_building_demand_kwh >= 0",
            name="ck_solar_capacity_analyses_demand_non_negative",
        ),
        CheckConstraint(
            "required_capacity_kwp >= 0 AND max_installable_capacity_kwp >= 0",
            name="ck_solar_capacity_analyses_capacity_non_negative",
        ),
        CheckConstraint(
            "recommended_capacity_kwp >= 0 "
            "AND recommended_capacity_kwp <= max_installable_capacity_kwp + 0.01",
            name="ck_solar_capacity_analyses_recommended_within_limit",
        ),
        CheckConstraint(
            "status IN ('DRAFT', 'PUBLISHED')",
            name="ck_solar_capacity_analyses_status",
        ),
        CheckConstraint(
            "demand_end_date >= demand_start_date",
            name="ck_solar_capacity_analyses_period_valid",
        ),
        Index(
            "ix_solar_capacity_analyses_run_created",
            "simulation_run_id",
            "created_at",
        ),
        Index(
            "ix_solar_capacity_analyses_status_created",
            "status",
            "created_at",
        ),
        Index("ix_solar_capacity_analyses_input_hash", "input_hash"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    analysis_code: Mapped[str] = mapped_column(String(40), nullable=False)
    simulation_run_id: Mapped[int] = mapped_column(
        ForeignKey(
            "simulation_runs.id",
            name="fk_solar_capacity_analyses_run",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )
    roof_configuration_id: Mapped[int] = mapped_column(
        ForeignKey(
            "roof_configurations.id",
            name="fk_solar_capacity_analyses_configuration",
            ondelete="RESTRICT",
        ),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=AnalysisStatus.DRAFT
    )

    demand_start_date: Mapped[date] = mapped_column(Date, nullable=False)
    demand_end_date: Mapped[date] = mapped_column(Date, nullable=False)
    demand_days: Mapped[int] = mapped_column(Integer, nullable=False)
    demand_hour_count: Mapped[int] = mapped_column(Integer, nullable=False)

    total_apartment_consumption_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    total_common_consumption_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    total_building_demand_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    average_daily_demand_kwh: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False
    )
    average_monthly_demand_kwh: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False
    )
    annual_demand_kwh: Mapped[Decimal] = mapped_column(Numeric(16, 4), nullable=False)

    current_solar_capacity_kwp: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    existing_solar_generation_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    existing_solar_utilized_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    existing_solar_utilization_percentage: Mapped[Decimal] = mapped_column(
        Numeric(7, 3), nullable=False
    )
    existing_solar_coverage_percentage: Mapped[Decimal] = mapped_column(
        Numeric(7, 3), nullable=False
    )

    required_capacity_kwp: Mapped[Decimal] = mapped_column(
        Numeric(10, 3), nullable=False
    )
    max_installable_capacity_kwp: Mapped[Decimal] = mapped_column(
        Numeric(10, 3), nullable=False
    )
    max_panel_count: Mapped[int] = mapped_column(Integer, nullable=False)

    recommended_capacity_kwp: Mapped[Decimal] = mapped_column(
        Numeric(10, 3), nullable=False
    )
    recommended_panel_count: Mapped[int] = mapped_column(Integer, nullable=False)
    recommended_daily_generation_kwh: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False
    )
    recommended_monthly_generation_kwh: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False
    )
    recommended_annual_generation_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    recommended_demand_coverage_percentage: Mapped[Decimal] = mapped_column(
        Numeric(7, 3), nullable=False
    )
    recommended_surplus_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    recommended_grid_dependency_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    recommended_grid_dependency_percentage: Mapped[Decimal] = mapped_column(
        Numeric(7, 3), nullable=False
    )

    installation_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    annual_savings: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    annual_maintenance_cost: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False
    )
    net_annual_savings: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False
    )
    payback_period_years: Mapped[Decimal | None] = mapped_column(
        Numeric(8, 3), nullable=True
    )
    ten_year_benefit: Mapped[Decimal] = mapped_column(Numeric(16, 2), nullable=False)
    twenty_year_benefit: Mapped[Decimal] = mapped_column(Numeric(16, 2), nullable=False)
    roi_percentage: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    cost_per_kwp: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    tariff_price_per_kwh: Mapped[Decimal] = mapped_column(
        Numeric(10, 4), nullable=False
    )

    assumptions: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    demand_profile: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    recommendation_reason: Mapped[str] = mapped_column(Text, nullable=False)
    limitations: Mapped[list[Any]] = mapped_column(JSON, nullable=False)

    algorithm_version: Mapped[str] = mapped_column(String(20), nullable=False)
    input_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "users.id",
            name="fk_solar_capacity_analyses_created_by",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )
    published_by_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "users.id",
            name="fk_solar_capacity_analyses_published_by",
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
    configuration: Mapped["RoofConfiguration"] = relationship(
        back_populates="analyses"
    )
    created_by: Mapped["User | None"] = relationship(foreign_keys=[created_by_id])
    published_by: Mapped["User | None"] = relationship(
        foreign_keys=[published_by_id]
    )
    scenarios: Mapped[list["CapacityScenario"]] = relationship(
        back_populates="analysis",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="CapacityScenario.sort_order",
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"<SolarCapacityAnalysis id={self.id} code={self.analysis_code!r} "
            f"recommended={self.recommended_capacity_kwp} kWp>"
        )


class CapacityScenario(Base):
    """One evaluated capacity option inside one assumption scenario."""

    __tablename__ = "capacity_scenarios"
    __table_args__ = (
        CheckConstraint(
            "scenario_type IN ('CONSERVATIVE', 'STANDARD', 'OPTIMISTIC')",
            name="ck_capacity_scenarios_type",
        ),
        CheckConstraint(
            "capacity_kwp > 0",
            name="ck_capacity_scenarios_capacity_positive",
        ),
        CheckConstraint(
            "sort_order >= 0",
            name="ck_capacity_scenarios_sort_non_negative",
        ),
        UniqueConstraint(
            "analysis_id",
            "scenario_type",
            "option_label",
            name="uq_capacity_scenarios_analysis_type_option",
        ),
        Index(
            "ix_capacity_scenarios_analysis_type_order",
            "analysis_id",
            "scenario_type",
            "sort_order",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    analysis_id: Mapped[int] = mapped_column(
        ForeignKey(
            "solar_capacity_analyses.id",
            name="fk_capacity_scenarios_analysis",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )
    scenario_type: Mapped[str] = mapped_column(String(20), nullable=False)
    option_label: Mapped[str] = mapped_column(String(60), nullable=False)
    capacity_kwp: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    panel_count: Mapped[int] = mapped_column(Integer, nullable=False)
    is_feasible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_recommended: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    constraint_note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    daily_generation_kwh: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    monthly_generation_kwh: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False
    )
    annual_generation_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    self_consumed_kwh: Mapped[Decimal] = mapped_column(Numeric(16, 4), nullable=False)
    demand_coverage_percentage: Mapped[Decimal] = mapped_column(
        Numeric(7, 3), nullable=False
    )
    surplus_kwh: Mapped[Decimal] = mapped_column(Numeric(16, 4), nullable=False)
    grid_dependency_kwh: Mapped[Decimal] = mapped_column(
        Numeric(16, 4), nullable=False
    )
    grid_dependency_percentage: Mapped[Decimal] = mapped_column(
        Numeric(7, 3), nullable=False
    )

    installation_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    annual_savings: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    annual_maintenance_cost: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False
    )
    net_annual_savings: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False
    )
    payback_period_years: Mapped[Decimal | None] = mapped_column(
        Numeric(8, 3), nullable=True
    )
    ten_year_benefit: Mapped[Decimal] = mapped_column(Numeric(16, 2), nullable=False)
    twenty_year_benefit: Mapped[Decimal] = mapped_column(Numeric(16, 2), nullable=False)
    roi_percentage: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    cost_per_kwp: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    assumptions: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    analysis: Mapped["SolarCapacityAnalysis"] = relationship(
        back_populates="scenarios"
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"<CapacityScenario analysis={self.analysis_id} "
            f"type={self.scenario_type!r} capacity={self.capacity_kwp}>"
        )
