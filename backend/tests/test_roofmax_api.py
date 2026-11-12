"""Integration tests for the RoofMax API, permissions and persistence.

The tests use the same real SolarTwin reading tables and stored tariff as the
production service; no demand or financial value is mocked inside RoofMax.
"""

from __future__ import annotations

from datetime import date

from app.models.simulation_run import SimulationStatus
from app.models.user import UserRole
from app.services.roofmax_setup_service import seed_default_roof_configuration
from tests.allocation_helpers import create_run, setup_world
from tests.helpers import create_user, login_headers

ADMIN_EMAIL = "roofmax-admin@example.com"
RESIDENT_EMAIL = "roofmax-resident@example.com"


def build_world(db, *, days: int = 2, status: str = SimulationStatus.COMPLETED):
    apartments = setup_world(db)
    run = create_run(
        db,
        apartments,
        days=days,
        solar_per_hour=40.0,
        common_per_hour=4.0,
        demand=1.0,
        status=status,
    )
    configuration_seed = seed_default_roof_configuration(db)
    admin = create_user(db, email=ADMIN_EMAIL, role=UserRole.ADMIN)
    resident = create_user(db, email=RESIDENT_EMAIL, role=UserRole.RESIDENT)
    return run, configuration_seed, admin, resident


def auth(client, email: str) -> dict[str, str]:
    return login_headers(client, email, "Resident#Test2026")


def test_admin_generates_published_analysis_and_resident_reads_it(client, db):
    run, _seed, _admin, _resident = build_world(db)
    admin_headers = auth(client, ADMIN_EMAIL)

    response = client.post(
        "/api/roofmax/analyze",
        json={"simulation_run_id": run.id},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["saved"] is True
    assert body["published"] is True
    assert body["duplicate"] is False

    analysis = body["analysis"]
    assert analysis["status"] == "PUBLISHED"
    assert analysis["simulation_run_id"] == run.id
    assert analysis["demand_hour_count"] == 48
    assert analysis["demand_days"] == 2
    assert analysis["total_building_demand_kwh"] > 0
    assert analysis["recommended_capacity_kwp"] > 0
    assert (
        analysis["recommended_capacity_kwp"]
        <= analysis["max_installable_capacity_kwp"] + 0.01
    )
    assert analysis["recommended_demand_coverage_percentage"] > 0
    assert analysis["recommendation_reason"]
    assert analysis["limitations"]
    assert analysis["assumptions"]["tariff_source"] == "STORED_TARIFF"
    assert analysis["assumptions"]["tariff_price_per_kwh"] == 7.5
    assert analysis["demand_profile"]["monthly"]
    assert analysis["demand_profile"]["daily"]
    assert len(analysis["demand_profile"]["hour_of_day"]) == 24
    assert len(analysis["scenarios"]) == 18  # 3 scenarios x 6 options

    standard = [
        row for row in analysis["scenarios"] if row["scenario_type"] == "STANDARD"
    ]
    recommended = [row for row in standard if row["is_recommended"]]
    assert len(recommended) == 1
    recommended = recommended[0]
    assert recommended["capacity_kwp"] == analysis["recommended_capacity_kwp"]
    assert recommended["annual_savings"] >= 0
    assert recommended["installation_cost"] > 0
    assert recommended["payback_period_years"] is not None

    resident_headers = auth(client, RESIDENT_EMAIL)
    recommendation = client.get(
        "/api/roofmax/recommendation", headers=resident_headers
    )
    assert recommendation.status_code == 200, recommendation.text
    assert recommendation.json()["analysis"]["id"] == analysis["id"]

    scenarios = client.get("/api/roofmax/scenarios", headers=resident_headers)
    assert scenarios.status_code == 200, scenarios.text
    scenario_body = scenarios.json()
    assert scenario_body["analysis_id"] == analysis["id"]
    assert len(scenario_body["standard_scenario"]) == 6
    assert len(scenario_body["conservative_scenario"]) == 6
    assert len(scenario_body["optimistic_scenario"]) == 6
    assert scenario_body["scenario_factors"]["CONSERVATIVE"]["yield_factor"] < 1

    history = client.get("/api/roofmax/history", headers=resident_headers)
    assert history.status_code == 200, history.text
    assert history.json()["total"] == 1
    assert history.json()["items"][0]["id"] == analysis["id"]

    detail = client.get(
        f"/api/roofmax/analysis/{analysis['id']}", headers=resident_headers
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["analysis"]["id"] == analysis["id"]
    assert detail.json()["configuration"]["id"] == analysis["roof_configuration_id"]


def test_duplicate_analysis_is_idempotent(client, db):
    run, _seed, _admin, _resident = build_world(db)
    headers = auth(client, ADMIN_EMAIL)

    first = client.post(
        "/api/roofmax/analyze",
        json={"simulation_run_id": run.id},
        headers=headers,
    )
    second = client.post(
        "/api/roofmax/analyze",
        json={"simulation_run_id": run.id},
        headers=headers,
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["duplicate"] is True
    assert second.json()["analysis"]["id"] == first.json()["analysis"]["id"]

    history = client.get("/api/roofmax/history", headers=headers)
    assert history.json()["total"] == 1


def test_resident_cannot_generate_analysis_or_update_configuration(client, db):
    run, _seed, _admin, _resident = build_world(db)
    headers = auth(client, RESIDENT_EMAIL)

    analyze = client.post(
        "/api/roofmax/analyze",
        json={"simulation_run_id": run.id},
        headers=headers,
    )
    assert analyze.status_code == 403, analyze.text

    update = client.put(
        "/api/roofmax/configuration",
        json={"usable_roof_area_m2": 500},
        headers=headers,
    )
    assert update.status_code == 403, update.text


def test_configuration_update_creates_a_new_version(client, db):
    _run, seed, _admin, _resident = build_world(db)
    headers = auth(client, ADMIN_EMAIL)

    update = client.put(
        "/api/roofmax/configuration",
        json={
            "usable_roof_area_m2": 50,
            "installation_cost_per_kwp": 60000,
            "notes": "Smaller verified roof section",
        },
        headers=headers,
    )
    assert update.status_code == 200, update.text
    body = update.json()
    assert body["created"] is True
    assert body["previous_configuration_id"] == seed.configuration_id
    new_configuration = body["configuration"]
    assert new_configuration["id"] != seed.configuration_id
    assert new_configuration["usable_roof_area_m2"] == 50
    assert new_configuration["installation_cost_per_kwp"] == 60000
    assert new_configuration["is_active"] is True
    assert new_configuration["panel_area_m2"] > 0

    current = client.get("/api/roofmax/configuration", headers=headers)
    assert current.status_code == 200
    assert current.json()["configuration"]["id"] == new_configuration["id"]

    from app.models.roofmax import RoofConfiguration

    old = db.get(RoofConfiguration, seed.configuration_id)
    db.refresh(old)
    assert old.is_active is False


def test_invalid_configuration_is_rejected(client, db):
    _run, _seed, _admin, _resident = build_world(db)
    headers = auth(client, ADMIN_EMAIL)

    too_small = client.put(
        "/api/roofmax/configuration",
        json={"usable_roof_area_m2": 1.0},
        headers=headers,
    )
    assert too_small.status_code == 400, too_small.text
    assert "larger than one panel" in too_small.json()["error"]["message"]

    negative = client.put(
        "/api/roofmax/configuration",
        json={"usable_roof_area_m2": -5},
        headers=headers,
    )
    assert negative.status_code == 422

    empty = client.put("/api/roofmax/configuration", json={}, headers=headers)
    assert empty.status_code == 422

    invalid_effort = client.put(
        "/api/roofmax/configuration",
        json={"performance_ratio_pct": 120},
        headers=headers,
    )
    assert invalid_effort.status_code == 422

    invalid_horizon = client.put(
        "/api/roofmax/configuration",
        json={"short_horizon_years": 20, "long_horizon_years": 10},
        headers=headers,
    )
    assert invalid_horizon.status_code == 422


def test_analysis_requires_configuration_and_completed_run(client, db):
    apartments = setup_world(db)
    run = create_run(
        db, apartments, days=1, demand=1.0, common_per_hour=4.0, solar_per_hour=40.0
    )
    admin = create_user(db, email=ADMIN_EMAIL, role=UserRole.ADMIN)
    headers = login_headers(client, admin.email, "Resident#Test2026")

    missing_config = client.post(
        "/api/roofmax/analyze",
        json={"simulation_run_id": run.id},
        headers=headers,
    )
    assert missing_config.status_code == 400, missing_config.text
    assert "No RoofMax configuration" in missing_config.json()["error"]["message"]

    seed_default_roof_configuration(db)
    partial_run = create_run(
        db,
        apartments,
        days=1,
        demand=1.0,
        common_per_hour=4.0,
        solar_per_hour=40.0,
        status=SimulationStatus.PARTIAL,
    )
    incomplete = client.post(
        "/api/roofmax/analyze",
        json={"simulation_run_id": partial_run.id},
        headers=headers,
    )
    assert incomplete.status_code == 400, incomplete.text
    assert "completed SolarTwin run" in incomplete.json()["error"]["message"]


def test_missing_tariff_is_reported_clearly(client, db):
    apartments = setup_world(db, with_tariff=False)
    run = create_run(
        db, apartments, days=1, demand=1.0, common_per_hour=4.0, solar_per_hour=40.0
    )
    seed_default_roof_configuration(db)
    admin = create_user(db, email=ADMIN_EMAIL, role=UserRole.ADMIN)
    headers = login_headers(client, admin.email, "Resident#Test2026")

    response = client.post(
        "/api/roofmax/analyze",
        json={"simulation_run_id": run.id},
        headers=headers,
    )
    assert response.status_code == 400, response.text
    assert "tariff" in response.json()["error"]["message"].lower()


def test_draft_analysis_is_hidden_until_published(client, db):
    run, _seed, _admin, _resident = build_world(db)
    admin_headers = auth(client, ADMIN_EMAIL)
    resident_headers = auth(client, RESIDENT_EMAIL)

    draft = client.post(
        "/api/roofmax/analyze",
        json={"simulation_run_id": run.id, "publish": False},
        headers=admin_headers,
    )
    assert draft.status_code == 200, draft.text
    assert draft.json()["published"] is False
    assert draft.json()["analysis"]["status"] == "DRAFT"
    analysis_id = draft.json()["analysis"]["id"]

    hidden = client.get("/api/roofmax/recommendation", headers=resident_headers)
    assert hidden.status_code == 404

    visible_to_admin = client.get(
        "/api/roofmax/recommendation", headers=admin_headers
    )
    assert visible_to_admin.status_code == 200
    assert visible_to_admin.json()["analysis"]["id"] == analysis_id

    published = client.post(
        "/api/roofmax/analyze",
        json={"simulation_run_id": run.id, "publish": True},
        headers=admin_headers,
    )
    assert published.status_code == 200, published.text
    assert published.json()["duplicate"] is True
    assert published.json()["analysis"]["id"] == analysis_id
    assert published.json()["analysis"]["status"] == "PUBLISHED"

    visible = client.get("/api/roofmax/recommendation", headers=resident_headers)
    assert visible.status_code == 200
    assert visible.json()["analysis"]["id"] == analysis_id


def test_history_pagination_and_run_filter(client, db):
    run_one, _seed, _admin, _resident = build_world(db)
    headers = auth(client, ADMIN_EMAIL)
    from sqlalchemy import select

    from app.models.apartment import Apartment

    apartments = list(db.scalars(select(Apartment).order_by(Apartment.id)).all())
    run_two = create_run(
        db,
        apartments,
        start=date(2026, 4, 1),
        days=1,
        demand=1.0,
        common_per_hour=4.0,
        solar_per_hour=40.0,
    )

    for run in (run_one, run_two):
        response = client.post(
            "/api/roofmax/analyze",
            json={"simulation_run_id": run.id},
            headers=headers,
        )
        assert response.status_code == 200, response.text

    history = client.get(
        "/api/roofmax/history", headers=headers, params={"limit": 1}
    )
    assert history.status_code == 200
    body = history.json()
    assert body["total"] == 2
    assert body["limit"] == 1
    assert len(body["items"]) == 1

    filtered = client.get(
        "/api/roofmax/history",
        headers=headers,
        params={"simulation_run_id": run_two.id},
    )
    assert filtered.json()["total"] == 1
    assert filtered.json()["items"][0]["simulation_run_id"] == run_two.id


def test_constraint_marks_unfeasible_standard_options(client, db):
    run, _seed, _admin, _resident = build_world(db)
    headers = auth(client, ADMIN_EMAIL)

    update = client.put(
        "/api/roofmax/configuration",
        json={"usable_roof_area_m2": 30},
        headers=headers,
    )
    assert update.status_code == 200, update.text
    maximum = update.json()["configuration"]
    assert maximum["usable_roof_area_m2"] == 30

    analyzed = client.post(
        "/api/roofmax/analyze",
        json={"simulation_run_id": run.id},
        headers=headers,
    )
    assert analyzed.status_code == 200, analyzed.text
    analysis = analyzed.json()["analysis"]

    standard = [
        row for row in analysis["scenarios"] if row["scenario_type"] == "STANDARD"
    ]
    infeasible = [row for row in standard if not row["is_feasible"]]
    assert infeasible, "Expected some standard options to exceed a 30 m2 roof"
    assert all("roof limit" in (row["constraint_note"] or "") for row in infeasible)
    assert analysis["recommended_capacity_kwp"] <= analysis["max_installable_capacity_kwp"] + 0.01


def test_analysis_detail_rejects_unknown_id_and_resident_draft(client, db):
    run, _seed, _admin, _resident = build_world(db)
    admin_headers = auth(client, ADMIN_EMAIL)
    resident_headers = auth(client, RESIDENT_EMAIL)

    unknown = client.get("/api/roofmax/analysis/999999", headers=admin_headers)
    assert unknown.status_code == 404

    draft = client.post(
        "/api/roofmax/analyze",
        json={"simulation_run_id": run.id, "publish": False},
        headers=admin_headers,
    )
    analysis_id = draft.json()["analysis"]["id"]
    hidden = client.get(
        f"/api/roofmax/analysis/{analysis_id}", headers=resident_headers
    )
    assert hidden.status_code == 404
