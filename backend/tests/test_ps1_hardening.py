"""PS1 hardening tests: verification, provenance, history and honest labels."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.models.user import UserRole
from app.services import weather_provider
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


def _headers(client, db, role, email, *, verification_status=None):
    user = create_user(db, email=email, role=role)
    if verification_status is not None:
        user.verification_status = verification_status
        db.commit()
    return login_headers(client, email, DEFAULT_PASSWORD)


def test_organisational_registration_requires_approval(client, db):
    response = client.post(
        "/api/auth/register",
        json={
            "name": "New DISCOM Officer",
            "email": "pending-discom@example.com",
            "password": "Password#2026",
            "role": "DISCOM",
            "organization": "Pending Discom",
            "state": "Rajasthan",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["verification_status"] == "PENDING"

    headers = login_headers(client, "pending-discom@example.com", "Password#2026")
    _ingest(db)
    readable = client.get("/api/energy/overview", headers=headers)
    assert readable.status_code == 200

    blocked = client.post(
        "/api/rpo/targets",
        headers=headers,
        json={
            "entity_type": "DISCOM",
            "entity_name": "Pending Discom",
            "state": "Rajasthan",
            "year": 2026,
            "obligated_energy_mwh": 1000,
            "solar_target_pct": 10,
            "non_solar_target_pct": 10,
        },
    )
    assert blocked.status_code == 403, blocked.text
    assert "pending administrator verification" in blocked.text.lower()

    admin = _headers(client, db, UserRole.ADMIN, "admin-approval@example.com")
    approvals = client.get("/api/admin/approvals", headers=admin).json()
    pending = next(
        item
        for item in approvals["items"]
        if item["email"] == "pending-discom@example.com"
    )
    approved = client.patch(
        f"/api/admin/users/{pending['id']}",
        headers=admin,
        json={"verification_status": "VERIFIED", "verification_note": "Verified."},
    )
    assert approved.status_code == 200
    assert approved.json()["verification_status"] == "VERIFIED"

    allowed = client.post(
        "/api/rpo/targets",
        headers=headers,
        json={
            "entity_type": "DISCOM",
            "entity_name": "Pending Discom",
            "entity_code": "PDCL-01",
            "state": "Rajasthan",
            "year": 2026,
            "obligated_energy_mwh": 1000,
            "solar_target_pct": 10,
            "non_solar_target_pct": 10,
        },
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["entity_code"] == "PDCL-01"


def test_rpo_compliance_history_is_append_only(client, db):
    headers = _headers(client, db, UserRole.DISCOM, "discom-history@example.com")
    created = client.post(
        "/api/rpo/targets",
        headers=headers,
        json={
            "entity_type": "DISCOM",
            "entity_name": "History Discom",
            "entity_code": "HD-01",
            "state": "Gujarat",
            "year": 2026,
            "obligated_energy_mwh": 10000,
            "solar_target_pct": 10,
            "non_solar_target_pct": 10,
        },
    ).json()

    for solar, non_solar in ((400, 400), (700, 800)):
        response = client.post(
            f"/api/rpo/targets/{created['id']}/compliance",
            headers=headers,
            json={
                "actual_solar_mwh": solar,
                "actual_non_solar_mwh": non_solar,
                "notes": "filing",
            },
        )
        assert response.status_code == 200, response.text

    history = client.get(
        f"/api/rpo/targets/{created['id']}/history", headers=headers
    ).json()
    assert history["total"] == 2
    assert history["entity_code"] == "HD-01"
    assert [item["compliance_pct"] for item in history["items"]] == [75.0, 40.0]

    overview = client.get("/api/rpo/overview", headers=headers).json()
    assert overview["regulatory_basis"]["framework"]
    assert overview["verification"]["can_write"] is True


def test_solar_calculator_preferences_and_subsidy_status(client, db):
    headers = _headers(client, db, UserRole.CITIZEN, "citizen-prefs@example.com")

    max_roof = client.post(
        "/api/solar/calculate",
        headers=headers,
        json={
            "location": "Jaipur",
            "state": "Rajasthan",
            "customer_type": "RESIDENTIAL",
            "monthly_consumption_kwh": 200,
            "rooftop_area_sqm": 80,
            "tariff_per_kwh": 7.5,
            "system_preference": "MAX_ROOF",
        },
    ).json()
    assert max_roof["limiting_factor"] == "rooftop_area"
    assert max_roof["subsidy_status"] == "CAPPED_AT_3KW"
    assert max_roof["scheme"]["scheme_name"].startswith("PM Surya Ghar")

    match_consumption = client.post(
        "/api/solar/calculate",
        headers=headers,
        json={
            "location": "Jaipur",
            "state": "Rajasthan",
            "customer_type": "RESIDENTIAL",
            "monthly_consumption_kwh": 200,
            "rooftop_area_sqm": 80,
            "tariff_per_kwh": 7.5,
            "system_preference": "MATCH_CONSUMPTION",
        },
    ).json()
    assert match_consumption["limiting_factor"] == "electricity_consumption"
    assert match_consumption["recommended_kwp"] < max_roof["recommended_kwp"]

    custom = client.post(
        "/api/solar/calculate",
        headers=headers,
        json={
            "location": "Jaipur",
            "state": "Rajasthan",
            "customer_type": "RESIDENTIAL",
            "monthly_consumption_kwh": 200,
            "rooftop_area_sqm": 20,
            "tariff_per_kwh": 7.5,
            "system_preference": "CUSTOM",
            "preferred_kwp": 50,
        },
    ).json()
    assert custom["recommended_kwp"] <= 20 / 5.5
    assert any("capped" in note.lower() for note in custom["notifications"])

    commercial = client.post(
        "/api/solar/calculate",
        headers=headers,
        json={
            "location": "Mumbai",
            "state": "Maharashtra",
            "customer_type": "COMMERCIAL",
            "monthly_consumption_kwh": 4000,
            "rooftop_area_sqm": 300,
            "tariff_per_kwh": 9,
        },
    ).json()
    assert commercial["subsidy_amount"] == 0
    assert commercial["subsidy_status"] == "NOT_ELIGIBLE"


def test_job_verification_and_expiry(client, db):
    admin = _headers(client, db, UserRole.ADMIN, "admin-jobs-verify@example.com")
    expired_at = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    created = client.post(
        "/api/jobs",
        headers=admin,
        json={
            "title": "Expired Solar Role",
            "category": "Solar",
            "organization": "Verified Employer",
            "location": "Pune",
            "state": "Maharashtra",
            "employment_type": "FULL_TIME",
            "experience_level": "MID",
            "salary_min": 400000,
            "salary_max": 600000,
            "skills": ["PVsyst"],
            "description": "A sufficiently long description for the expired listing test.",
            "eligibility": "Engineering degree and two years of experience.",
            "application_url": "https://example.com/jobs/expired",
            "source_name": "Employer careers page",
            "source_url": "https://example.com/careers",
            "verification_status": "VERIFIED_EXTERNAL",
            "expires_at": expired_at,
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["listing_status"] == "EXPIRED"
    assert created.json()["is_sample"] is False

    citizen = _headers(client, db, UserRole.CITIZEN, "citizen-expiry@example.com")
    assert client.get("/api/jobs", headers=citizen).json()["total"] == 0
    admin_listing = client.get(
        "/api/jobs",
        headers=admin,
        params={"include_inactive": "true", "include_expired": "true"},
    ).json()
    assert admin_listing["total"] == 1
    assert admin_listing["verification_summary"]["verified_external"] == 1


def test_finance_verification_provenance(client, db):
    admin = _headers(client, db, UserRole.ADMIN, "admin-finance-verify@example.com")
    created = client.post(
        "/api/finance/schemes",
        headers=admin,
        json={
            "name": "Verified Test Loan",
            "provider": "Test Bank",
            "scheme_type": "LOAN",
            "category": "Rooftop Solar",
            "description": "A test loan product used to verify provenance fields.",
            "eligibility": "Residential customers.",
            "benefits": "Indicative financing.",
            "limitations": "Rates change quarterly; confirm with the bank.",
            "last_verified_at": "2026-11-01",
            "verification_status": "VERIFIED_EXTERNAL",
            "rate_verified": True,
            "source_url": "https://example.com/loan",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["verification_status"] == "VERIFIED_EXTERNAL"
    assert body["last_verified_at"] == "2026-11-01"
    assert body["is_sample"] is False

    filtered = client.get(
        "/api/finance/schemes",
        headers=admin,
        params={"verification_status": "VERIFIED_EXTERNAL"},
    ).json()
    assert filtered["total"] == 1
    assert filtered["verification_summary"]["verified_external"] == 1


def test_circular_traceability_events_and_recovery(client, db):
    from app.services.platform_seed_service import seed_recyclers

    seed_recyclers(db)
    industry = _headers(client, db, UserRole.INDUSTRY, "industry-events@example.com")
    admin = _headers(client, db, UserRole.ADMIN, "admin-events@example.com")
    recycler = client.get("/api/circular/recyclers", headers=industry).json()["items"][0]
    category = recycler["accepted_categories"][0]

    created = client.post(
        "/api/circular/transactions",
        headers=industry,
        json={
            "recycler_id": recycler["id"],
            "waste_category": category,
            "quantity_kg": 100,
        },
    ).json()
    transaction_id = created["id"]
    assert created["verification_status"] == "SAMPLE"

    denied = client.patch(
        f"/api/circular/transactions/{transaction_id}",
        headers=industry,
        json={"material_recovered_kg": 80},
    )
    assert denied.status_code == 403

    advanced = client.patch(
        f"/api/circular/transactions/{transaction_id}",
        headers=admin,
        json={
            "status": "RECYCLED",
            "material_recovered_kg": 78.5,
            "verification_status": "VERIFIED",
        },
    )
    assert advanced.status_code == 200, advanced.text
    assert advanced.json()["material_recovered_kg"] == 78.5
    assert advanced.json()["recovery_rate_pct"] == 78.5
    assert advanced.json()["is_verified"] is True

    detail = client.get(
        f"/api/circular/transactions/{transaction_id}", headers=industry
    ).json()
    statuses = [event["status"] for event in detail["events"]]
    assert statuses == ["LOGGED", "RECYCLED"]
    assert detail["events"][-1]["actor_role"] == "ADMIN"

    summary = client.get("/api/circular/summary", headers=admin).json()
    assert summary["totals"]["recorded_material_recovery_kg"] == 78.5
    assert summary["totals"]["verified_transactions"] == 1


def test_ingestion_runs_and_dataset_statuses(client, db):
    _ingest(db)
    admin = _headers(client, db, UserRole.ADMIN, "admin-ingest@example.com")

    sources = client.get("/api/admin/data-sources", headers=admin).json()["items"]
    statuses = {item["code"]: item["dataset_status"] for item in sources}
    assert statuses["cea_installed_capacity"] == "SAMPLE"
    assert statuses["iea_renewables_outlook"] == "UNAVAILABLE"
    assert statuses["mnre_policy_assumptions"] == "ESTIMATED"
    assert all(
        status in {"LIVE", "SAMPLE", "ESTIMATED", "UNAVAILABLE", "STALE"}
        for status in statuses.values()
    )

    runs = client.get("/api/admin/ingestion-runs", headers=admin).json()
    assert runs["total"] > 0
    assert all(run["status"] in {"success", "failed", "unavailable"} for run in runs["items"])
    assert any(run["dataset_status"] == "SAMPLE" for run in runs["items"])

    overview = client.get("/api/admin/overview", headers=admin).json()
    assert overview["data"]["status_counts"]["SAMPLE"] >= 1
    assert overview["ingestion"]["runs_retained"] > 0


def test_forecast_labels_template_basis(client, db):
    _ingest(db)
    headers = _headers(client, db, UserRole.DISCOM, "discom-basis@example.com")
    body = client.post(
        "/api/forecast/estimate",
        headers=headers,
        json={
            "location": "New Delhi",
            "solar_kwp": 5,
            "wind_kwp": 0,
            "daily_consumption_kwh": 14,
            "backup_hours": 4,
        },
    ).json()

    assert body["forecast_type"] == "ESTIMATED"
    assert body["forecast_basis"] == "SAMPLE_TEMPLATE"
    assert body["data_source"]["status"] == "SAMPLE"
    assert body["forecast_period"]["days"] == 7
    assert body["generation_estimates"]["seven_day_total_kwh"] > 0
    assert body["storage"]["depth_of_discharge"] == 0.9
    assert body["storage"]["round_trip_efficiency"] == 0.92
    assert body["storage"]["reserve_capacity_kwh"] >= 0


def test_forecast_live_weather_basis(monkeypatch, client, db):
    _ingest(db)
    headers = _headers(client, db, UserRole.DISCOM, "discom-live@example.com")

    days = [
        weather_provider.WeatherDay(
            forecast_date=date.today() + timedelta(days=offset),
            temperature_c=30.0,
            irradiance_kwh_m2_day=5.0,
            wind_speed_ms=4.0,
            cloud_cover_pct=20.0,
            state="Delhi",
        )
        for offset in range(7)
    ]
    live = weather_provider.LiveWeather(
        location="New Delhi",
        state="Delhi",
        days=days,
        retrieved_at=datetime.now(timezone.utc),
        request_url="https://api.open-meteo.com/v1/forecast?synthetic=1",
    )
    monkeypatch.setattr(
        weather_provider, "fetch_live_weather", lambda location: live
    )

    body = client.post(
        "/api/forecast/estimate",
        headers=headers,
        json={
            "location": "New Delhi",
            "solar_kwp": 5,
            "wind_kwp": 0,
            "daily_consumption_kwh": 14,
            "backup_hours": 4,
        },
    ).json()

    assert body["forecast_basis"] == "LIVE_WEATHER"
    assert body["data_source"]["status"] == "LIVE"
    assert body["data_source"]["name"] == "Open-Meteo"
    assert body["forecast_type"] == "ESTIMATED"
    assert body["is_estimated"] is True
