"""part5 roofmax capacity planning schema

Revision ID: e5a1c8f4b902
Revises: c4e9b7d2a610
Create Date: 2026-11-10 22:30:00.000000

The migration only creates new tables. Existing Parts 1-4 tables and rows are
left untouched, so billing, allocation, simulation and audit history remain
valid.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5a1c8f4b902"
down_revision: Union[str, None] = "c4e9b7d2a610"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "roof_configurations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("location", sa.String(length=160), nullable=False),
        sa.Column("usable_roof_area_m2", sa.Numeric(12, 2), nullable=False),
        sa.Column("panel_length_m", sa.Numeric(7, 3), nullable=False),
        sa.Column("panel_width_m", sa.Numeric(7, 3), nullable=False),
        sa.Column("panel_capacity_wp", sa.Numeric(10, 2), nullable=False),
        sa.Column("panel_efficiency_pct", sa.Numeric(6, 3), nullable=False),
        sa.Column("performance_ratio_pct", sa.Numeric(6, 3), nullable=False),
        sa.Column("system_loss_pct", sa.Numeric(6, 3), nullable=False),
        sa.Column(
            "solar_irradiation_kwh_m2_day", sa.Numeric(8, 3), nullable=False
        ),
        sa.Column(
            "installation_cost_per_kwp", sa.Numeric(12, 2), nullable=False
        ),
        sa.Column(
            "maintenance_cost_per_kwp_year", sa.Numeric(12, 2), nullable=False
        ),
        sa.Column("tariff_override_per_kwh", sa.Numeric(10, 4), nullable=True),
        sa.Column(
            "tariff_escalation_pct",
            sa.Numeric(6, 3),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "maintenance_escalation_pct",
            sa.Numeric(6, 3),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "conservative_yield_variation_pct",
            sa.Numeric(6, 3),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "conservative_tariff_variation_pct",
            sa.Numeric(6, 3),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "conservative_cost_variation_pct",
            sa.Numeric(6, 3),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "optimistic_yield_variation_pct",
            sa.Numeric(6, 3),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "optimistic_tariff_variation_pct",
            sa.Numeric(6, 3),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "optimistic_cost_variation_pct",
            sa.Numeric(6, 3),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "short_horizon_years",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("10"),
        ),
        sa.Column(
            "long_horizon_years",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("20"),
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "usable_roof_area_m2 > 0",
            name="ck_roof_configurations_area_positive",
        ),
        sa.CheckConstraint(
            "panel_length_m > 0 AND panel_width_m > 0",
            name="ck_roof_configurations_panel_dimensions_positive",
        ),
        sa.CheckConstraint(
            "panel_capacity_wp > 0",
            name="ck_roof_configurations_panel_capacity_positive",
        ),
        sa.CheckConstraint(
            "panel_efficiency_pct > 0 AND panel_efficiency_pct <= 100",
            name="ck_roof_configurations_panel_efficiency_range",
        ),
        sa.CheckConstraint(
            "performance_ratio_pct > 0 AND performance_ratio_pct <= 100",
            name="ck_roof_configurations_performance_ratio_range",
        ),
        sa.CheckConstraint(
            "system_loss_pct >= 0 AND system_loss_pct < 100",
            name="ck_roof_configurations_system_loss_range",
        ),
        sa.CheckConstraint(
            "solar_irradiation_kwh_m2_day > 0",
            name="ck_roof_configurations_irradiation_positive",
        ),
        sa.CheckConstraint(
            "installation_cost_per_kwp >= 0",
            name="ck_roof_configurations_install_cost_non_negative",
        ),
        sa.CheckConstraint(
            "maintenance_cost_per_kwp_year >= 0",
            name="ck_roof_configurations_maintenance_cost_non_negative",
        ),
        sa.CheckConstraint(
            "tariff_override_per_kwh IS NULL OR tariff_override_per_kwh >= 0",
            name="ck_roof_configurations_tariff_override_non_negative",
        ),
        sa.CheckConstraint(
            "tariff_escalation_pct >= 0 AND maintenance_escalation_pct >= 0",
            name="ck_roof_configurations_escalation_non_negative",
        ),
        sa.CheckConstraint(
            "conservative_yield_variation_pct >= 0 "
            "AND optimistic_yield_variation_pct >= 0 "
            "AND conservative_tariff_variation_pct >= 0 "
            "AND optimistic_tariff_variation_pct >= 0 "
            "AND conservative_cost_variation_pct >= 0 "
            "AND optimistic_cost_variation_pct >= 0",
            name="ck_roof_configurations_variation_non_negative",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name="fk_roof_configurations_created_by",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_roof_configurations"),
    )
    op.create_index(
        "ix_roof_configurations_created_by_id",
        "roof_configurations",
        ["created_by_id"],
    )
    op.create_index(
        "ix_roof_configurations_active_created",
        "roof_configurations",
        ["is_active", "created_at"],
    )

    op.create_table(
        "solar_capacity_analyses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("analysis_code", sa.String(length=40), nullable=False),
        sa.Column("simulation_run_id", sa.Integer(), nullable=False),
        sa.Column("roof_configuration_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("demand_start_date", sa.Date(), nullable=False),
        sa.Column("demand_end_date", sa.Date(), nullable=False),
        sa.Column("demand_days", sa.Integer(), nullable=False),
        sa.Column("demand_hour_count", sa.Integer(), nullable=False),
        sa.Column(
            "total_apartment_consumption_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column(
            "total_common_consumption_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column(
            "total_building_demand_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column(
            "average_daily_demand_kwh", sa.Numeric(14, 4), nullable=False
        ),
        sa.Column(
            "average_monthly_demand_kwh", sa.Numeric(14, 4), nullable=False
        ),
        sa.Column("annual_demand_kwh", sa.Numeric(16, 4), nullable=False),
        sa.Column(
            "current_solar_capacity_kwp", sa.Numeric(10, 2), nullable=False
        ),
        sa.Column(
            "existing_solar_generation_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column(
            "existing_solar_utilized_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column(
            "existing_solar_utilization_percentage",
            sa.Numeric(7, 3),
            nullable=False,
        ),
        sa.Column(
            "existing_solar_coverage_percentage",
            sa.Numeric(7, 3),
            nullable=False,
        ),
        sa.Column("required_capacity_kwp", sa.Numeric(10, 3), nullable=False),
        sa.Column(
            "max_installable_capacity_kwp", sa.Numeric(10, 3), nullable=False
        ),
        sa.Column("max_panel_count", sa.Integer(), nullable=False),
        sa.Column("recommended_capacity_kwp", sa.Numeric(10, 3), nullable=False),
        sa.Column("recommended_panel_count", sa.Integer(), nullable=False),
        sa.Column(
            "recommended_daily_generation_kwh",
            sa.Numeric(14, 4),
            nullable=False,
        ),
        sa.Column(
            "recommended_monthly_generation_kwh",
            sa.Numeric(14, 4),
            nullable=False,
        ),
        sa.Column(
            "recommended_annual_generation_kwh",
            sa.Numeric(16, 4),
            nullable=False,
        ),
        sa.Column(
            "recommended_demand_coverage_percentage",
            sa.Numeric(7, 3),
            nullable=False,
        ),
        sa.Column("recommended_surplus_kwh", sa.Numeric(16, 4), nullable=False),
        sa.Column(
            "recommended_grid_dependency_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column(
            "recommended_grid_dependency_percentage",
            sa.Numeric(7, 3),
            nullable=False,
        ),
        sa.Column("installation_cost", sa.Numeric(14, 2), nullable=False),
        sa.Column("annual_savings", sa.Numeric(14, 2), nullable=False),
        sa.Column(
            "annual_maintenance_cost", sa.Numeric(14, 2), nullable=False
        ),
        sa.Column("net_annual_savings", sa.Numeric(14, 2), nullable=False),
        sa.Column("payback_period_years", sa.Numeric(8, 3), nullable=True),
        sa.Column("ten_year_benefit", sa.Numeric(16, 2), nullable=False),
        sa.Column("twenty_year_benefit", sa.Numeric(16, 2), nullable=False),
        sa.Column("roi_percentage", sa.Numeric(10, 3), nullable=False),
        sa.Column("cost_per_kwp", sa.Numeric(12, 2), nullable=False),
        sa.Column("tariff_price_per_kwh", sa.Numeric(10, 4), nullable=False),
        sa.Column("assumptions", sa.JSON(), nullable=False),
        sa.Column("demand_profile", sa.JSON(), nullable=False),
        sa.Column("recommendation_reason", sa.Text(), nullable=False),
        sa.Column("limitations", sa.JSON(), nullable=False),
        sa.Column("algorithm_version", sa.String(length=20), nullable=False),
        sa.Column("input_hash", sa.String(length=64), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("published_by_id", sa.Integer(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "demand_days > 0 AND demand_hour_count > 0",
            name="ck_solar_capacity_analyses_demand_positive",
        ),
        sa.CheckConstraint(
            "total_building_demand_kwh >= 0",
            name="ck_solar_capacity_analyses_demand_non_negative",
        ),
        sa.CheckConstraint(
            "required_capacity_kwp >= 0 AND max_installable_capacity_kwp >= 0",
            name="ck_solar_capacity_analyses_capacity_non_negative",
        ),
        sa.CheckConstraint(
            "recommended_capacity_kwp >= 0 "
            "AND recommended_capacity_kwp <= max_installable_capacity_kwp + 0.01",
            name="ck_solar_capacity_analyses_recommended_within_limit",
        ),
        sa.CheckConstraint(
            "status IN ('DRAFT', 'PUBLISHED')",
            name="ck_solar_capacity_analyses_status",
        ),
        sa.CheckConstraint(
            "demand_end_date >= demand_start_date",
            name="ck_solar_capacity_analyses_period_valid",
        ),
        sa.ForeignKeyConstraint(
            ["simulation_run_id"],
            ["simulation_runs.id"],
            name="fk_solar_capacity_analyses_run",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["roof_configuration_id"],
            ["roof_configurations.id"],
            name="fk_solar_capacity_analyses_configuration",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name="fk_solar_capacity_analyses_created_by",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["published_by_id"],
            ["users.id"],
            name="fk_solar_capacity_analyses_published_by",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_solar_capacity_analyses"),
        sa.UniqueConstraint(
            "analysis_code", name="uq_solar_capacity_analyses_code"
        ),
    )
    op.create_index(
        "ix_solar_capacity_analyses_simulation_run_id",
        "solar_capacity_analyses",
        ["simulation_run_id"],
    )
    op.create_index(
        "ix_solar_capacity_analyses_roof_configuration_id",
        "solar_capacity_analyses",
        ["roof_configuration_id"],
    )
    op.create_index(
        "ix_solar_capacity_analyses_created_by_id",
        "solar_capacity_analyses",
        ["created_by_id"],
    )
    op.create_index(
        "ix_solar_capacity_analyses_published_by_id",
        "solar_capacity_analyses",
        ["published_by_id"],
    )
    op.create_index(
        "ix_solar_capacity_analyses_run_created",
        "solar_capacity_analyses",
        ["simulation_run_id", "created_at"],
    )
    op.create_index(
        "ix_solar_capacity_analyses_status_created",
        "solar_capacity_analyses",
        ["status", "created_at"],
    )
    op.create_index(
        "ix_solar_capacity_analyses_input_hash",
        "solar_capacity_analyses",
        ["input_hash"],
    )

    op.create_table(
        "capacity_scenarios",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("analysis_id", sa.Integer(), nullable=False),
        sa.Column("scenario_type", sa.String(length=20), nullable=False),
        sa.Column("option_label", sa.String(length=60), nullable=False),
        sa.Column("capacity_kwp", sa.Numeric(10, 3), nullable=False),
        sa.Column("panel_count", sa.Integer(), nullable=False),
        sa.Column("is_feasible", sa.Boolean(), nullable=False),
        sa.Column("is_recommended", sa.Boolean(), nullable=False),
        sa.Column("constraint_note", sa.String(length=255), nullable=True),
        sa.Column("daily_generation_kwh", sa.Numeric(14, 4), nullable=False),
        sa.Column("monthly_generation_kwh", sa.Numeric(14, 4), nullable=False),
        sa.Column("annual_generation_kwh", sa.Numeric(16, 4), nullable=False),
        sa.Column("self_consumed_kwh", sa.Numeric(16, 4), nullable=False),
        sa.Column(
            "demand_coverage_percentage", sa.Numeric(7, 3), nullable=False
        ),
        sa.Column("surplus_kwh", sa.Numeric(16, 4), nullable=False),
        sa.Column("grid_dependency_kwh", sa.Numeric(16, 4), nullable=False),
        sa.Column(
            "grid_dependency_percentage", sa.Numeric(7, 3), nullable=False
        ),
        sa.Column("installation_cost", sa.Numeric(14, 2), nullable=False),
        sa.Column("annual_savings", sa.Numeric(14, 2), nullable=False),
        sa.Column(
            "annual_maintenance_cost", sa.Numeric(14, 2), nullable=False
        ),
        sa.Column("net_annual_savings", sa.Numeric(14, 2), nullable=False),
        sa.Column("payback_period_years", sa.Numeric(8, 3), nullable=True),
        sa.Column("ten_year_benefit", sa.Numeric(16, 2), nullable=False),
        sa.Column("twenty_year_benefit", sa.Numeric(16, 2), nullable=False),
        sa.Column("roi_percentage", sa.Numeric(10, 3), nullable=False),
        sa.Column("cost_per_kwp", sa.Numeric(12, 2), nullable=False),
        sa.Column("assumptions", sa.JSON(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "scenario_type IN ('CONSERVATIVE', 'STANDARD', 'OPTIMISTIC')",
            name="ck_capacity_scenarios_type",
        ),
        sa.CheckConstraint(
            "capacity_kwp > 0",
            name="ck_capacity_scenarios_capacity_positive",
        ),
        sa.CheckConstraint(
            "sort_order >= 0",
            name="ck_capacity_scenarios_sort_non_negative",
        ),
        sa.ForeignKeyConstraint(
            ["analysis_id"],
            ["solar_capacity_analyses.id"],
            name="fk_capacity_scenarios_analysis",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_capacity_scenarios"),
        sa.UniqueConstraint(
            "analysis_id",
            "scenario_type",
            "option_label",
            name="uq_capacity_scenarios_analysis_type_option",
        ),
    )
    op.create_index(
        "ix_capacity_scenarios_analysis_id",
        "capacity_scenarios",
        ["analysis_id"],
    )
    op.create_index(
        "ix_capacity_scenarios_analysis_type_order",
        "capacity_scenarios",
        ["analysis_id", "scenario_type", "sort_order"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_capacity_scenarios_analysis_type_order",
        table_name="capacity_scenarios",
    )
    op.drop_index(
        "ix_capacity_scenarios_analysis_id", table_name="capacity_scenarios"
    )
    op.drop_table("capacity_scenarios")

    op.drop_index(
        "ix_solar_capacity_analyses_input_hash",
        table_name="solar_capacity_analyses",
    )
    op.drop_index(
        "ix_solar_capacity_analyses_status_created",
        table_name="solar_capacity_analyses",
    )
    op.drop_index(
        "ix_solar_capacity_analyses_run_created",
        table_name="solar_capacity_analyses",
    )
    op.drop_index(
        "ix_solar_capacity_analyses_published_by_id",
        table_name="solar_capacity_analyses",
    )
    op.drop_index(
        "ix_solar_capacity_analyses_created_by_id",
        table_name="solar_capacity_analyses",
    )
    op.drop_index(
        "ix_solar_capacity_analyses_roof_configuration_id",
        table_name="solar_capacity_analyses",
    )
    op.drop_index(
        "ix_solar_capacity_analyses_simulation_run_id",
        table_name="solar_capacity_analyses",
    )
    op.drop_table("solar_capacity_analyses")

    op.drop_index(
        "ix_roof_configurations_active_created",
        table_name="roof_configurations",
    )
    op.drop_index(
        "ix_roof_configurations_created_by_id",
        table_name="roof_configurations",
    )
    op.drop_table("roof_configurations")
