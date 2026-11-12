"""part6 SolarVault battery storage schema

Revision ID: f7b2d9c3a15e
Revises: e5a1c8f4b902
Create Date: 2026-11-10 23:30:00.000000

The migration only creates new tables. Existing Parts 1-5 tables and rows are
left untouched, so simulation, allocation, billing and RoofMax history remain
valid.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f7b2d9c3a15e"
down_revision: Union[str, None] = "e5a1c8f4b902"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "battery_configurations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("capacity_kwh", sa.Numeric(10, 3), nullable=False),
        sa.Column("max_charge_kw", sa.Numeric(10, 3), nullable=False),
        sa.Column("max_discharge_kw", sa.Numeric(10, 3), nullable=False),
        sa.Column(
            "charge_efficiency_pct", sa.Numeric(6, 3), nullable=False
        ),
        sa.Column(
            "discharge_efficiency_pct", sa.Numeric(6, 3), nullable=False
        ),
        sa.Column("initial_soc_pct", sa.Numeric(6, 3), nullable=False),
        sa.Column("min_soc_pct", sa.Numeric(6, 3), nullable=False),
        sa.Column("max_soc_pct", sa.Numeric(6, 3), nullable=False),
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
            "capacity_kwh >= 0",
            name="ck_battery_configurations_capacity_non_negative",
        ),
        sa.CheckConstraint(
            "max_charge_kw >= 0 AND max_discharge_kw >= 0",
            name="ck_battery_configurations_power_non_negative",
        ),
        sa.CheckConstraint(
            "charge_efficiency_pct > 0 AND charge_efficiency_pct <= 100",
            name="ck_battery_configurations_charge_efficiency_range",
        ),
        sa.CheckConstraint(
            "discharge_efficiency_pct > 0 AND discharge_efficiency_pct <= 100",
            name="ck_battery_configurations_discharge_efficiency_range",
        ),
        sa.CheckConstraint(
            "initial_soc_pct >= 0 AND initial_soc_pct <= 100",
            name="ck_battery_configurations_initial_soc_range",
        ),
        sa.CheckConstraint(
            "min_soc_pct >= 0 AND min_soc_pct <= 100",
            name="ck_battery_configurations_min_soc_range",
        ),
        sa.CheckConstraint(
            "max_soc_pct >= 0 AND max_soc_pct <= 100",
            name="ck_battery_configurations_max_soc_range",
        ),
        sa.CheckConstraint(
            "min_soc_pct <= max_soc_pct",
            name="ck_battery_configurations_soc_order",
        ),
        sa.CheckConstraint(
            "initial_soc_pct >= min_soc_pct AND initial_soc_pct <= max_soc_pct",
            name="ck_battery_configurations_initial_within_bounds",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name="fk_battery_configurations_created_by",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_battery_configurations_created_by_id",
        "battery_configurations",
        ["created_by_id"],
    )
    op.create_index(
        "ix_battery_configurations_active_created",
        "battery_configurations",
        ["is_active", "created_at"],
    )

    op.create_table(
        "battery_simulations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("simulation_code", sa.String(length=40), nullable=False),
        sa.Column("simulation_run_id", sa.Integer(), nullable=False),
        sa.Column("battery_configuration_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column(
            "period_start", sa.DateTime(timezone=True), nullable=False
        ),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("hour_count", sa.Integer(), nullable=False),
        sa.Column(
            "tariff_price_per_kwh", sa.Numeric(10, 4), nullable=False
        ),
        sa.Column(
            "tariff_source",
            sa.String(length=40),
            nullable=False,
            server_default=sa.text("'STORED_TARIFF'"),
        ),
        sa.Column("capacity_kwh", sa.Numeric(10, 3), nullable=False),
        sa.Column("max_charge_kw", sa.Numeric(10, 3), nullable=False),
        sa.Column("max_discharge_kw", sa.Numeric(10, 3), nullable=False),
        sa.Column(
            "charge_efficiency_pct", sa.Numeric(6, 3), nullable=False
        ),
        sa.Column(
            "discharge_efficiency_pct", sa.Numeric(6, 3), nullable=False
        ),
        sa.Column("initial_soc_pct", sa.Numeric(6, 3), nullable=False),
        sa.Column("min_soc_pct", sa.Numeric(6, 3), nullable=False),
        sa.Column("max_soc_pct", sa.Numeric(6, 3), nullable=False),
        sa.Column(
            "initial_stored_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column("final_stored_kwh", sa.Numeric(16, 4), nullable=False),
        sa.Column(
            "initial_soc_actual_pct", sa.Numeric(7, 4), nullable=False
        ),
        sa.Column("final_soc_pct", sa.Numeric(7, 4), nullable=False),
        sa.Column(
            "total_solar_generation_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column(
            "total_apartment_consumption_kwh",
            sa.Numeric(16, 4),
            nullable=False,
        ),
        sa.Column(
            "total_common_consumption_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column(
            "total_building_demand_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column("direct_solar_kwh", sa.Numeric(16, 4), nullable=False),
        sa.Column("total_charged_kwh", sa.Numeric(16, 4), nullable=False),
        sa.Column(
            "total_stored_gain_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column(
            "total_discharged_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column(
            "total_stored_used_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column(
            "total_charge_loss_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column(
            "total_discharge_loss_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column("total_losses_kwh", sa.Numeric(16, 4), nullable=False),
        sa.Column(
            "baseline_grid_import_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column(
            "baseline_surplus_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column("grid_import_kwh", sa.Numeric(16, 4), nullable=False),
        sa.Column(
            "remaining_surplus_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column(
            "baseline_solar_utilization_pct",
            sa.Numeric(7, 4),
            nullable=False,
        ),
        sa.Column(
            "solar_utilization_pct", sa.Numeric(7, 4), nullable=False
        ),
        sa.Column(
            "grid_reduction_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column("grid_reduction_pct", sa.Numeric(7, 4), nullable=False),
        sa.Column("estimated_savings", sa.Numeric(14, 2), nullable=False),
        sa.Column(
            "conservation_ok",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "max_conservation_error_kwh",
            sa.Numeric(16, 9),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("assumptions", sa.JSON(), nullable=False),
        sa.Column("warnings", sa.JSON(), nullable=False),
        sa.Column("limitations", sa.JSON(), nullable=False),
        sa.Column(
            "algorithm_version", sa.String(length=20), nullable=False
        ),
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
            "status IN ('DRAFT', 'PUBLISHED')",
            name="ck_battery_simulations_status",
        ),
        sa.CheckConstraint(
            "hour_count >= 0",
            name="ck_battery_simulations_hour_count_non_negative",
        ),
        sa.CheckConstraint(
            "capacity_kwh >= 0 AND max_charge_kw >= 0 AND max_discharge_kw >= 0",
            name="ck_battery_simulations_battery_non_negative",
        ),
        sa.CheckConstraint(
            "final_soc_pct >= 0 AND final_soc_pct <= 100",
            name="ck_battery_simulations_final_soc_range",
        ),
        sa.CheckConstraint(
            "grid_import_kwh >= 0 AND baseline_grid_import_kwh >= 0",
            name="ck_battery_simulations_grid_non_negative",
        ),
        sa.ForeignKeyConstraint(
            ["simulation_run_id"],
            ["simulation_runs.id"],
            name="fk_battery_simulations_run",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["battery_configuration_id"],
            ["battery_configurations.id"],
            name="fk_battery_simulations_configuration",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name="fk_battery_simulations_created_by",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["published_by_id"],
            ["users.id"],
            name="fk_battery_simulations_published_by",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "simulation_code", name="uq_battery_simulations_code"
        ),
    )
    op.create_index(
        "ix_battery_simulations_simulation_run_id",
        "battery_simulations",
        ["simulation_run_id"],
    )
    op.create_index(
        "ix_battery_simulations_battery_configuration_id",
        "battery_simulations",
        ["battery_configuration_id"],
    )
    op.create_index(
        "ix_battery_simulations_created_by_id",
        "battery_simulations",
        ["created_by_id"],
    )
    op.create_index(
        "ix_battery_simulations_published_by_id",
        "battery_simulations",
        ["published_by_id"],
    )
    op.create_index(
        "ix_battery_simulations_run_created",
        "battery_simulations",
        ["simulation_run_id", "created_at"],
    )
    op.create_index(
        "ix_battery_simulations_status_created",
        "battery_simulations",
        ["status", "created_at"],
    )
    op.create_index(
        "ix_battery_simulations_input_hash",
        "battery_simulations",
        ["input_hash"],
    )

    op.create_table(
        "battery_hourly_records",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("simulation_id", sa.Integer(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "solar_generation_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column(
            "apartment_consumption_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column(
            "common_consumption_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column("total_demand_kwh", sa.Numeric(16, 4), nullable=False),
        sa.Column("direct_solar_kwh", sa.Numeric(16, 4), nullable=False),
        sa.Column(
            "direct_common_solar_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column(
            "direct_apartment_solar_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column("charge_energy_kwh", sa.Numeric(16, 4), nullable=False),
        sa.Column("stored_gain_kwh", sa.Numeric(16, 4), nullable=False),
        sa.Column(
            "discharge_energy_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column("stored_used_kwh", sa.Numeric(16, 4), nullable=False),
        sa.Column("charge_loss_kwh", sa.Numeric(16, 4), nullable=False),
        sa.Column("discharge_loss_kwh", sa.Numeric(16, 4), nullable=False),
        sa.Column("soc_kwh", sa.Numeric(16, 4), nullable=False),
        sa.Column("soc_percentage", sa.Numeric(7, 4), nullable=False),
        sa.Column("grid_import_kwh", sa.Numeric(16, 4), nullable=False),
        sa.Column("surplus_kwh", sa.Numeric(16, 4), nullable=False),
        sa.Column(
            "baseline_grid_import_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.Column(
            "baseline_surplus_kwh", sa.Numeric(16, 4), nullable=False
        ),
        sa.CheckConstraint(
            "solar_generation_kwh >= 0 AND apartment_consumption_kwh >= 0 "
            "AND common_consumption_kwh >= 0 AND total_demand_kwh >= 0",
            name="ck_battery_hourly_records_source_non_negative",
        ),
        sa.CheckConstraint(
            "direct_solar_kwh >= 0 AND charge_energy_kwh >= 0 "
            "AND discharge_energy_kwh >= 0 AND grid_import_kwh >= 0 "
            "AND surplus_kwh >= 0",
            name="ck_battery_hourly_records_flow_non_negative",
        ),
        sa.CheckConstraint(
            "soc_kwh >= 0 AND soc_percentage >= 0 AND soc_percentage <= 100",
            name="ck_battery_hourly_records_soc_range",
        ),
        sa.CheckConstraint(
            "NOT (charge_energy_kwh > 0 AND discharge_energy_kwh > 0)",
            name="ck_battery_hourly_records_no_simultaneous_flow",
        ),
        sa.ForeignKeyConstraint(
            ["simulation_id"],
            ["battery_simulations.id"],
            name="fk_battery_hourly_records_simulation",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "simulation_id",
            "timestamp",
            name="uq_battery_hourly_records_simulation_timestamp",
        ),
    )
    op.create_index(
        "ix_battery_hourly_records_simulation_id",
        "battery_hourly_records",
        ["simulation_id"],
    )
    op.create_index(
        "ix_battery_hourly_records_simulation_timestamp",
        "battery_hourly_records",
        ["simulation_id", "timestamp"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_battery_hourly_records_simulation_timestamp",
        table_name="battery_hourly_records",
    )
    op.drop_index(
        "ix_battery_hourly_records_simulation_id",
        table_name="battery_hourly_records",
    )
    op.drop_table("battery_hourly_records")

    op.drop_index(
        "ix_battery_simulations_input_hash",
        table_name="battery_simulations",
    )
    op.drop_index(
        "ix_battery_simulations_status_created",
        table_name="battery_simulations",
    )
    op.drop_index(
        "ix_battery_simulations_run_created",
        table_name="battery_simulations",
    )
    op.drop_index(
        "ix_battery_simulations_published_by_id",
        table_name="battery_simulations",
    )
    op.drop_index(
        "ix_battery_simulations_created_by_id",
        table_name="battery_simulations",
    )
    op.drop_index(
        "ix_battery_simulations_battery_configuration_id",
        table_name="battery_simulations",
    )
    op.drop_index(
        "ix_battery_simulations_simulation_run_id",
        table_name="battery_simulations",
    )
    op.drop_table("battery_simulations")

    op.drop_index(
        "ix_battery_configurations_active_created",
        table_name="battery_configurations",
    )
    op.drop_index(
        "ix_battery_configurations_created_by_id",
        table_name="battery_configurations",
    )
    op.drop_table("battery_configurations")
