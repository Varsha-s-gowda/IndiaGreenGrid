"""compliance history, provenance and account verification

Revision ID: b7d4e1f2a3c5
Revises: 356ccfc9d562
Create Date: 2026-11-11 18:05:00.000000

Adds the PS1 hardening fields: organisational account verification, RPO
compliance revision history, job/finance verification and expiry metadata,
recycling traceability events, material recovery and ingestion run logging.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7d4e1f2a3c5"
down_revision: Union[str, None] = "356ccfc9d562"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "verification_status",
            sa.String(length=20),
            server_default="VERIFIED",
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "verification_note", sa.Text(), server_default="", nullable=False
        ),
    )
    op.add_column(
        "users",
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("verified_by_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_users_verified_by_id_users"),
        "users",
        "users",
        ["verified_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_users_verification_status"),
        "users",
        ["verification_status"],
        unique=False,
    )

    op.add_column(
        "rpo_targets",
        sa.Column(
            "entity_code", sa.String(length=80), server_default="", nullable=False
        ),
    )
    op.create_table(
        "rpo_compliance_revisions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("actual_solar_mwh", sa.Float(), nullable=False),
        sa.Column("actual_non_solar_mwh", sa.Float(), nullable=False),
        sa.Column("actual_total_mwh", sa.Float(), nullable=False),
        sa.Column("required_mwh", sa.Float(), nullable=False),
        sa.Column("target_snapshot_pct", sa.Float(), nullable=False),
        sa.Column("compliance_pct", sa.Float(), nullable=False),
        sa.Column("shortfall_mwh", sa.Float(), nullable=False),
        sa.Column("surplus_mwh", sa.Float(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("notes", sa.Text(), server_default="", nullable=False),
        sa.Column("recorded_by", sa.Integer(), nullable=True),
        sa.Column(
            "recorded_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["recorded_by"],
            ["users.id"],
            name=op.f("fk_rpo_compliance_revisions_recorded_by_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["target_id"],
            ["rpo_targets.id"],
            name=op.f("fk_rpo_compliance_revisions_target_id_rpo_targets"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_rpo_compliance_revisions")),
    )
    op.create_index(
        op.f("ix_rpo_compliance_revisions_target_id"),
        "rpo_compliance_revisions",
        ["target_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_rpo_compliance_revisions_year"),
        "rpo_compliance_revisions",
        ["year"],
        unique=False,
    )
    op.create_index(
        op.f("ix_rpo_compliance_revisions_recorded_at"),
        "rpo_compliance_revisions",
        ["recorded_at"],
        unique=False,
    )

    op.add_column(
        "green_jobs",
        sa.Column("eligibility", sa.Text(), server_default="", nullable=False),
    )
    op.add_column(
        "green_jobs",
        sa.Column(
            "source_name", sa.String(length=180), server_default="", nullable=False
        ),
    )
    op.add_column(
        "green_jobs", sa.Column("source_url", sa.String(length=500), nullable=True)
    )
    op.add_column(
        "green_jobs",
        sa.Column(
            "verification_status",
            sa.String(length=30),
            server_default="SAMPLE",
            nullable=False,
        ),
    )
    op.add_column(
        "green_jobs",
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        op.f("ix_green_jobs_verification_status"),
        "green_jobs",
        ["verification_status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_green_jobs_expires_at"),
        "green_jobs",
        ["expires_at"],
        unique=False,
    )

    op.add_column(
        "finance_schemes",
        sa.Column("limitations", sa.Text(), server_default="", nullable=False),
    )
    op.add_column(
        "finance_schemes",
        sa.Column("last_verified_at", sa.Date(), nullable=True),
    )
    op.add_column(
        "finance_schemes",
        sa.Column(
            "verification_status",
            sa.String(length=30),
            server_default="SAMPLE",
            nullable=False,
        ),
    )
    op.create_index(
        op.f("ix_finance_schemes_verification_status"),
        "finance_schemes",
        ["verification_status"],
        unique=False,
    )

    op.add_column(
        "recycling_transactions",
        sa.Column(
            "material_recovered_kg",
            sa.Float(),
            server_default="0",
            nullable=False,
        ),
    )
    op.add_column(
        "recycling_transactions",
        sa.Column(
            "verification_status",
            sa.String(length=30),
            server_default="SAMPLE",
            nullable=False,
        ),
    )
    op.create_index(
        op.f("ix_recycling_transactions_verification_status"),
        "recycling_transactions",
        ["verification_status"],
        unique=False,
    )
    op.create_table(
        "recycling_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("transaction_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("note", sa.Text(), server_default="", nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column(
            "actor_role",
            sa.String(length=30),
            server_default="SYSTEM",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            name=op.f("fk_recycling_events_actor_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["transaction_id"],
            ["recycling_transactions.id"],
            name=op.f(
                "fk_recycling_events_transaction_id_recycling_transactions"
            ),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_recycling_events")),
    )
    op.create_index(
        op.f("ix_recycling_events_transaction_id"),
        "recycling_events",
        ["transaction_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_recycling_events_created_at"),
        "recycling_events",
        ["created_at"],
        unique=False,
    )

    op.create_table(
        "ingestion_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=True),
        sa.Column("source_code", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column(
            "dataset_status",
            sa.String(length=30),
            server_default="SAMPLE",
            nullable=False,
        ),
        sa.Column("records", sa.Integer(), server_default="0", nullable=False),
        sa.Column("message", sa.Text(), server_default="", nullable=False),
        sa.Column(
            "trigger", sa.String(length=30), server_default="manual", nullable=False
        ),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["source_id"],
            ["data_sources.id"],
            name=op.f("fk_ingestion_runs_source_id_data_sources"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ingestion_runs")),
    )
    op.create_index(
        op.f("ix_ingestion_runs_source_id"),
        "ingestion_runs",
        ["source_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_ingestion_runs_source_code"),
        "ingestion_runs",
        ["source_code"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_ingestion_runs_source_code"), table_name="ingestion_runs")
    op.drop_index(op.f("ix_ingestion_runs_source_id"), table_name="ingestion_runs")
    op.drop_table("ingestion_runs")

    op.drop_index(
        op.f("ix_recycling_events_created_at"), table_name="recycling_events"
    )
    op.drop_index(
        op.f("ix_recycling_events_transaction_id"), table_name="recycling_events"
    )
    op.drop_table("recycling_events")
    op.drop_index(
        op.f("ix_recycling_transactions_verification_status"),
        table_name="recycling_transactions",
    )
    op.drop_column("recycling_transactions", "verification_status")
    op.drop_column("recycling_transactions", "material_recovered_kg")

    op.drop_index(
        op.f("ix_finance_schemes_verification_status"),
        table_name="finance_schemes",
    )
    op.drop_column("finance_schemes", "verification_status")
    op.drop_column("finance_schemes", "last_verified_at")
    op.drop_column("finance_schemes", "limitations")

    op.drop_index(op.f("ix_green_jobs_expires_at"), table_name="green_jobs")
    op.drop_index(
        op.f("ix_green_jobs_verification_status"), table_name="green_jobs"
    )
    op.drop_column("green_jobs", "expires_at")
    op.drop_column("green_jobs", "verification_status")
    op.drop_column("green_jobs", "source_url")
    op.drop_column("green_jobs", "source_name")
    op.drop_column("green_jobs", "eligibility")

    op.drop_index(
        op.f("ix_rpo_compliance_revisions_recorded_at"),
        table_name="rpo_compliance_revisions",
    )
    op.drop_index(
        op.f("ix_rpo_compliance_revisions_year"),
        table_name="rpo_compliance_revisions",
    )
    op.drop_index(
        op.f("ix_rpo_compliance_revisions_target_id"),
        table_name="rpo_compliance_revisions",
    )
    op.drop_table("rpo_compliance_revisions")
    op.drop_column("rpo_targets", "entity_code")

    op.drop_index(op.f("ix_users_verification_status"), table_name="users")
    op.drop_constraint(
        op.f("fk_users_verified_by_id_users"), "users", type_="foreignkey"
    )
    op.drop_column("users", "verified_by_id")
    op.drop_column("users", "verified_at")
    op.drop_column("users", "verification_note")
    op.drop_column("users", "verification_status")
