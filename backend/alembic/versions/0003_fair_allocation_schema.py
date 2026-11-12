"""part3 fair allocation schema

Revision ID: a7c1e6f9b204
Revises: 5369ac3bf0f7
Create Date: 2026-11-10 18:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7c1e6f9b204"
down_revision: Union[str, None] = "5369ac3bf0f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("apartment_id", sa.Integer(), nullable=True))
    op.create_index("ix_users_apartment_id", "users", ["apartment_id"], unique=False)
    op.create_foreign_key(
        "fk_users_apartment_id_apartments",
        "users",
        "apartments",
        ["apartment_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "allocation_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("simulation_run_id", sa.Integer(), nullable=False),
        sa.Column("method", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("date_from", sa.Date(), nullable=False),
        sa.Column("date_to", sa.Date(), nullable=False),
        sa.Column("total_solar_generation_kwh", sa.Numeric(18, 6), nullable=False),
        sa.Column("common_solar_consumption_kwh", sa.Numeric(18, 6), nullable=False),
        sa.Column("total_available_energy_kwh", sa.Numeric(18, 6), nullable=False),
        sa.Column("total_allocated_energy_kwh", sa.Numeric(18, 6), nullable=False),
        sa.Column("total_surplus_energy_kwh", sa.Numeric(18, 6), nullable=False),
        sa.Column("total_consumption_kwh", sa.Numeric(18, 6), nullable=False),
        sa.Column("total_grid_import_kwh", sa.Numeric(18, 6), nullable=False),
        sa.Column("average_coverage_percentage", sa.Numeric(7, 3), nullable=False),
        sa.Column("tariff_price_per_kwh", sa.Numeric(10, 4), nullable=False),
        sa.Column("algorithm_version", sa.String(length=20), nullable=False),
        sa.Column("input_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "is_hypothetical",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "incomplete_data",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("policy_note", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "method IN ('EQUAL_SHARE', 'CONSUMPTION_BASED', 'OWNERSHIP_BASED')",
            name="ck_allocation_runs_method",
        ),
        sa.CheckConstraint(
            "status IN ('SAVED', 'SAVED_WITH_GAPS')",
            name="ck_allocation_runs_status",
        ),
        sa.CheckConstraint(
            "date_to >= date_from",
            name="ck_allocation_runs_period_valid",
        ),
        sa.CheckConstraint(
            "total_available_energy_kwh >= 0 AND total_allocated_energy_kwh >= 0 "
            "AND total_surplus_energy_kwh >= 0 AND total_consumption_kwh >= 0 "
            "AND total_grid_import_kwh >= 0",
            name="ck_allocation_runs_totals_non_negative",
        ),
        sa.CheckConstraint(
            "total_allocated_energy_kwh <= total_available_energy_kwh + 0.000001",
            name="ck_allocation_runs_allocation_within_available",
        ),
        sa.ForeignKeyConstraint(
            ["simulation_run_id"],
            ["simulation_runs.id"],
            name="fk_allocation_runs_simulation_run_id_simulation_runs",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name="fk_allocation_runs_created_by_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_allocation_runs"),
        sa.UniqueConstraint(
            "simulation_run_id",
            "method",
            "date_from",
            "date_to",
            "algorithm_version",
            "input_hash",
            name="uq_allocation_runs_identity",
        ),
    )
    op.create_index(
        "ix_allocation_runs_simulation_run_id",
        "allocation_runs",
        ["simulation_run_id"],
    )
    op.create_index(
        "ix_allocation_runs_created_by_id",
        "allocation_runs",
        ["created_by_id"],
    )
    op.create_index(
        "ix_allocation_runs_simulation_method_dates",
        "allocation_runs",
        ["simulation_run_id", "method", "date_from"],
    )
    op.create_index(
        "ix_allocation_runs_created_at",
        "allocation_runs",
        ["created_at"],
    )

    op.create_table(
        "allocation_records",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("allocation_run_id", sa.Integer(), nullable=False),
        sa.Column("apartment_id", sa.Integer(), nullable=False),
        sa.Column("reading_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumption_kwh", sa.Numeric(12, 4), nullable=False),
        sa.Column("allocated_solar_kwh", sa.Numeric(12, 6), nullable=False),
        sa.Column("grid_import_kwh", sa.Numeric(12, 6), nullable=False),
        sa.Column("ownership_percentage", sa.Numeric(7, 3), nullable=False),
        sa.Column("allocation_weight", sa.Numeric(12, 10), nullable=False),
        sa.CheckConstraint(
            "consumption_kwh >= 0",
            name="ck_allocation_records_consumption_non_negative",
        ),
        sa.CheckConstraint(
            "allocated_solar_kwh >= 0",
            name="ck_allocation_records_allocation_non_negative",
        ),
        sa.CheckConstraint(
            "grid_import_kwh >= 0",
            name="ck_allocation_records_grid_non_negative",
        ),
        sa.CheckConstraint(
            "allocated_solar_kwh <= consumption_kwh + 0.000001",
            name="ck_allocation_records_allocation_within_demand",
        ),
        sa.CheckConstraint(
            "ownership_percentage >= 0 AND ownership_percentage <= 100",
            name="ck_allocation_records_ownership_range",
        ),
        sa.CheckConstraint(
            "allocation_weight >= 0 AND allocation_weight <= 1",
            name="ck_allocation_records_weight_range",
        ),
        sa.ForeignKeyConstraint(
            ["allocation_run_id"],
            ["allocation_runs.id"],
            name="fk_allocation_records_allocation_run_id_allocation_runs",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["apartment_id"],
            ["apartments.id"],
            name="fk_allocation_records_apartment_id_apartments",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_allocation_records"),
        sa.UniqueConstraint(
            "allocation_run_id",
            "apartment_id",
            "reading_time",
            name="uq_allocation_records_run_apartment_time",
        ),
    )
    op.create_index(
        "ix_allocation_records_allocation_run_id",
        "allocation_records",
        ["allocation_run_id"],
    )
    op.create_index(
        "ix_allocation_records_apartment_id",
        "allocation_records",
        ["apartment_id"],
    )
    op.create_index(
        "ix_allocation_records_reading_time",
        "allocation_records",
        ["reading_time"],
    )
    op.create_index(
        "ix_allocation_records_run_reading_time",
        "allocation_records",
        ["allocation_run_id", "reading_time"],
    )
    op.create_index(
        "ix_allocation_records_apartment_reading_time",
        "allocation_records",
        ["apartment_id", "reading_time"],
    )

    op.create_table(
        "allocation_summaries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("allocation_run_id", sa.Integer(), nullable=False),
        sa.Column("apartment_id", sa.Integer(), nullable=False),
        sa.Column("total_consumption_kwh", sa.Numeric(14, 4), nullable=False),
        sa.Column("total_solar_allocation_kwh", sa.Numeric(14, 6), nullable=False),
        sa.Column("total_grid_import_kwh", sa.Numeric(14, 6), nullable=False),
        sa.Column("solar_coverage_percentage", sa.Numeric(7, 3), nullable=False),
        sa.Column("estimated_solar_credit", sa.Numeric(14, 2), nullable=False),
        sa.Column("ownership_percentage", sa.Numeric(7, 3), nullable=False),
        sa.CheckConstraint(
            "total_consumption_kwh >= 0 AND total_solar_allocation_kwh >= 0 "
            "AND total_grid_import_kwh >= 0",
            name="ck_allocation_summaries_totals_non_negative",
        ),
        sa.CheckConstraint(
            "total_solar_allocation_kwh <= total_consumption_kwh + 0.000001",
            name="ck_allocation_summaries_allocation_within_demand",
        ),
        sa.CheckConstraint(
            "solar_coverage_percentage >= 0 AND solar_coverage_percentage <= 100",
            name="ck_allocation_summaries_coverage_range",
        ),
        sa.CheckConstraint(
            "estimated_solar_credit >= 0",
            name="ck_allocation_summaries_credit_non_negative",
        ),
        sa.ForeignKeyConstraint(
            ["allocation_run_id"],
            ["allocation_runs.id"],
            name="fk_allocation_summaries_allocation_run_id_allocation_runs",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["apartment_id"],
            ["apartments.id"],
            name="fk_allocation_summaries_apartment_id_apartments",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_allocation_summaries"),
        sa.UniqueConstraint(
            "allocation_run_id",
            "apartment_id",
            name="uq_allocation_summaries_run_apartment",
        ),
    )
    op.create_index(
        "ix_allocation_summaries_allocation_run_id",
        "allocation_summaries",
        ["allocation_run_id"],
    )
    op.create_index(
        "ix_allocation_summaries_apartment_id",
        "allocation_summaries",
        ["apartment_id"],
    )
    op.create_index(
        "ix_allocation_summaries_run_coverage",
        "allocation_summaries",
        ["allocation_run_id", "solar_coverage_percentage"],
    )
    op.create_index(
        "ix_allocation_summaries_apartment",
        "allocation_summaries",
        ["apartment_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_allocation_summaries_apartment", table_name="allocation_summaries"
    )
    op.drop_index(
        "ix_allocation_summaries_run_coverage", table_name="allocation_summaries"
    )
    op.drop_index(
        "ix_allocation_summaries_apartment_id", table_name="allocation_summaries"
    )
    op.drop_index(
        "ix_allocation_summaries_allocation_run_id",
        table_name="allocation_summaries",
    )
    op.drop_table("allocation_summaries")

    op.drop_index(
        "ix_allocation_records_apartment_reading_time",
        table_name="allocation_records",
    )
    op.drop_index(
        "ix_allocation_records_run_reading_time", table_name="allocation_records"
    )
    op.drop_index(
        "ix_allocation_records_reading_time", table_name="allocation_records"
    )
    op.drop_index(
        "ix_allocation_records_apartment_id", table_name="allocation_records"
    )
    op.drop_index(
        "ix_allocation_records_allocation_run_id", table_name="allocation_records"
    )
    op.drop_table("allocation_records")

    op.drop_index("ix_allocation_runs_created_at", table_name="allocation_runs")
    op.drop_index(
        "ix_allocation_runs_simulation_method_dates", table_name="allocation_runs"
    )
    op.drop_index(
        "ix_allocation_runs_created_by_id", table_name="allocation_runs"
    )
    op.drop_index(
        "ix_allocation_runs_simulation_run_id", table_name="allocation_runs"
    )
    op.drop_table("allocation_runs")

    op.drop_constraint(
        "fk_users_apartment_id_apartments", "users", type_="foreignkey"
    )
    op.drop_index("ix_users_apartment_id", table_name="users")
    op.drop_column("users", "apartment_id")
