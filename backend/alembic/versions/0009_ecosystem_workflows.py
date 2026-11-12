"""multi-stakeholder ecosystem workflows

Revision ID: c1a2b3d4e5f6
Revises: b7d4e1f2a3c5
Create Date: 2026-11-12 10:00:00.000000

Adds the solar-installation, RPO filing, procurement, green-loan, recycling,
organisation-verification, document and notification tables, and extends the
user role check constraint with SOLAR_INSTALLER, RENEWABLE_SUPPLIER and
RECYCLER.  No existing table or row is dropped.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

import app.models  # noqa: F401  (register every model on the shared metadata)
from app.database import Base


revision: str = "c1a2b3d4e5f6"
down_revision: Union[str, None] = "b7d4e1f2a3c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_TABLES = [
    "organisation_profiles",
    "organisation_verifications",
    "application_documents",
    "solar_installation_requests",
    "solar_quotations",
    "solar_installations",
    "energy_compliance_records",
    "renewable_procurement_requests",
    "supplier_quotations",
    "green_loan_products",
    "green_loan_applications",
    "recycling_requests",
    "recycling_request_events",
    "notifications",
]

ALL_ROLES = (
    "ADMIN",
    "RESIDENT",
    "CITIZEN",
    "DISCOM",
    "INDUSTRY",
    "FINANCIAL_INSTITUTION",
    "POLICYMAKER",
    "SOLAR_INSTALLER",
    "RENEWABLE_SUPPLIER",
    "RECYCLER",
)


def upgrade() -> None:
    bind = op.get_bind()

    op.drop_constraint("ck_users_role", "users", type_="check")
    roles_sql = ", ".join(f"'{role}'" for role in ALL_ROLES)
    op.create_check_constraint("ck_users_role", "users", f"role IN ({roles_sql})")

    for table_name in NEW_TABLES:
        table = Base.metadata.tables[table_name]
        table.create(bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()

    for table_name in reversed(NEW_TABLES):
        table = Base.metadata.tables[table_name]
        table.drop(bind, checkfirst=True)

    op.drop_constraint("ck_users_role", "users", type_="check")
    op.execute(
        "UPDATE users SET role = 'RESIDENT' "
        "WHERE role IN ('SOLAR_INSTALLER', 'RENEWABLE_SUPPLIER', 'RECYCLER')"
    )
    op.create_check_constraint(
        "ck_users_role",
        "users",
        "role IN ('ADMIN', 'RESIDENT', 'CITIZEN', 'DISCOM', 'INDUSTRY', "
        "'FINANCIAL_INSTITUTION', 'POLICYMAKER')",
    )
