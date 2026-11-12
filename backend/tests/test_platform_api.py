"""India Green Grid API tests (D1-D9)."""

from __future__ import annotations

from datetime import date

from app.models.user import UserRole
from app.services.ingestion.service import (
    ensure_data_sources,
    ingest_all,
    seed_weather_data,
)
from tests.helpers import DEFAULT_PASSWORD, create_user, login_headers


def _ingest(db):
    ensure_data_sources(db)
    db.commit()
    ingest_all(db)
    seed_weather_data(db)


def _headers(client, db, role, email):
    create_user(db, email=email, role=role)
    return login_headers(client, email, DEFAULT_PASSWORD)


def test_energy_overview_is_calculated_in_backend(client, db):
    _ingest(db)
    headers = _headers(client, db, UserRole.DISCOM, "discom-energy@example.com")

    response = client.get("/api/energy/overview", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["has_data"] is True
    assert body["latest_year"] == 2025
    totals = body["totals"]
    assert totals["renewable_capacity_mw"] > 0
    assert totals["conventional_capacity_mw"] > 0
    assert 0 < totals["renewable_capacity_share_pct"] < 100
    assert len(body["sources"]) == 11
    assert len(body["capacity_series"]) == 7
    assert body["data"]["is_sample"] is True
    assert abs(sum(item["capacity_share_pct"] for item in body["sources"]) - 100) < 0.1


def test_rpo_target_and_compliance_math(client, db):
    headers = _headers(client, db, UserRole.DISCOM, "discom@example.com")

    created = client.post(
        "/api/rpo/targets",
        headers=headers,
        json={
            "entity_type": "DISCOM",
            "entity_name": "Test DISCOM",
            "state": "Rajasthan",
            "year": 2026,
            "obligated_energy_mwh": 100000,
            "solar_target_pct": 10,
            "non_solar_target_pct": 15,
            "notes": "test",
        },
    )
    assert created.status_code == 200, created.text
    target_id = created.json()["id"]
    assert created.json()["required_mwh"] == 25000

    compliance = client.post(
        f"/api/rpo/targets/{target_id}/compliance",
        headers=headers,
        json={"actual_solar_mwh": 12000, "actual_non_solar_mwh": 13000, "notes": ""},
    )
    assert compliance.status_code == 200, compliance.text
    body = compliance.json()
    assert body["actual_total_mwh"] == 25000
    assert body["compliance_pct"] == 100.0
    assert body["shortfall_mwh"] == 0
    assert body["status"] == "COMPLIANT"

    overview = client.get("/api/rpo/overview", headers=headers).json()
    assert overview["summary"]["target_count"] == 1
    assert overview["summary"]["compliant_count"] == 1
    assert overview["yearly_tracker"][1]["year"] == 2026


def test_rpo_is_forbidden_for_citizen(client, db):
    headers = _headers(client, db, UserRole.CITIZEN, "citizen-rpo@example.com")
    response = client.get("/api/rpo/overview", headers=headers)
    assert response.status_code == 403


def test_solar_calculator_persists_and_computes_subsidy(client, db):
    headers = _headers(client, db, UserRole.CITIZEN, "citizen-solar@example.com")
    response = client.post(
        "/api/solar/calculate",
        headers=headers,
        json={
            "location": "New Delhi",
            "state": "Delhi",
            "customer_type": "RESIDENTIAL",
            "monthly_consumption_kwh": 420,
            "rooftop_area_sqm": 55,
            "tariff_per_kwh": 8,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["recommended_kwp"] > 0
    assert body["installation_cost"] > 0
    assert body["subsidy_amount"] > 0
    assert body["net_cost"] == body["installation_cost"] - body["subsidy_amount"]
    assert body["annual_savings"] > 0
    assert body["payback_years"] > 0
    assert body["co2_reduction_kg"] > 0
    assert body["assumptions"]["disclaimer"]
    assert body["is_estimate"] is True

    history = client.get("/api/solar/calculations", headers=headers).json()
    assert history["total"] == 1

    commercial = client.post(
        "/api/solar/calculate",
        headers=headers,
        json={
            "location": "Mumbai",
            "state": "Maharashtra",
            "customer_type": "COMMERCIAL",
            "monthly_consumption_kwh": 5000,
            "rooftop_area_sqm": 500,
            "tariff_per_kwh": 9,
        },
    ).json()
    assert commercial["subsidy_amount"] == 0


def test_jobs_search_apply_and_duplicate_guard(client, db):
    _ingest(db)
    admin_headers = _headers(client, db, UserRole.ADMIN, "admin-jobs@example.com")
    created = client.post(
        "/api/jobs",
        headers=admin_headers,
        json={
            "title": "Test Solar Engineer",
            "category": "Solar",
            "organization": "Test Energy",
            "location": "Pune",
            "state": "Maharashtra",
            "employment_type": "FULL_TIME",
            "experience_level": "MID",
            "salary_min": 500000,
            "salary_max": 800000,
            "skills": ["Python", "PVsyst"],
            "description": "A sufficiently long test job description for validation.",
            "application_url": "https://example.com/job",
        },
    )
    assert created.status_code == 201, created.text
    job_id = created.json()["id"]

    citizen_headers = _headers(client, db, UserRole.CITIZEN, "citizen-job@example.com")
    listing = client.get(
        "/api/jobs", headers=citizen_headers, params={"search": "PVsyst"}
    ).json()
    assert listing["total"] == 1
    assert listing["items"][0]["has_applied"] is False

    applied = client.post(
        f"/api/jobs/{job_id}/apply",
        headers=citizen_headers,
        json={"cover_note": "Interested"},
    )
    assert applied.status_code == 200
    duplicate = client.post(
        f"/api/jobs/{job_id}/apply",
        headers=citizen_headers,
        json={"cover_note": "Again"},
    )
    assert duplicate.status_code == 409
    mine = client.get("/api/jobs/applications/me", headers=citizen_headers).json()
    assert mine["total"] == 1


def test_finance_list_and_compare(client, db):
    from app.services.platform_seed_service import seed_finance

    seed_finance(db)
    headers = _headers(client, db, UserRole.FINANCIAL_INSTITUTION, "finance@example.com")
    listing = client.get("/api/finance/schemes", headers=headers).json()
    assert listing["total"] >= 10
    ids = [item["id"] for item in listing["items"][:2]]
    compared = client.get(
        "/api/finance/compare", headers=headers, params={"ids": ",".join(map(str, ids))}
    )
    assert compared.status_code == 200
    assert compared.json()["total"] == 2
    assert all(item["rate_verified"] is False for item in compared.json()["items"])


def test_circular_transaction_traceability(client, db):
    from app.services.platform_seed_service import seed_recyclers

    seed_recyclers(db)
    headers = _headers(client, db, UserRole.INDUSTRY, "industry-circular@example.com")
    recyclers = client.get("/api/circular/recyclers", headers=headers).json()
    recycler = recyclers["items"][0]
    category = recycler["accepted_categories"][0]
    created = client.post(
        "/api/circular/transactions",
        headers=headers,
        json={
            "recycler_id": recycler["id"],
            "waste_category": category,
            "quantity_kg": 120.5,
            "notes": "test batch",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["traceability_code"].startswith("IGG-")
    assert body["status"] == "LOGGED"

    summary = client.get("/api/circular/summary", headers=headers).json()
    assert summary["totals"]["transaction_count"] == 1
    assert summary["totals"]["total_quantity_kg"] == 120.5

    updated = client.patch(
        f"/api/circular/transactions/{body['id']}",
        headers=headers,
        json={"status": "CANCELLED"},
    )
    assert updated.status_code == 200


def test_forecast_estimate_and_storage_recommendation(client, db):
    _ingest(db)
    headers = _headers(client, db, UserRole.DISCOM, "discom-forecast@example.com")
    locations = client.get("/api/forecast/locations", headers=headers).json()
    assert locations["total"] >= 1
    response = client.post(
        "/api/forecast/estimate",
        headers=headers,
        json={
            "location": locations["items"][0]["location"],
            "solar_kwp": 5,
            "wind_kwp": 2,
            "daily_consumption_kwh": 20,
            "backup_hours": 4,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["forecast"]) == 7
    assert body["forecast_type"] == "ESTIMATED"
    assert body["storage"]["recommended_battery_kwh"] > 0
    assert body["storage"]["backup_hours"] > 0
    assert body["assumptions"]["disclaimer"]


def test_dashboard_is_role_aware(client, db):
    _ingest(db)
    discom = _headers(client, db, UserRole.DISCOM, "discom-dash@example.com")
    citizen = _headers(client, db, UserRole.CITIZEN, "citizen-dash@example.com")

    discom_dashboard = client.get("/api/dashboard/overview", headers=discom).json()
    citizen_dashboard = client.get("/api/dashboard/overview", headers=citizen).json()

    assert discom_dashboard["rpo"] is not None
    assert citizen_dashboard["rpo"] is None
    assert discom_dashboard["user"]["role"] == "DISCOM"
    assert len(citizen_dashboard["role_focus"]) == 3
    assert citizen_dashboard["energy"]["has_data"] is True


def test_admin_portal_access_and_user_management(client, db):
    admin = _headers(client, db, UserRole.ADMIN, "admin-portal@example.com")
    citizen_headers = _headers(client, db, UserRole.CITIZEN, "citizen-admin@example.com")

    denied = client.get("/api/admin/overview", headers=citizen_headers)
    assert denied.status_code == 403

    overview = client.get("/api/admin/overview", headers=admin)
    assert overview.status_code == 200
    body = overview.json()
    assert body["users"]["total"] >= 2
    assert "data" in body

    listing = client.get("/api/admin/users", headers=admin).json()
    target = next(
        item for item in listing["items"] if item["email"] == "citizen-admin@example.com"
    )
    updated = client.patch(
        f"/api/admin/users/{target['id']}",
        headers=admin,
        json={"role": "INDUSTRY", "is_active": True},
    )
    assert updated.status_code == 200
    assert updated.json()["role"] == "INDUSTRY"


def test_stakeholder_registration_role(client, db):
    response = client.post(
        "/api/auth/register",
        json={
            "name": "Industry Account",
            "email": "newindustry@example.com",
            "password": "Password#2026",
            "role": "INDUSTRY",
            "organization": "Example Manufacturing",
            "state": "Gujarat",
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["role"] == "INDUSTRY"
    assert body["organization"] == "Example Manufacturing"

    escalation = client.post(
        "/api/auth/register",
        json={
            "name": "Sneaky Admin",
            "email": "sneaky2@example.com",
            "password": "Password#2026",
            "role": "ADMIN",
        },
    )
    assert escalation.status_code == 201
    assert escalation.json()["role"] == "RESIDENT"
