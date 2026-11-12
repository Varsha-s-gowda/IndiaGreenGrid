"""part2 solartwin simulation schema

Revision ID: 5369ac3bf0f7
Revises: 0dfabfc6d580
Create Date: 2026-11-10 16:49:27.504592

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '5369ac3bf0f7'
down_revision: Union[str, None] = '0dfabfc6d580'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('simulation_runs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('solar_capacity_kwp', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=False),
    sa.Column('days', sa.Integer(), nullable=False),
    sa.Column('random_seed', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('error_message', sa.Text(), nullable=True),
    sa.CheckConstraint("status IN ('PENDING', 'RUNNING', 'PARTIAL', 'COMPLETED', 'FAILED')", name='ck_simulation_runs_status'),
    sa.CheckConstraint('days > 0', name='ck_simulation_runs_days_positive'),
    sa.CheckConstraint('end_date >= start_date', name='ck_simulation_runs_period_valid'),
    sa.CheckConstraint('solar_capacity_kwp > 0', name='ck_simulation_runs_capacity_positive'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_simulation_runs'))
    )
    op.create_index(op.f('ix_simulation_runs_start_date'), 'simulation_runs', ['start_date'], unique=False)
    op.create_index('ix_simulation_runs_status_created', 'simulation_runs', ['status', 'created_at'], unique=False)
    op.create_table('common_consumption',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('simulation_run_id', sa.Integer(), nullable=False),
    sa.Column('category', sa.String(length=50), nullable=False),
    sa.Column('reading_time', sa.DateTime(timezone=True), nullable=False),
    sa.Column('consumption_kwh', sa.Numeric(precision=12, scale=4), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("category IN ('lifts', 'water_pumps', 'corridor_lights', 'security_systems')", name='ck_common_consumption_category'),
    sa.CheckConstraint('consumption_kwh >= 0', name='ck_common_consumption_non_negative'),
    sa.ForeignKeyConstraint(['simulation_run_id'], ['simulation_runs.id'], name=op.f('fk_common_consumption_simulation_run_id_simulation_runs'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_common_consumption')),
    sa.UniqueConstraint('simulation_run_id', 'category', 'reading_time', name='uq_common_consumption_run_category_time')
    )
    op.create_index(op.f('ix_common_consumption_category'), 'common_consumption', ['category'], unique=False)
    op.create_index(op.f('ix_common_consumption_reading_time'), 'common_consumption', ['reading_time'], unique=False)
    op.create_index('ix_common_consumption_run_reading_time', 'common_consumption', ['simulation_run_id', 'reading_time'], unique=False)
    op.create_index(op.f('ix_common_consumption_simulation_run_id'), 'common_consumption', ['simulation_run_id'], unique=False)
    op.create_table('meter_readings',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('simulation_run_id', sa.Integer(), nullable=False),
    sa.Column('apartment_id', sa.Integer(), nullable=False),
    sa.Column('reading_time', sa.DateTime(timezone=True), nullable=False),
    sa.Column('consumption_kwh', sa.Numeric(precision=12, scale=4), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('consumption_kwh >= 0', name='ck_meter_readings_non_negative'),
    sa.ForeignKeyConstraint(['apartment_id'], ['apartments.id'], name=op.f('fk_meter_readings_apartment_id_apartments'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['simulation_run_id'], ['simulation_runs.id'], name=op.f('fk_meter_readings_simulation_run_id_simulation_runs'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_meter_readings')),
    sa.UniqueConstraint('simulation_run_id', 'apartment_id', 'reading_time', name='uq_meter_readings_run_apartment_time')
    )
    op.create_index(op.f('ix_meter_readings_apartment_id'), 'meter_readings', ['apartment_id'], unique=False)
    op.create_index('ix_meter_readings_apartment_reading_time', 'meter_readings', ['apartment_id', 'reading_time'], unique=False)
    op.create_index(op.f('ix_meter_readings_reading_time'), 'meter_readings', ['reading_time'], unique=False)
    op.create_index('ix_meter_readings_run_reading_time', 'meter_readings', ['simulation_run_id', 'reading_time'], unique=False)
    op.create_index(op.f('ix_meter_readings_simulation_run_id'), 'meter_readings', ['simulation_run_id'], unique=False)
    op.create_table('solar_generation',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('simulation_run_id', sa.Integer(), nullable=False),
    sa.Column('reading_time', sa.DateTime(timezone=True), nullable=False),
    sa.Column('generation_kwh', sa.Numeric(precision=12, scale=4), nullable=False),
    sa.Column('capacity_kwp', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('weather_factor', sa.Numeric(precision=7, scale=4), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('capacity_kwp > 0', name='ck_solar_generation_capacity_positive'),
    sa.CheckConstraint('generation_kwh >= 0', name='ck_solar_generation_non_negative'),
    sa.CheckConstraint('weather_factor >= 0', name='ck_solar_generation_weather_non_negative'),
    sa.ForeignKeyConstraint(['simulation_run_id'], ['simulation_runs.id'], name=op.f('fk_solar_generation_simulation_run_id_simulation_runs'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_solar_generation')),
    sa.UniqueConstraint('simulation_run_id', 'reading_time', name='uq_solar_generation_run_reading_time')
    )
    op.create_index(op.f('ix_solar_generation_reading_time'), 'solar_generation', ['reading_time'], unique=False)
    op.create_index('ix_solar_generation_run_reading_time', 'solar_generation', ['simulation_run_id', 'reading_time'], unique=False)
    op.create_index(op.f('ix_solar_generation_simulation_run_id'), 'solar_generation', ['simulation_run_id'], unique=False)
    op.add_column('apartments', sa.Column('consumption_profile', sa.String(length=30), server_default='MEDIUM', nullable=False))
    op.create_check_constraint(
        'ck_apartments_consumption_profile',
        'apartments',
        "consumption_profile IN ('LOW', 'MEDIUM', 'HIGH', 'WORK_FROM_HOME', 'NIGHT_HEAVY')",
    )


def downgrade() -> None:
    op.drop_constraint('ck_apartments_consumption_profile', 'apartments', type_='check')
    op.drop_column('apartments', 'consumption_profile')
    op.drop_index(op.f('ix_solar_generation_simulation_run_id'), table_name='solar_generation')
    op.drop_index('ix_solar_generation_run_reading_time', table_name='solar_generation')
    op.drop_index(op.f('ix_solar_generation_reading_time'), table_name='solar_generation')
    op.drop_table('solar_generation')
    op.drop_index(op.f('ix_meter_readings_simulation_run_id'), table_name='meter_readings')
    op.drop_index('ix_meter_readings_run_reading_time', table_name='meter_readings')
    op.drop_index(op.f('ix_meter_readings_reading_time'), table_name='meter_readings')
    op.drop_index('ix_meter_readings_apartment_reading_time', table_name='meter_readings')
    op.drop_index(op.f('ix_meter_readings_apartment_id'), table_name='meter_readings')
    op.drop_table('meter_readings')
    op.drop_index(op.f('ix_common_consumption_simulation_run_id'), table_name='common_consumption')
    op.drop_index('ix_common_consumption_run_reading_time', table_name='common_consumption')
    op.drop_index(op.f('ix_common_consumption_reading_time'), table_name='common_consumption')
    op.drop_index(op.f('ix_common_consumption_category'), table_name='common_consumption')
    op.drop_table('common_consumption')
    op.drop_index('ix_simulation_runs_status_created', table_name='simulation_runs')
    op.drop_index(op.f('ix_simulation_runs_start_date'), table_name='simulation_runs')
    op.drop_table('simulation_runs')
