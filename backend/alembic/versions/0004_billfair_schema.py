"""part4 billfair billing and audit schema

Revision ID: c4e9b7d2a610
Revises: a7c1e6f9b204
Create Date: 2026-11-10 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4e9b7d2a610"
down_revision: Union[str, None] = "a7c1e6f9b204"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "billing_configurations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("solar_credit_rate_per_kwh", sa.Numeric(10, 4), nullable=False),
        sa.Column("maintenance_charge", sa.Numeric(12, 2), nullable=False),
        sa.Column("other_charges", sa.Numeric(12, 2), nullable=False),
        sa.Column("other_charges_description", sa.String(length=255), nullable=True),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "solar_credit_rate_per_kwh >= 0",
            name="ck_billing_configurations_credit_rate_non_negative",
        ),
        sa.CheckConstraint(
            "maintenance_charge >= 0 AND other_charges >= 0",
            name="ck_billing_configurations_charges_non_negative",
        ),
        sa.CheckConstraint(
            "effective_to IS NULL OR effective_to >= effective_from",
            name="ck_billing_configurations_valid_period",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_billing_configurations"),
        sa.UniqueConstraint(
            "effective_from", name="uq_billing_configurations_effective_from"
        ),
    )
    op.create_index(
        "ix_billing_configurations_effective_from",
        "billing_configurations",
        ["effective_from"],
    )
    op.create_index(
        "ix_billing_configurations_effective",
        "billing_configurations",
        ["effective_from", "effective_to"],
    )

    op.create_table(
        "bills",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bill_number", sa.String(length=60), nullable=False),
        sa.Column("apartment_id", sa.Integer(), nullable=False),
        sa.Column("allocation_run_id", sa.Integer(), nullable=False),
        sa.Column("simulation_run_id", sa.Integer(), nullable=False),
        sa.Column("billing_configuration_id", sa.Integer(), nullable=True),
        sa.Column("allocation_method", sa.String(length=30), nullable=False),
        sa.Column("billing_period_start", sa.Date(), nullable=False),
        sa.Column("billing_period_end", sa.Date(), nullable=False),
        sa.Column("billing_period_label", sa.String(length=60), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column(
            "is_current",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("supersedes_bill_id", sa.Integer(), nullable=True),
        sa.Column("consumption_kwh", sa.Numeric(16, 6), nullable=False),
        sa.Column("solar_allocation_kwh", sa.Numeric(16, 6), nullable=False),
        sa.Column("grid_import_kwh", sa.Numeric(16, 6), nullable=False),
        sa.Column("solar_coverage_percentage", sa.Numeric(7, 3), nullable=False),
        sa.Column("tariff_price_per_kwh", sa.Numeric(10, 4), nullable=False),
        sa.Column("solar_credit_rate_per_kwh", sa.Numeric(10, 4), nullable=False),
        sa.Column("grid_charge", sa.Numeric(14, 2), nullable=False),
        sa.Column("solar_credit", sa.Numeric(14, 2), nullable=False),
        sa.Column("maintenance_charge", sa.Numeric(14, 2), nullable=False),
        sa.Column("other_charges", sa.Numeric(14, 2), nullable=False),
        sa.Column("other_charges_description", sa.String(length=255), nullable=True),
        sa.Column("net_payable", sa.Numeric(14, 2), nullable=False),
        sa.Column("no_solar_baseline_cost", sa.Numeric(14, 2), nullable=False),
        sa.Column("actual_estimated_cost", sa.Numeric(14, 2), nullable=False),
        sa.Column("estimated_savings", sa.Numeric(14, 2), nullable=False),
        sa.Column("tariff_snapshot", sa.JSON(), nullable=False),
        sa.Column("charge_snapshot", sa.JSON(), nullable=False),
        sa.Column("hour_count", sa.Integer(), nullable=False),
        sa.Column("algorithm_version", sa.String(length=20), nullable=False),
        sa.Column("input_hash", sa.String(length=64), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("generated_by_id", sa.Integer(), nullable=True),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "billing_period_end >= billing_period_start",
            name="ck_bills_period_valid",
        ),
        sa.CheckConstraint("version >= 1", name="ck_bills_version_positive"),
        sa.CheckConstraint(
            "status IN ('ISSUED', 'SUPERSEDED', 'VOID')",
            name="ck_bills_status",
        ),
        sa.CheckConstraint(
            "consumption_kwh >= 0 AND solar_allocation_kwh >= 0 "
            "AND grid_import_kwh >= 0",
            name="ck_bills_energy_non_negative",
        ),
        sa.CheckConstraint(
            "solar_allocation_kwh <= consumption_kwh + 0.000001",
            name="ck_bills_allocation_within_consumption",
        ),
        sa.CheckConstraint(
            "solar_coverage_percentage >= 0 AND solar_coverage_percentage <= 100",
            name="ck_bills_coverage_range",
        ),
        sa.CheckConstraint(
            "grid_charge >= 0 AND solar_credit >= 0 AND maintenance_charge >= 0 "
            "AND other_charges >= 0",
            name="ck_bills_charges_non_negative",
        ),
        sa.CheckConstraint("hour_count >= 0", name="ck_bills_hour_count_non_negative"),
        sa.ForeignKeyConstraint(
            ["apartment_id"],
            ["apartments.id"],
            name="fk_bills_apartment_id_apartments",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["allocation_run_id"],
            ["allocation_runs.id"],
            name="fk_bills_allocation_run_id_allocation_runs",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["simulation_run_id"],
            ["simulation_runs.id"],
            name="fk_bills_simulation_run_id_simulation_runs",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["billing_configuration_id"],
            ["billing_configurations.id"],
            name="fk_bills_billing_configuration_id_billing_configurations",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["supersedes_bill_id"],
            ["bills.id"],
            name="fk_bills_supersedes_bill_id_bills",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["generated_by_id"],
            ["users.id"],
            name="fk_bills_generated_by_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_bills"),
        sa.UniqueConstraint("bill_number", name="uq_bills_bill_number"),
        sa.UniqueConstraint(
            "apartment_id",
            "billing_period_start",
            "billing_period_end",
            "allocation_run_id",
            "version",
            name="uq_bills_apartment_period_run_version",
        ),
    )
    op.create_index("ix_bills_bill_number", "bills", ["bill_number"])
    op.create_index("ix_bills_apartment_id", "bills", ["apartment_id"])
    op.create_index("ix_bills_allocation_run_id", "bills", ["allocation_run_id"])
    op.create_index("ix_bills_simulation_run_id", "bills", ["simulation_run_id"])
    op.create_index(
        "ix_bills_billing_configuration_id",
        "bills",
        ["billing_configuration_id"],
    )
    op.create_index("ix_bills_generated_by_id", "bills", ["generated_by_id"])
    op.create_index(
        "ix_bills_apartment_period",
        "bills",
        ["apartment_id", "billing_period_start"],
    )
    op.create_index(
        "ix_bills_status_current",
        "bills",
        ["status", "is_current"],
    )
    op.create_index("ix_bills_allocation_run", "bills", ["allocation_run_id"])
    op.create_index(
        "ix_bills_billing_period",
        "bills",
        ["billing_period_start", "billing_period_end"],
    )
    op.create_index("ix_bills_generated_at", "bills", ["generated_at"])

    op.create_table(
        "bill_line_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bill_id", sa.Integer(), nullable=False),
        sa.Column("charge_type", sa.String(length=30), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("quantity", sa.Numeric(16, 6), nullable=False),
        sa.Column("unit", sa.String(length=20), nullable=False),
        sa.Column("rate", sa.Numeric(12, 4), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "charge_type IN ('GRID_CHARGE', 'SOLAR_CREDIT', 'MAINTENANCE', "
            "'OTHER_CHARGE')",
            name="ck_bill_line_items_charge_type",
        ),
        sa.CheckConstraint(
            "quantity >= 0", name="ck_bill_line_items_quantity_non_negative"
        ),
        sa.CheckConstraint("rate >= 0", name="ck_bill_line_items_rate_non_negative"),
        sa.ForeignKeyConstraint(
            ["bill_id"],
            ["bills.id"],
            name="fk_bill_line_items_bill_id_bills",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_bill_line_items"),
        sa.UniqueConstraint(
            "bill_id",
            "charge_type",
            "sort_order",
            name="uq_bill_line_items_bill_type_order",
        ),
    )
    op.create_index("ix_bill_line_items_bill_id", "bill_line_items", ["bill_id"])
    op.create_index("ix_bill_line_items_bill", "bill_line_items", ["bill_id"])

    op.create_table(
        "billing_audits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("audit_batch_id", sa.String(length=40), nullable=False),
        sa.Column("bill_id", sa.Integer(), nullable=True),
        sa.Column("apartment_id", sa.Integer(), nullable=True),
        sa.Column("allocation_run_id", sa.Integer(), nullable=True),
        sa.Column("billing_period_start", sa.Date(), nullable=True),
        sa.Column("billing_period_end", sa.Date(), nullable=True),
        sa.Column("check_type", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False),
        sa.Column("expected_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("calculated_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("discrepancy", sa.Numeric(14, 2), nullable=True),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("reviewed_by_id", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "status IN ('PASS', 'WARNING', 'FAIL', 'REVIEWED')",
            name="ck_billing_audits_status",
        ),
        sa.CheckConstraint(
            "severity IN ('INFO', 'WARNING', 'ERROR')",
            name="ck_billing_audits_severity",
        ),
        sa.ForeignKeyConstraint(
            ["bill_id"],
            ["bills.id"],
            name="fk_billing_audits_bill_id_bills",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["apartment_id"],
            ["apartments.id"],
            name="fk_billing_audits_apartment_id_apartments",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["allocation_run_id"],
            ["allocation_runs.id"],
            name="fk_billing_audits_allocation_run_id_allocation_runs",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name="fk_billing_audits_created_by_id_users",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by_id"],
            ["users.id"],
            name="fk_billing_audits_reviewed_by_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_billing_audits"),
    )
    op.create_index(
        "ix_billing_audits_audit_batch_id", "billing_audits", ["audit_batch_id"]
    )
    op.create_index("ix_billing_audits_bill_id", "billing_audits", ["bill_id"])
    op.create_index(
        "ix_billing_audits_apartment_id", "billing_audits", ["apartment_id"]
    )
    op.create_index("ix_billing_audits_batch", "billing_audits", ["audit_batch_id"])
    op.create_index("ix_billing_audits_status", "billing_audits", ["status"])
    op.create_index("ix_billing_audits_bill", "billing_audits", ["bill_id"])
    op.create_index(
        "ix_billing_audits_apartment_period",
        "billing_audits",
        ["apartment_id", "billing_period_start"],
    )
    op.create_index(
        "ix_billing_audits_created_at", "billing_audits", ["created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_billing_audits_created_at", table_name="billing_audits")
    op.drop_index("ix_billing_audits_apartment_period", table_name="billing_audits")
    op.drop_index("ix_billing_audits_bill", table_name="billing_audits")
    op.drop_index("ix_billing_audits_status", table_name="billing_audits")
    op.drop_index("ix_billing_audits_batch", table_name="billing_audits")
    op.drop_index("ix_billing_audits_apartment_id", table_name="billing_audits")
    op.drop_index("ix_billing_audits_bill_id", table_name="billing_audits")
    op.drop_index(
        "ix_billing_audits_audit_batch_id", table_name="billing_audits"
    )
    op.drop_table("billing_audits")

    op.drop_index("ix_bill_line_items_bill", table_name="bill_line_items")
    op.drop_index("ix_bill_line_items_bill_id", table_name="bill_line_items")
    op.drop_table("bill_line_items")

    op.drop_index("ix_bills_generated_at", table_name="bills")
    op.drop_index("ix_bills_billing_period", table_name="bills")
    op.drop_index("ix_bills_allocation_run", table_name="bills")
    op.drop_index("ix_bills_status_current", table_name="bills")
    op.drop_index("ix_bills_apartment_period", table_name="bills")
    op.drop_index("ix_bills_generated_by_id", table_name="bills")
    op.drop_index("ix_bills_billing_configuration_id", table_name="bills")
    op.drop_index("ix_bills_simulation_run_id", table_name="bills")
    op.drop_index("ix_bills_allocation_run_id", table_name="bills")
    op.drop_index("ix_bills_apartment_id", table_name="bills")
    op.drop_index("ix_bills_bill_number", table_name="bills")
    op.drop_table("bills")

    op.drop_index(
        "ix_billing_configurations_effective", table_name="billing_configurations"
    )
    op.drop_index(
        "ix_billing_configurations_effective_from",
        table_name="billing_configurations",
    )
    op.drop_table("billing_configurations")
