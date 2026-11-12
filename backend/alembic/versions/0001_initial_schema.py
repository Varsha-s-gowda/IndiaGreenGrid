"""initial schema

Revision ID: 0dfabfc6d580
Revises: 
Create Date: 2026-11-10 13:08:09.040140

"""
from typing import Sequence, Union


from alembic import op
import sqlalchemy as sa


revision: str = '0dfabfc6d580'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('apartments',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('flat_number', sa.String(length=20), nullable=False),
    sa.Column('floor_number', sa.Integer(), nullable=False),
    sa.Column('residents_count', sa.Integer(), nullable=False),
    sa.Column('apartment_category', sa.String(length=50), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('floor_number >= 0', name='ck_apartments_floor_number_non_negative'),
    sa.CheckConstraint('residents_count >= 0', name='ck_apartments_residents_non_negative'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_apartments'))
    )
    op.create_index(op.f('ix_apartments_flat_number'), 'apartments', ['flat_number'], unique=True)
    op.create_table('electricity_tariffs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('price_per_kwh', sa.Numeric(precision=10, scale=4), nullable=False),
    sa.Column('effective_from', sa.Date(), nullable=False),
    sa.Column('effective_to', sa.Date(), nullable=True),
    sa.CheckConstraint('effective_to IS NULL OR effective_to >= effective_from', name='ck_electricity_tariffs_valid_period'),
    sa.CheckConstraint('price_per_kwh > 0', name='ck_electricity_tariffs_price_positive'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_electricity_tariffs')),
    sa.UniqueConstraint('effective_from', name='uq_electricity_tariffs_effective_from')
    )
    op.create_index(op.f('ix_electricity_tariffs_effective_from'), 'electricity_tariffs', ['effective_from'], unique=False)
    op.create_table('solar_configurations',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('capacity_kwp', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('rooftop_area', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('installation_cost', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('capacity_kwp > 0', name='ck_solar_configurations_capacity_positive'),
    sa.CheckConstraint('installation_cost >= 0', name='ck_solar_configurations_cost_non_negative'),
    sa.CheckConstraint('rooftop_area > 0', name='ck_solar_configurations_area_positive'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_solar_configurations'))
    )
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('hashed_password', sa.String(length=255), nullable=False),
    sa.Column('role', sa.Enum('ADMIN', 'RESIDENT', name='ck_users_role', native_enum=False, create_constraint=True, length=20), server_default='RESIDENT', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users'))
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_table('ownership_shares',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('apartment_id', sa.Integer(), nullable=False),
    sa.Column('contribution_amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('ownership_percentage', sa.Numeric(precision=7, scale=3), nullable=False),
    sa.CheckConstraint('contribution_amount >= 0', name='ck_ownership_shares_contribution_non_negative'),
    sa.CheckConstraint('ownership_percentage >= 0 AND ownership_percentage <= 100', name='ck_ownership_shares_percentage_range'),
    sa.ForeignKeyConstraint(['apartment_id'], ['apartments.id'], name=op.f('fk_ownership_shares_apartment_id_apartments'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_ownership_shares'))
    )
    op.create_index(op.f('ix_ownership_shares_apartment_id'), 'ownership_shares', ['apartment_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_ownership_shares_apartment_id'), table_name='ownership_shares')
    op.drop_table('ownership_shares')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
    op.drop_table('solar_configurations')
    op.drop_index(op.f('ix_electricity_tariffs_effective_from'), table_name='electricity_tariffs')
    op.drop_table('electricity_tariffs')
    op.drop_index(op.f('ix_apartments_flat_number'), table_name='apartments')
    op.drop_table('apartments')
