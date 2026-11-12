"""Idempotent seed data for the India Green Grid modules.

All opportunity and statistical records are explicitly sample data.  The seed
is safe to run repeatedly: natural keys are checked before inserts.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.green_grid import (
    FinanceScheme,
    GreenJob,
    JobApplication,
    Recycler,
    RecyclingEvent,
    RecyclingTransaction,
    RpoTarget,
    SolarCalculation,
    StateEnergyStatistic,
)
from app.models.user import User, UserRole
from app.services import (
    forecast_service,
    jobs_service,
    rpo_service,
    solar_calculator_service,
)
from app.services.ingestion.service import (
    SEED_DIR,
    ensure_data_sources,
    ingest_all,
    seed_weather_data,
)
from app.services.seed_service import DEV_RESIDENT_PASSWORD_FALLBACK

logger = logging.getLogger(__name__)

STAKEHOLDER_ACCOUNTS = [
    {
        "name": "Aarav Citizen",
        "email": "citizen@solarequity.com",
        "role": UserRole.CITIZEN,
        "organization": None,
        "state": "Delhi",
    },
    {
        "name": "Demo DISCOM Officer",
        "email": "discom@solarequity.com",
        "role": UserRole.DISCOM,
        "organization": "Jaipur Vidyut Vitran Nigam (sample)",
        "state": "Rajasthan",
    },
    {
        "name": "Demo Industry Manager",
        "email": "industry@solarequity.com",
        "role": UserRole.INDUSTRY,
        "organization": "Bharat Steel Works (sample)",
        "state": "Gujarat",
    },
    {
        "name": "Demo Finance Analyst",
        "email": "finance@solarequity.com",
        "role": UserRole.FINANCIAL_INSTITUTION,
        "organization": "Bharat Green Capital (sample)",
        "state": "Maharashtra",
    },
    {
        "name": "Demo Policy Analyst",
        "email": "policy@solarequity.com",
        "role": UserRole.POLICYMAKER,
        "organization": "MNRE Policy Cell (sample)",
        "state": "Delhi",
    },
]


@dataclass(frozen=True)
class PlatformSeedResult:
    accounts_created: int
    accounts_existing: int
    data_sources: int
    jobs: int
    finance_schemes: int
    recyclers: int
    rpo_targets: int
    recycling_transactions: int
    solar_calculations: int
    forecast_locations: int


def _seed_dir() -> Path:
    return SEED_DIR


def _load(filename: str) -> dict[str, Any]:
    with (_seed_dir() / filename).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _demo_password() -> str:
    if settings.is_production and not settings.demo_resident_password:
        raise RuntimeError(
            "DEMO_RESIDENT_PASSWORD is required to seed stakeholder demo accounts."
        )
    return settings.demo_resident_password or DEV_RESIDENT_PASSWORD_FALLBACK


def seed_stakeholder_users(db: Session) -> tuple[int, int]:
    created = 0
    existing = 0
    password = _demo_password()
    for account in STAKEHOLDER_ACCOUNTS:
        user = db.scalar(select(User).where(User.email == account["email"]))
        if user is not None:
            existing += 1
            if not user.organization and account["organization"]:
                user.organization = account["organization"]
            if not user.state and account["state"]:
                user.state = account["state"]
            continue
        db.add(
            User(
                name=account["name"],
                email=account["email"],
                hashed_password=hash_password(password),
                role=account["role"],
                organization=account["organization"],
                state=account["state"],
                is_active=True,
                verification_status="VERIFIED",
                verification_note="Demonstration account pre-verified by the seed.",
                verified_at=datetime.now(timezone.utc),
            )
        )
        created += 1
    db.commit()
    return created, existing


def seed_jobs(db: Session) -> int:
    payload = _load("green_jobs.json")
    created = 0
    for item in payload.get("jobs", []):
        existing = db.scalar(
            select(GreenJob).where(
                GreenJob.title == item["title"],
                GreenJob.organization == item["organization"],
            )
        )
        if existing is not None:
            continue
        db.add(
            GreenJob(
                title=item["title"],
                category=item["category"],
                organization=item["organization"],
                location=item["location"],
                state=item["state"],
                employment_type=item["employment_type"],
                experience_level=item["experience_level"],
                salary_min=item.get("salary_min"),
                salary_max=item.get("salary_max"),
                skills=item.get("skills", []),
                description=item["description"],
                eligibility=item.get("eligibility")
                or (
                    f"{str(item.get('experience_level', 'MID')).title()}-level role. "
                    f"Required skills: {', '.join(item.get('skills', []))}. "
                    "Demonstration listing - confirm requirements with the employer."
                ),
                application_url=item.get("application_url"),
                source_name=item.get("source_name", "Sample demonstration record"),
                source_url=item.get("source_url"),
                verification_status=item.get("verification_status", "SAMPLE"),
                is_active=True,
                is_sample=item.get("verification_status", "SAMPLE") == "SAMPLE",
            )
        )
        created += 1
    db.commit()
    return created


def seed_finance(db: Session) -> int:
    payload = _load("finance_schemes.json")
    created = 0
    for item in payload.get("schemes", []):
        existing = db.scalar(
            select(FinanceScheme).where(
                FinanceScheme.name == item["name"],
                FinanceScheme.provider == item["provider"],
            )
        )
        if existing is not None:
            continue
        db.add(
            FinanceScheme(
                name=item["name"],
                provider=item["provider"],
                scheme_type=item["scheme_type"],
                category=item["category"],
                description=item["description"],
                eligibility=item["eligibility"],
                benefits=item["benefits"],
                interest_rate_min=item.get("interest_rate_min"),
                interest_rate_max=item.get("interest_rate_max"),
                rate_verified=bool(item.get("rate_verified", False)),
                rate_note=item.get("rate_note", ""),
                tenure_months_min=item.get("tenure_months_min"),
                tenure_months_max=item.get("tenure_months_max"),
                max_amount=item.get("max_amount"),
                application_url=item.get("application_url"),
                source_url=item.get("source_url"),
                limitations=item.get("limitations")
                or (
                    "Sample catalogue entry. Terms, rates and availability are "
                    "not verified live; confirm with the provider."
                ),
                last_verified_at=item.get("last_verified_at"),
                verification_status=item.get("verification_status", "SAMPLE"),
                is_active=True,
                is_sample=item.get("verification_status", "SAMPLE") == "SAMPLE",
            )
        )
        created += 1
    db.commit()
    return created


def seed_recyclers(db: Session) -> int:
    payload = _load("recyclers.json")
    created = 0
    for item in payload.get("recyclers", []):
        existing = db.scalar(
            select(Recycler).where(
                Recycler.name == item["name"], Recycler.city == item["city"]
            )
        )
        if existing is not None:
            continue
        db.add(
            Recycler(
                name=item["name"],
                city=item["city"],
                state=item["state"],
                address=item.get("address", ""),
                accepted_categories=item.get("accepted_categories", []),
                capacity_tonnes_per_month=item.get("capacity_tonnes_per_month"),
                certification=item.get("certification", ""),
                contact_email=item.get("contact_email"),
                contact_phone=item.get("contact_phone"),
                is_verified=bool(item.get("is_verified", False)),
                is_sample=True,
            )
        )
        created += 1
    db.commit()
    return created


def seed_rpo(db: Session) -> int:
    discom = db.scalar(select(User).where(User.email == "discom@solarequity.com"))
    industry = db.scalar(select(User).where(User.email == "industry@solarequity.com"))
    if discom is None or industry is None:
        return 0

    entities = [
        {
            "user": discom,
            "entity_type": "DISCOM",
            "entity_name": "Jaipur Vidyut Vitran Nigam (sample)",
            "entity_code": "JVVNL-SAMPLE",
            "state": "Rajasthan",
            "base_energy": 12_000_000.0,
            "solar": 9.5,
            "non_solar": 12.5,
            "compliance": {2025: (0.96, 0.91), 2026: (0.82, 0.86)},
        },
        {
            "user": industry,
            "entity_type": "INDUSTRY",
            "entity_name": "Bharat Steel Works (sample)",
            "entity_code": "BSW-SAMPLE",
            "state": "Gujarat",
            "base_energy": 480_000.0,
            "solar": 10.0,
            "non_solar": 11.0,
            "compliance": {2025: (1.04, 0.98), 2026: (0.91, 0.88)},
        },
    ]

    created = 0
    for entity in entities:
        for year in range(2025, 2031):
            existing = db.scalar(
                select(RpoTarget).where(
                    RpoTarget.owner_id == entity["user"].id,
                    RpoTarget.entity_name == entity["entity_name"],
                    RpoTarget.year == year,
                )
            )
            if existing is not None:
                if not existing.entity_code:
                    existing.entity_code = entity["entity_code"]
                    db.commit()
                continue
            obligated = entity["base_energy"] * (1 + (year - 2025) * 0.045)
            target = RpoTarget(
                owner_id=entity["user"].id,
                entity_type=entity["entity_type"],
                entity_name=entity["entity_name"],
                entity_code=entity["entity_code"],
                state=entity["state"],
                year=year,
                obligated_energy_mwh=round(obligated, 2),
                solar_target_pct=entity["solar"],
                non_solar_target_pct=entity["non_solar"],
                total_target_pct=round(entity["solar"] + entity["non_solar"], 2),
                notes="Sample RPO target created by the demonstration seed.",
            )
            db.add(target)
            db.commit()
            db.refresh(target)
            created += 1

            ratios = entity["compliance"].get(year)
            if ratios:
                required = obligated * target.total_target_pct / 100
                solar_required = obligated * entity["solar"] / 100
                non_solar_required = obligated * entity["non_solar"] / 100
                rpo_service.record_compliance(
                    db,
                    entity["user"],
                    target.id,
                    {
                        "actual_solar_mwh": round(solar_required * ratios[0], 2),
                        "actual_non_solar_mwh": round(
                            non_solar_required * ratios[1], 2
                        ),
                        "notes": "Sample compliance record created by the demo seed.",
                    },
                )
    return created


def seed_transactions(db: Session) -> int:
    citizen = db.scalar(select(User).where(User.email == "citizen@solarequity.com"))
    industry = db.scalar(select(User).where(User.email == "industry@solarequity.com"))
    recycler = db.scalar(select(Recycler).order_by(Recycler.id))
    if citizen is None or industry is None or recycler is None:
        return 0

    samples = [
        {
            "user": industry,
            "category": "SOLAR_PANEL",
            "quantity": 1850.0,
            "status": "RECYCLED",
            "code": "SEED-IGG-2026-A1",
            "notes": "Sample end-of-life module batch from a demonstration site.",
        },
        {
            "user": industry,
            "category": "EWASTE",
            "quantity": 420.0,
            "status": "IN_TRANSIT",
            "code": "SEED-IGG-2026-A2",
            "notes": "Sample inverter and cabling e-waste consignment.",
        },
        {
            "user": citizen,
            "category": "EV_BATTERY",
            "quantity": 65.0,
            "status": "SCHEDULED",
            "code": "SEED-IGG-2026-A3",
            "notes": "Sample scheduled battery collection.",
        },
        {
            "user": citizen,
            "category": "IT_EQUIPMENT",
            "quantity": 28.5,
            "status": "RECYCLED",
            "code": "SEED-IGG-2026-A4",
            "notes": "Sample office e-waste handover.",
        },
    ]
    created = 0
    for sample in samples:
        existing = db.scalar(
            select(RecyclingTransaction).where(
                RecyclingTransaction.traceability_code == sample["code"]
            )
        )
        if existing is not None:
            event_exists = db.scalar(
                select(RecyclingEvent.id).where(
                    RecyclingEvent.transaction_id == existing.id
                )
            )
            if event_exists is None:
                db.add(
                    RecyclingEvent(
                        transaction_id=existing.id,
                        status=existing.status,
                        note="Backfilled demonstration event by the idempotent seed.",
                        actor_role="SYSTEM",
                        created_at=datetime.now(timezone.utc),
                    )
                )
                db.commit()
            if existing.status == "RECYCLED" and not existing.material_recovered_kg:
                existing.material_recovered_kg = round(existing.quantity_kg * 0.72, 2)
                db.commit()
            continue
        selected = recycler
        if sample["category"] not in (selected.accepted_categories or []):
            selected = next(
                (
                    candidate
                    for candidate in db.scalars(select(Recycler)).all()
                    if sample["category"] in (candidate.accepted_categories or [])
                ),
                None,
            )
        if selected is None:
            continue
        completed = (
            datetime.now(timezone.utc) if sample["status"] == "RECYCLED" else None
        )
        transaction = RecyclingTransaction(
            user_id=sample["user"].id,
            recycler_id=selected.id,
            waste_category=sample["category"],
            quantity_kg=sample["quantity"],
            status=sample["status"],
            completed_at=completed,
            traceability_code=sample["code"],
            notes=sample["notes"],
            material_recovered_kg=0.0,
            verification_status="SAMPLE",
            is_sample=True,
        )
        db.add(transaction)
        db.flush()
        db.add(
            RecyclingEvent(
                transaction_id=transaction.id,
                status=sample["status"],
                note="Sample transaction created by the demonstration seed.",
                actor_role="SYSTEM",
                created_at=datetime.now(timezone.utc),
            )
        )
        created += 1
    db.commit()
    return created


def seed_calculations(db: Session) -> int:
    if db.scalar(select(SolarCalculation.id).limit(1)) is not None:
        return 0
    citizen = db.scalar(select(User).where(User.email == "citizen@solarequity.com"))
    industry = db.scalar(select(User).where(User.email == "industry@solarequity.com"))
    created = 0
    if citizen:
        solar_calculator_service.calculate(
            db,
            citizen,
            {
                "location": "New Delhi",
                "state": "Delhi",
                "customer_type": "RESIDENTIAL",
                "monthly_consumption_kwh": 420,
                "rooftop_area_sqm": 55,
                "tariff_per_kwh": 8.0,
            },
        )
        created += 1
    if industry:
        solar_calculator_service.calculate(
            db,
            industry,
            {
                "location": "Ahmedabad",
                "state": "Gujarat",
                "customer_type": "INDUSTRIAL",
                "monthly_consumption_kwh": 85000,
                "rooftop_area_sqm": 4200,
                "tariff_per_kwh": 7.1,
            },
        )
        created += 1
    return created


def seed_forecasts(db: Session) -> int:
    citizen = db.scalar(select(User).where(User.email == "citizen@solarequity.com"))
    if citizen is None:
        return 0
    from app.models.green_grid import StorageRecommendation

    if db.scalar(select(StorageRecommendation.id).limit(1)) is not None:
        return 0
    forecast_service.estimate(
        db,
        citizen,
        {
            "location": "New Delhi",
            "solar_kwp": 5,
            "wind_kwp": 0,
            "daily_consumption_kwh": 14,
            "backup_hours": 4,
        },
    )
    return 1


def seed_job_application(db: Session) -> int:
    citizen = db.scalar(select(User).where(User.email == "citizen@solarequity.com"))
    job = db.scalar(select(GreenJob).where(GreenJob.is_sample.is_(True)))
    if citizen is None or job is None:
        return 0
    existing = db.scalar(
        select(JobApplication).where(
            JobApplication.job_id == job.id,
            JobApplication.user_id == citizen.id,
        )
    )
    if existing is not None:
        return 0
    jobs_service.apply(db, citizen, job.id, "Sample application generated by seed.")
    return 1


def seed_platform_data(db: Session) -> PlatformSeedResult:
    ensure_data_sources(db)
    db.commit()
    ingest_all(db)
    seed_weather_data(db)
    accounts_created, accounts_existing = seed_stakeholder_users(db)
    jobs = seed_jobs(db)
    schemes = seed_finance(db)
    recyclers = seed_recyclers(db)
    rpo_targets = seed_rpo(db)
    transactions = seed_transactions(db)
    calculations = seed_calculations(db)
    seed_forecasts(db)
    seed_job_application(db)

    location_count = (
        db.scalar(
            select(StateEnergyStatistic.id).limit(1)
        )
        is not None
    )
    return PlatformSeedResult(
        accounts_created=accounts_created,
        accounts_existing=accounts_existing,
        data_sources=len(
            {item for item in db.scalars(select(StateEnergyStatistic.state)).all()}
        ),
        jobs=jobs,
        finance_schemes=schemes,
        recyclers=recyclers,
        rpo_targets=rpo_targets,
        recycling_transactions=transactions,
        solar_calculations=calculations,
        forecast_locations=1 if location_count else 0,
    )
