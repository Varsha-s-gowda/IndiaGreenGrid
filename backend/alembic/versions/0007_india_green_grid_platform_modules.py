"""india green grid platform modules

Revision ID: 356ccfc9d562
Revises: f7b2d9c3a15e
Create Date: 2026-11-11 16:18:05.143620

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '356ccfc9d562'
down_revision: Union[str, None] = 'f7b2d9c3a15e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('data_sources',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('code', sa.String(length=80), nullable=False),
    sa.Column('name', sa.String(length=180), nullable=False),
    sa.Column('organization', sa.String(length=120), nullable=False),
    sa.Column('url', sa.String(length=500), nullable=False),
    sa.Column('dataset_name', sa.String(length=180), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=30), server_default='sample', nullable=False),
    sa.Column('is_demo', sa.Boolean(), server_default='true', nullable=False),
    sa.Column('freshness_hours', sa.Integer(), nullable=False),
    sa.Column('record_count', sa.Integer(), nullable=False),
    sa.Column('last_retrieved_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_success_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('notes', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_data_sources'))
    )
    op.create_index(op.f('ix_data_sources_code'), 'data_sources', ['code'], unique=True)
    op.create_table('energy_sources',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('code', sa.String(length=40), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('category', sa.String(length=30), nullable=False),
    sa.Column('color', sa.String(length=20), nullable=False),
    sa.Column('display_order', sa.Integer(), nullable=False),
    sa.Column('is_renewable', sa.Boolean(), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_energy_sources'))
    )
    op.create_index(op.f('ix_energy_sources_code'), 'energy_sources', ['code'], unique=True)
    op.create_table('finance_schemes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('provider', sa.String(length=180), nullable=False),
    sa.Column('scheme_type', sa.String(length=40), nullable=False),
    sa.Column('category', sa.String(length=60), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('eligibility', sa.Text(), nullable=False),
    sa.Column('benefits', sa.Text(), nullable=False),
    sa.Column('interest_rate_min', sa.Float(), nullable=True),
    sa.Column('interest_rate_max', sa.Float(), nullable=True),
    sa.Column('rate_verified', sa.Boolean(), nullable=False),
    sa.Column('rate_note', sa.String(length=300), nullable=False),
    sa.Column('tenure_months_min', sa.Integer(), nullable=True),
    sa.Column('tenure_months_max', sa.Integer(), nullable=True),
    sa.Column('max_amount', sa.Float(), nullable=True),
    sa.Column('application_url', sa.String(length=500), nullable=True),
    sa.Column('source_url', sa.String(length=500), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('is_sample', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_finance_schemes'))
    )
    op.create_index(op.f('ix_finance_schemes_scheme_type'), 'finance_schemes', ['scheme_type'], unique=False)
    op.create_table('green_jobs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=180), nullable=False),
    sa.Column('category', sa.String(length=60), nullable=False),
    sa.Column('organization', sa.String(length=180), nullable=False),
    sa.Column('location', sa.String(length=120), nullable=False),
    sa.Column('state', sa.String(length=80), nullable=False),
    sa.Column('employment_type', sa.String(length=40), nullable=False),
    sa.Column('experience_level', sa.String(length=40), nullable=False),
    sa.Column('salary_min', sa.Float(), nullable=True),
    sa.Column('salary_max', sa.Float(), nullable=True),
    sa.Column('skills', sa.JSON(), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('application_url', sa.String(length=500), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('is_sample', sa.Boolean(), nullable=False),
    sa.Column('posted_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_green_jobs'))
    )
    op.create_index(op.f('ix_green_jobs_category'), 'green_jobs', ['category'], unique=False)
    op.create_index(op.f('ix_green_jobs_state'), 'green_jobs', ['state'], unique=False)
    op.create_table('recyclers',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=180), nullable=False),
    sa.Column('city', sa.String(length=80), nullable=False),
    sa.Column('state', sa.String(length=80), nullable=False),
    sa.Column('address', sa.String(length=300), nullable=False),
    sa.Column('accepted_categories', sa.JSON(), nullable=False),
    sa.Column('capacity_tonnes_per_month', sa.Float(), nullable=True),
    sa.Column('certification', sa.String(length=180), nullable=False),
    sa.Column('contact_email', sa.String(length=180), nullable=True),
    sa.Column('contact_phone', sa.String(length=40), nullable=True),
    sa.Column('is_verified', sa.Boolean(), nullable=False),
    sa.Column('is_sample', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_recyclers'))
    )
    op.create_index(op.f('ix_recyclers_city'), 'recyclers', ['city'], unique=False)
    op.create_index(op.f('ix_recyclers_state'), 'recyclers', ['state'], unique=False)
    op.create_table('air_quality_readings',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('city', sa.String(length=80), nullable=False),
    sa.Column('state', sa.String(length=80), nullable=False),
    sa.Column('aqi', sa.Float(), nullable=False),
    sa.Column('pm25', sa.Float(), nullable=True),
    sa.Column('pm10', sa.Float(), nullable=True),
    sa.Column('category', sa.String(length=40), nullable=False),
    sa.Column('measured_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('is_sample', sa.Boolean(), nullable=False),
    sa.Column('data_source_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['data_source_id'], ['data_sources.id'], name=op.f('fk_air_quality_readings_data_source_id_data_sources'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_air_quality_readings')),
    sa.UniqueConstraint('city', 'measured_at', name='uq_air_quality_city_time')
    )
    op.create_index(op.f('ix_air_quality_readings_city'), 'air_quality_readings', ['city'], unique=False)
    op.create_table('environmental_impacts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('region', sa.String(length=80), nullable=False),
    sa.Column('year', sa.Integer(), nullable=False),
    sa.Column('co2_avoided_tonnes', sa.Float(), nullable=False),
    sa.Column('renewable_generation_gwh', sa.Float(), nullable=False),
    sa.Column('trees_equivalent', sa.Float(), nullable=False),
    sa.Column('is_estimated', sa.Boolean(), nullable=False),
    sa.Column('data_source_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('co2_avoided_tonnes >= 0', name='ck_impact_co2_non_negative'),
    sa.ForeignKeyConstraint(['data_source_id'], ['data_sources.id'], name=op.f('fk_environmental_impacts_data_source_id_data_sources'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_environmental_impacts')),
    sa.UniqueConstraint('region', 'year', name='uq_impact_region_year')
    )
    op.create_index(op.f('ix_environmental_impacts_year'), 'environmental_impacts', ['year'], unique=False)
    op.create_table('national_energy_statistics',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('year', sa.Integer(), nullable=False),
    sa.Column('energy_source_id', sa.Integer(), nullable=False),
    sa.Column('installed_capacity_mw', sa.Float(), nullable=False),
    sa.Column('generation_gwh', sa.Float(), nullable=False),
    sa.Column('capacity_share_pct', sa.Float(), nullable=False),
    sa.Column('generation_share_pct', sa.Float(), nullable=False),
    sa.Column('is_estimated', sa.Boolean(), nullable=False),
    sa.Column('data_source_id', sa.Integer(), nullable=True),
    sa.Column('retrieved_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('generation_gwh >= 0', name='ck_nes_generation_non_negative'),
    sa.CheckConstraint('installed_capacity_mw >= 0', name='ck_nes_capacity_non_negative'),
    sa.ForeignKeyConstraint(['data_source_id'], ['data_sources.id'], name=op.f('fk_national_energy_statistics_data_source_id_data_sources'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['energy_source_id'], ['energy_sources.id'], name=op.f('fk_national_energy_statistics_energy_source_id_energy_sources'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_national_energy_statistics')),
    sa.UniqueConstraint('year', 'energy_source_id', name='uq_national_energy_year_source')
    )
    op.create_index(op.f('ix_national_energy_statistics_energy_source_id'), 'national_energy_statistics', ['energy_source_id'], unique=False)
    op.create_index(op.f('ix_national_energy_statistics_year'), 'national_energy_statistics', ['year'], unique=False)
    op.create_table('state_energy_statistics',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('state', sa.String(length=80), nullable=False),
    sa.Column('year', sa.Integer(), nullable=False),
    sa.Column('solar_capacity_mw', sa.Float(), nullable=False),
    sa.Column('wind_capacity_mw', sa.Float(), nullable=False),
    sa.Column('total_renewable_mw', sa.Float(), nullable=False),
    sa.Column('co2_avoided_tonnes', sa.Float(), nullable=False),
    sa.Column('air_quality_index', sa.Float(), nullable=True),
    sa.Column('pm25', sa.Float(), nullable=True),
    sa.Column('is_estimated', sa.Boolean(), nullable=False),
    sa.Column('data_source_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('solar_capacity_mw >= 0', name='ck_ses_solar_non_negative'),
    sa.CheckConstraint('wind_capacity_mw >= 0', name='ck_ses_wind_non_negative'),
    sa.ForeignKeyConstraint(['data_source_id'], ['data_sources.id'], name=op.f('fk_state_energy_statistics_data_source_id_data_sources'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_state_energy_statistics')),
    sa.UniqueConstraint('state', 'year', name='uq_state_energy_state_year')
    )
    op.create_index(op.f('ix_state_energy_statistics_state'), 'state_energy_statistics', ['state'], unique=False)
    op.create_index(op.f('ix_state_energy_statistics_year'), 'state_energy_statistics', ['year'], unique=False)
    op.create_table('weather_forecasts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('location', sa.String(length=120), nullable=False),
    sa.Column('state', sa.String(length=80), nullable=False),
    sa.Column('forecast_date', sa.Date(), nullable=False),
    sa.Column('temperature_c', sa.Float(), nullable=False),
    sa.Column('irradiance_kwh_m2_day', sa.Float(), nullable=False),
    sa.Column('wind_speed_ms', sa.Float(), nullable=False),
    sa.Column('cloud_cover_pct', sa.Float(), nullable=False),
    sa.Column('source_id', sa.Integer(), nullable=True),
    sa.Column('is_sample', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['source_id'], ['data_sources.id'], name=op.f('fk_weather_forecasts_source_id_data_sources'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_weather_forecasts')),
    sa.UniqueConstraint('location', 'forecast_date', name='uq_weather_location_forecast_date')
    )
    op.create_index(op.f('ix_weather_forecasts_forecast_date'), 'weather_forecasts', ['forecast_date'], unique=False)
    op.create_index(op.f('ix_weather_forecasts_location'), 'weather_forecasts', ['location'], unique=False)
    op.create_table('audit_logs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('user_email', sa.String(length=255), nullable=False),
    sa.Column('action', sa.String(length=80), nullable=False),
    sa.Column('module', sa.String(length=60), nullable=False),
    sa.Column('entity_type', sa.String(length=80), nullable=True),
    sa.Column('entity_id', sa.Integer(), nullable=True),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('details', sa.JSON(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_audit_logs_user_id_users'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_audit_logs'))
    )
    op.create_index(op.f('ix_audit_logs_created_at'), 'audit_logs', ['created_at'], unique=False)
    op.create_index(op.f('ix_audit_logs_module'), 'audit_logs', ['module'], unique=False)
    op.create_index(op.f('ix_audit_logs_user_id'), 'audit_logs', ['user_id'], unique=False)
    op.create_table('generation_forecasts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('location', sa.String(length=120), nullable=False),
    sa.Column('state', sa.String(length=80), nullable=False),
    sa.Column('forecast_date', sa.Date(), nullable=False),
    sa.Column('solar_kwp', sa.Float(), nullable=False),
    sa.Column('wind_kwp', sa.Float(), nullable=False),
    sa.Column('solar_generation_kwh', sa.Float(), nullable=False),
    sa.Column('wind_generation_kwh', sa.Float(), nullable=False),
    sa.Column('method', sa.String(length=60), nullable=False),
    sa.Column('is_estimated', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_generation_forecasts_user_id_users'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_generation_forecasts'))
    )
    op.create_index(op.f('ix_generation_forecasts_forecast_date'), 'generation_forecasts', ['forecast_date'], unique=False)
    op.create_index(op.f('ix_generation_forecasts_user_id'), 'generation_forecasts', ['user_id'], unique=False)
    op.create_table('job_applications',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('job_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=30), nullable=False),
    sa.Column('cover_note', sa.Text(), nullable=False),
    sa.Column('applied_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['job_id'], ['green_jobs.id'], name=op.f('fk_job_applications_job_id_green_jobs'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_job_applications_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_job_applications')),
    sa.UniqueConstraint('job_id', 'user_id', name='uq_job_application_job_user')
    )
    op.create_index(op.f('ix_job_applications_job_id'), 'job_applications', ['job_id'], unique=False)
    op.create_index(op.f('ix_job_applications_user_id'), 'job_applications', ['user_id'], unique=False)
    op.create_table('recycling_transactions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('recycler_id', sa.Integer(), nullable=False),
    sa.Column('waste_category', sa.String(length=50), nullable=False),
    sa.Column('quantity_kg', sa.Float(), nullable=False),
    sa.Column('status', sa.String(length=30), nullable=False),
    sa.Column('pickup_date', sa.Date(), nullable=True),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('traceability_code', sa.String(length=40), nullable=False),
    sa.Column('notes', sa.Text(), nullable=False),
    sa.Column('is_sample', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['recycler_id'], ['recyclers.id'], name=op.f('fk_recycling_transactions_recycler_id_recyclers'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_recycling_transactions_user_id_users'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_recycling_transactions'))
    )
    op.create_index(op.f('ix_recycling_transactions_recycler_id'), 'recycling_transactions', ['recycler_id'], unique=False)
    op.create_index(op.f('ix_recycling_transactions_status'), 'recycling_transactions', ['status'], unique=False)
    op.create_index(op.f('ix_recycling_transactions_traceability_code'), 'recycling_transactions', ['traceability_code'], unique=True)
    op.create_index(op.f('ix_recycling_transactions_user_id'), 'recycling_transactions', ['user_id'], unique=False)
    op.create_index(op.f('ix_recycling_transactions_waste_category'), 'recycling_transactions', ['waste_category'], unique=False)
    op.create_table('rpo_targets',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('owner_id', sa.Integer(), nullable=False),
    sa.Column('entity_type', sa.String(length=30), nullable=False),
    sa.Column('entity_name', sa.String(length=180), nullable=False),
    sa.Column('state', sa.String(length=80), nullable=False),
    sa.Column('year', sa.Integer(), nullable=False),
    sa.Column('obligated_energy_mwh', sa.Float(), nullable=False),
    sa.Column('solar_target_pct', sa.Float(), nullable=False),
    sa.Column('non_solar_target_pct', sa.Float(), nullable=False),
    sa.Column('total_target_pct', sa.Float(), nullable=False),
    sa.Column('notes', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('non_solar_target_pct BETWEEN 0 AND 100', name='ck_rpo_non_solar_pct'),
    sa.CheckConstraint('obligated_energy_mwh >= 0', name='ck_rpo_energy_non_negative'),
    sa.CheckConstraint('solar_target_pct BETWEEN 0 AND 100', name='ck_rpo_solar_pct'),
    sa.CheckConstraint('year BETWEEN 2025 AND 2030', name='ck_rpo_year_range'),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], name=op.f('fk_rpo_targets_owner_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_rpo_targets')),
    sa.UniqueConstraint('owner_id', 'entity_name', 'year', name='uq_rpo_owner_entity_year')
    )
    op.create_index(op.f('ix_rpo_targets_owner_id'), 'rpo_targets', ['owner_id'], unique=False)
    op.create_index(op.f('ix_rpo_targets_year'), 'rpo_targets', ['year'], unique=False)
    op.create_table('solar_calculations',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('location', sa.String(length=120), nullable=False),
    sa.Column('state', sa.String(length=80), nullable=False),
    sa.Column('customer_type', sa.String(length=40), nullable=False),
    sa.Column('monthly_consumption_kwh', sa.Float(), nullable=False),
    sa.Column('rooftop_area_sqm', sa.Float(), nullable=False),
    sa.Column('tariff_per_kwh', sa.Float(), nullable=False),
    sa.Column('recommended_kwp', sa.Float(), nullable=False),
    sa.Column('installation_cost', sa.Float(), nullable=False),
    sa.Column('subsidy_amount', sa.Float(), nullable=False),
    sa.Column('net_cost', sa.Float(), nullable=False),
    sa.Column('annual_generation_kwh', sa.Float(), nullable=False),
    sa.Column('annual_savings', sa.Float(), nullable=False),
    sa.Column('payback_years', sa.Float(), nullable=True),
    sa.Column('lifetime_savings', sa.Float(), nullable=False),
    sa.Column('co2_reduction_kg', sa.Float(), nullable=False),
    sa.Column('assumptions', sa.JSON(), nullable=False),
    sa.Column('is_estimate', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('monthly_consumption_kwh > 0', name='ck_solar_calc_consumption'),
    sa.CheckConstraint('recommended_kwp >= 0', name='ck_solar_calc_kwp'),
    sa.CheckConstraint('rooftop_area_sqm > 0', name='ck_solar_calc_area'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_solar_calculations_user_id_users'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_solar_calculations'))
    )
    op.create_index(op.f('ix_solar_calculations_user_id'), 'solar_calculations', ['user_id'], unique=False)
    op.create_table('storage_recommendations',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('location', sa.String(length=120), nullable=False),
    sa.Column('state', sa.String(length=80), nullable=False),
    sa.Column('daily_consumption_kwh', sa.Float(), nullable=False),
    sa.Column('solar_kwp', sa.Float(), nullable=False),
    sa.Column('wind_kwp', sa.Float(), nullable=False),
    sa.Column('recommended_battery_kwh', sa.Float(), nullable=False),
    sa.Column('backup_hours', sa.Float(), nullable=False),
    sa.Column('estimated_cost', sa.Float(), nullable=False),
    sa.Column('assumptions', sa.JSON(), nullable=False),
    sa.Column('is_estimate', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_storage_recommendations_user_id_users'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_storage_recommendations'))
    )
    op.create_index(op.f('ix_storage_recommendations_user_id'), 'storage_recommendations', ['user_id'], unique=False)
    op.create_table('rpo_compliance_records',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('target_id', sa.Integer(), nullable=False),
    sa.Column('year', sa.Integer(), nullable=False),
    sa.Column('actual_solar_mwh', sa.Float(), nullable=False),
    sa.Column('actual_non_solar_mwh', sa.Float(), nullable=False),
    sa.Column('actual_total_mwh', sa.Float(), nullable=False),
    sa.Column('required_mwh', sa.Float(), nullable=False),
    sa.Column('target_snapshot_pct', sa.Float(), nullable=False),
    sa.Column('compliance_pct', sa.Float(), nullable=False),
    sa.Column('shortfall_mwh', sa.Float(), nullable=False),
    sa.Column('surplus_mwh', sa.Float(), nullable=False),
    sa.Column('status', sa.String(length=30), nullable=False),
    sa.Column('notes', sa.Text(), nullable=False),
    sa.Column('recorded_by', sa.Integer(), nullable=True),
    sa.Column('recorded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('actual_non_solar_mwh >= 0', name='ck_rpo_actual_non_solar_non_negative'),
    sa.CheckConstraint('actual_solar_mwh >= 0', name='ck_rpo_actual_solar_non_negative'),
    sa.ForeignKeyConstraint(['recorded_by'], ['users.id'], name=op.f('fk_rpo_compliance_records_recorded_by_users'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['target_id'], ['rpo_targets.id'], name=op.f('fk_rpo_compliance_records_target_id_rpo_targets'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_rpo_compliance_records')),
    sa.UniqueConstraint('target_id', 'year', name='uq_rpo_compliance_target_year')
    )
    op.create_index(op.f('ix_rpo_compliance_records_target_id'), 'rpo_compliance_records', ['target_id'], unique=False)
    op.create_index(op.f('ix_rpo_compliance_records_year'), 'rpo_compliance_records', ['year'], unique=False)
    op.add_column('users', sa.Column('organization', sa.String(length=160), nullable=True))
    op.add_column('users', sa.Column('state', sa.String(length=80), nullable=True))
    op.add_column('users', sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False))
    op.add_column('users', sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True))
    op.drop_constraint('ck_users_role', 'users', type_='check')
    op.alter_column('users', 'role',
               existing_type=sa.VARCHAR(length=20),
               type_=sa.VARCHAR(length=30),
               existing_nullable=False,
               existing_server_default=sa.text("'RESIDENT'::character varying"))
    op.create_check_constraint(
        'ck_users_role',
        'users',
        "role IN ('ADMIN', 'RESIDENT', 'CITIZEN', 'DISCOM', 'INDUSTRY', "
        "'FINANCIAL_INSTITUTION', 'POLICYMAKER')",
    )


def downgrade() -> None:
    op.drop_constraint('ck_users_role', 'users', type_='check')
    op.execute(
        "UPDATE users SET role = 'RESIDENT' "
        "WHERE role IN ('CITIZEN', 'DISCOM', 'INDUSTRY', "
        "'FINANCIAL_INSTITUTION', 'POLICYMAKER')"
    )
    op.alter_column('users', 'role',
               existing_type=sa.VARCHAR(length=30),
               type_=sa.VARCHAR(length=20),
               existing_nullable=False,
               existing_server_default=sa.text("'RESIDENT'::character varying"))
    op.create_check_constraint(
        'ck_users_role', 'users', "role IN ('ADMIN', 'RESIDENT')"
    )
    op.drop_column('users', 'last_login_at')
    op.drop_column('users', 'is_active')
    op.drop_column('users', 'state')
    op.drop_column('users', 'organization')
    op.drop_index(op.f('ix_rpo_compliance_records_year'), table_name='rpo_compliance_records')
    op.drop_index(op.f('ix_rpo_compliance_records_target_id'), table_name='rpo_compliance_records')
    op.drop_table('rpo_compliance_records')
    op.drop_index(op.f('ix_storage_recommendations_user_id'), table_name='storage_recommendations')
    op.drop_table('storage_recommendations')
    op.drop_index(op.f('ix_solar_calculations_user_id'), table_name='solar_calculations')
    op.drop_table('solar_calculations')
    op.drop_index(op.f('ix_rpo_targets_year'), table_name='rpo_targets')
    op.drop_index(op.f('ix_rpo_targets_owner_id'), table_name='rpo_targets')
    op.drop_table('rpo_targets')
    op.drop_index(op.f('ix_recycling_transactions_waste_category'), table_name='recycling_transactions')
    op.drop_index(op.f('ix_recycling_transactions_user_id'), table_name='recycling_transactions')
    op.drop_index(op.f('ix_recycling_transactions_traceability_code'), table_name='recycling_transactions')
    op.drop_index(op.f('ix_recycling_transactions_status'), table_name='recycling_transactions')
    op.drop_index(op.f('ix_recycling_transactions_recycler_id'), table_name='recycling_transactions')
    op.drop_table('recycling_transactions')
    op.drop_index(op.f('ix_job_applications_user_id'), table_name='job_applications')
    op.drop_index(op.f('ix_job_applications_job_id'), table_name='job_applications')
    op.drop_table('job_applications')
    op.drop_index(op.f('ix_generation_forecasts_user_id'), table_name='generation_forecasts')
    op.drop_index(op.f('ix_generation_forecasts_forecast_date'), table_name='generation_forecasts')
    op.drop_table('generation_forecasts')
    op.drop_index(op.f('ix_audit_logs_user_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_module'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_created_at'), table_name='audit_logs')
    op.drop_table('audit_logs')
    op.drop_index(op.f('ix_weather_forecasts_location'), table_name='weather_forecasts')
    op.drop_index(op.f('ix_weather_forecasts_forecast_date'), table_name='weather_forecasts')
    op.drop_table('weather_forecasts')
    op.drop_index(op.f('ix_state_energy_statistics_year'), table_name='state_energy_statistics')
    op.drop_index(op.f('ix_state_energy_statistics_state'), table_name='state_energy_statistics')
    op.drop_table('state_energy_statistics')
    op.drop_index(op.f('ix_national_energy_statistics_year'), table_name='national_energy_statistics')
    op.drop_index(op.f('ix_national_energy_statistics_energy_source_id'), table_name='national_energy_statistics')
    op.drop_table('national_energy_statistics')
    op.drop_index(op.f('ix_environmental_impacts_year'), table_name='environmental_impacts')
    op.drop_table('environmental_impacts')
    op.drop_index(op.f('ix_air_quality_readings_city'), table_name='air_quality_readings')
    op.drop_table('air_quality_readings')
    op.drop_index(op.f('ix_recyclers_state'), table_name='recyclers')
    op.drop_index(op.f('ix_recyclers_city'), table_name='recyclers')
    op.drop_table('recyclers')
    op.drop_index(op.f('ix_green_jobs_state'), table_name='green_jobs')
    op.drop_index(op.f('ix_green_jobs_category'), table_name='green_jobs')
    op.drop_table('green_jobs')
    op.drop_index(op.f('ix_finance_schemes_scheme_type'), table_name='finance_schemes')
    op.drop_table('finance_schemes')
    op.drop_index(op.f('ix_energy_sources_code'), table_name='energy_sources')
    op.drop_table('energy_sources')
    op.drop_index(op.f('ix_data_sources_code'), table_name='data_sources')
    op.drop_table('data_sources')
