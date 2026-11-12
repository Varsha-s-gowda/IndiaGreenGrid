"""End-to-end API tests for apartments and SolarTwin simulation endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient
import pytest

from app.models.user import UserRole
from tests.helpers import DEFAULT_PASSWORD, create_user, login_headers

GENERATION_PAYLOAD = {
    "capacity_kwp": 15.0,
    "start_date": "2026-03-01",
    "days": 1,
    "seed": 42,
}


def _admin_headers(client: TestClient, db) -> dict[str, str]:
    create_user(db, email="sim.admin@example.com", role=UserRole.ADMIN)
    return login_headers(client, "sim.admin@example.com", DEFAULT_PASSWORD)


def _resident_headers(client: TestClient, db) -> dict[str, str]:
    create_user(db, email="sim.resident@example.com", role=UserRole.RESIDENT)
    return login_headers(client, "sim.resident@example.com", DEFAULT_PASSWORD)


def test_simulation_generation_requires_admin(client, db):
    resident_headers = _resident_headers(client, db)
    assert client.post(
        "/api/simulation/generate", json=GENERATION_PAYLOAD, headers=resident_headers
    ).status_code == 403
    assert client.post("/api/simulation/generate", json=GENERATION_PAYLOAD).status_code == 401

    admin_headers = _admin_headers(client, db)
    response = client.post(
        "/api/simulation/generate", json=GENERATION_PAYLOAD, headers=admin_headers
    )
    assert response.status_code == 200, response.text


def test_generation_and_all_read_endpoints(client, db):
    headers = _admin_headers(client, db)
    generated = client.post(
        "/api/simulation/generate", json=GENERATION_PAYLOAD, headers=headers
    )
    assert generated.status_code == 200, generated.text
    body = generated.json()
    assert body["reused"] is False
    assert body["solar_created"] == 24
    assert body["meter_created"] == 60 * 24
    assert body["common_created"] == 4 * 24
    assert body["run"]["status"] == "COMPLETED"
    assert body["run"]["progress_percentage"] == 100.0
    run_id = body["run"]["id"]

    apartments = client.get("/api/apartments", headers=headers)
    assert apartments.status_code == 200
    assert apartments.json()["total"] == 60
    assert apartments.json()["items"][0]["flat_number"] == "A-101"

    filtered_apartments = client.get(
        "/api/apartments?floor_number=1&limit=5", headers=headers
    )
    assert filtered_apartments.status_code == 200
    assert filtered_apartments.json()["total"] == 10
    assert len(filtered_apartments.json()["items"]) == 5

    summary = client.get("/api/apartments/summary", headers=headers)
    assert summary.status_code == 200
    assert summary.json()["total_apartments"] == 60
    assert summary.json()["total_residents"] > 60
    assert summary.json()["apartments_by_profile"]["LOW"] > 0

    solar = client.get(
        f"/api/simulation/solar-generation?run_id={run_id}&limit=100", headers=headers
    )
    assert solar.status_code == 200, solar.text
    assert solar.json()["total"] == 24
    assert all(item["generation_kwh"] >= 0 for item in solar.json()["items"])
    assert all(
        item["generation_kwh"] == 0
        for item in solar.json()["items"]
        if int(item["reading_time"][11:13]) in (0, 1, 2, 3, 4, 5, 19, 20, 21, 22, 23)
    )

    consumption = client.get(
        f"/api/simulation/consumption?run_id={run_id}&flat_number=A-101&limit=100",
        headers=headers,
    )
    assert consumption.status_code == 200, consumption.text
    assert consumption.json()["total"] == 24
    assert consumption.json()["items"][0]["flat_number"] == "A-101"

    common = client.get(
        f"/api/simulation/common-consumption?run_id={run_id}&category=lifts&limit=100",
        headers=headers,
    )
    assert common.status_code == 200, common.text
    assert common.json()["total"] == 24
    assert all(item["category"] == "lifts" for item in common.json()["items"])

    simulation_summary = client.get(
        f"/api/simulation/summary?run_id={run_id}", headers=headers
    )
    assert simulation_summary.status_code == 200, simulation_summary.text
    balance = simulation_summary.json()["energy_balance"]
    assert balance["conservation_ok"] is True
    assert balance["total_solar_generation_kwh"] > 0
    assert balance["total_building_demand_kwh"] > 0
    assert balance["grid_import_kwh"] >= 0
    assert balance["surplus_solar_kwh"] >= 0
    assert 0 <= balance["solar_utilization_percentage"] <= 100
    assert simulation_summary.json()["record_counts"] == {
        "solar_records": 24,
        "meter_records": 1440,
        "common_records": 96,
    }

    hourly = client.get(f"/api/simulation/hourly?run_id={run_id}", headers=headers)
    assert hourly.status_code == 200, hourly.text
    assert hourly.json()["count"] == 24
    assert hourly.json()["granularity"] == "hourly"

    daily = client.get(f"/api/simulation/daily?run_id={run_id}", headers=headers)
    assert daily.status_code == 200, daily.text
    assert daily.json()["count"] == 1
    assert daily.json()["items"][0]["period"] == "2026-03-01"
    assert daily.json()["items"][0]["total_building_demand_kwh"] == pytest.approx(
        balance["total_building_demand_kwh"]
    )

    monthly = client.get(f"/api/simulation/monthly?run_id={run_id}", headers=headers)
    assert monthly.status_code == 200, monthly.text
    assert monthly.json()["count"] == 1
    assert monthly.json()["items"][0]["period"] == "2026-03"

    runs = client.get("/api/simulation/runs", headers=headers)
    assert runs.status_code == 200
    assert runs.json()["total"] == 1
    assert runs.json()["items"][0]["id"] == run_id

    run_status = client.get(f"/api/simulation/runs/{run_id}", headers=headers)
    assert run_status.status_code == 200
    assert run_status.json()["solar_records"] == 24

    rerun = client.post(
        "/api/simulation/generate", json=GENERATION_PAYLOAD, headers=headers
    )
    assert rerun.status_code == 200
    assert rerun.json()["reused"] is True
    assert rerun.json()["run"]["id"] == run_id
    assert client.get("/api/simulation/runs", headers=headers).json()["total"] == 1


def test_date_filters_and_partial_generation_endpoints(client, db):
    headers = _admin_headers(client, db)

    solar_only = client.post(
        "/api/simulation/generate-solar",
        json={**GENERATION_PAYLOAD, "capacity_kwp": 30.0},
        headers=headers,
    )
    assert solar_only.status_code == 200, solar_only.text
    assert solar_only.json()["solar_created"] == 24
    assert solar_only.json()["run"]["status"] == "PARTIAL"
    run_id = solar_only.json()["run"]["id"]

    no_data = client.get(
        f"/api/simulation/solar-generation?run_id={run_id}&date_from=2026-03-02",
        headers=headers,
    )
    assert no_data.status_code == 200
    assert no_data.json()["total"] == 0

    consumption = client.post(
        "/api/simulation/generate-consumption",
        json={**GENERATION_PAYLOAD, "run_id": run_id},
        headers=headers,
    )
    assert consumption.status_code == 200, consumption.text
    assert consumption.json()["meter_created"] == 1440
    assert consumption.json()["common_created"] == 96
    assert consumption.json()["run"]["status"] == "COMPLETED"

    reuse = client.post(
        "/api/simulation/generate-consumption",
        json={**GENERATION_PAYLOAD, "run_id": run_id},
        headers=headers,
    )
    assert reuse.status_code == 200
    assert reuse.json()["reused"] is True

    regenerated = client.post(
        "/api/simulation/generate-solar",
        json={
            **GENERATION_PAYLOAD,
            "run_id": run_id,
            "regenerate": True,
            "capacity_kwp": 30.0,
        },
        headers=headers,
    )
    assert regenerated.status_code == 200, regenerated.text
    assert regenerated.json()["solar_created"] == 24
    assert regenerated.json()["run"]["status"] == "COMPLETED"

    invalid_category = client.get(
        f"/api/simulation/common-consumption?run_id={run_id}&category=reactor",
        headers=headers,
    )
    assert invalid_category.status_code == 400
    assert invalid_category.json()["error"]["code"] == "bad_request"

    invalid_dates = client.get(
        f"/api/simulation/summary?run_id={run_id}&date_from=2026-03-05&date_to=2026-03-01",
        headers=headers,
    )
    assert invalid_dates.status_code == 400
