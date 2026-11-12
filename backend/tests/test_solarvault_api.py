"""Integration tests for the SolarVault API, persistence and permissions.

The tests create a real SolarTwin run with a deterministic solar profile, then
exercise the full battery service through the FastAPI client.  No energy value
is mocked inside SolarVault.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import func, select

from app.models.battery import (
    BatteryConfiguration,
    BatteryHourlyRecord,
    BatterySimulation,
)
from app.models.simulation_run import SimulationStatus
from app.models.user import UserRole
from app.services.battery_setup_service import seed_default_battery_configuration
from tests.allocation_helpers import create_run, setup_world
from tests.helpers import create_user, login_headers

ADMIN_EMAIL = "solarvault-admin@example.com"
RESIDENT_EMAIL = "solarvault-resident@example.com"

BATTERY_SETTINGS = {
    "capacity_kwh": 20.0,
    "max_charge_kw": 10.0,
    "max_discharge_kw": 10.0,
    "charge_efficiency_pct": 100.0,
    "discharge_efficiency_pct": 100.0,
    "initial_soc_pct": 100.0,
    "min_soc_pct": 0.0,
    "max_soc_pct": 100.0,
}


def solar_profile(hour_index: int) -> float:
    """100 kWh during 09:00-15:00 UTC, nothing at night."""

    hour = hour_index % 24
    return 100.0 if 9 <= hour <= 15 else 0.0


def build_world(
    db,
    *,
    days: int = 2,
    status: str = SimulationStatus.COMPLETED,
    seed: bool = True,
):
    apartments = setup_world(db)
    run = create_run(
        db,
        apartments,
        days=days,
        solar_per_hour=solar_profile,
        common_per_hour=4.0,
        demand=1.0,
        status=status,
    )
    if seed:
        seed_default_battery_configuration(db)
    admin = create_user(db, email=ADMIN_EMAIL, role=UserRole.ADMIN)
    resident = create_user(db, email=RESIDENT_EMAIL, role=UserRole.RESIDENT)
    return run, admin, resident


def auth(client, email: str) -> dict[str, str]:
    return login_headers(client, email, "Resident#Test2026")


def configure(client, headers, **overrides):
    payload = {**BATTERY_SETTINGS, **overrides}
    response = client.put(
        "/api/solarvault/configuration", json=payload, headers=headers
    )
    assert response.status_code == 200, response.text
    return response.json()["configuration"]


def simulate(client, headers, **payload):
    response = client.post("/api/solarvault/simulate", json=payload, headers=headers)
    return response


def count(db, model) -> int:
    return int(db.scalar(select(func.count()).select_from(model)) or 0)


def test_admin_simulates_and_resident_reads_published_results(client, db):
    run, _admin, _resident = build_world(db)
    admin_headers = auth(client, ADMIN_EMAIL)
    configure(client, admin_headers)

    response = simulate(
        client,
        admin_headers,
        simulation_run_id=run.id,
        publish=True,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["saved"] is True
    assert body["published"] is True
    assert body["duplicate"] is False
    assert body["limitations"]

    simulation = body["simulation"]
    comparison = body["comparison"]
    assert simulation["status"] == "PUBLISHED"
    assert simulation["hour_count"] == 48
    assert simulation["capacity_kwh"] == 20.0
    assert simulation["initial_soc_actual_pct"] == 100.0
    assert simulation["final_soc_pct"] == pytest.approx(0.0)
    assert simulation["total_charged_kwh"] == pytest.approx(40.0)
    assert simulation["total_discharged_kwh"] == pytest.approx(60.0)
    assert simulation["total_stored_used_kwh"] == pytest.approx(60.0)
    assert simulation["baseline_grid_import_kwh"] == pytest.approx(2176.0)
    assert simulation["grid_import_kwh"] == pytest.approx(2116.0)
    assert simulation["grid_reduction_kwh"] == pytest.approx(60.0)
    assert simulation["baseline_surplus_kwh"] == pytest.approx(504.0)
    assert simulation["remaining_surplus_kwh"] == pytest.approx(464.0)
    assert simulation["baseline_solar_utilization_pct"] == pytest.approx(64.0)
    assert simulation["solar_utilization_pct"] == pytest.approx(
        936.0 / 1400.0 * 100.0, abs=1e-3
    )
    assert simulation["estimated_savings"] == pytest.approx(450.0)
    assert simulation["conservation_ok"] is True
    assert simulation["max_conservation_error_kwh"] <= 1e-6
    assert simulation["assumptions"]["parameters"]["capacity_kwh"] == 20.0

    assert comparison["baseline"]["grid_import_kwh"] == pytest.approx(2176.0)
    assert comparison["with_battery"]["grid_import_kwh"] == pytest.approx(2116.0)
    assert comparison["savings"]["estimated_savings"] == pytest.approx(450.0)
    assert comparison["savings"]["grid_reduction_pct"] == pytest.approx(
        60.0 / 2176.0 * 100.0, abs=1e-3
    )

    assert count(db, BatterySimulation) == 1
    assert count(db, BatteryHourlyRecord) == 48

    hourly = client.get(
        "/api/solarvault/hourly", headers=admin_headers
    )
    assert hourly.status_code == 200, hourly.text
    hourly_body = hourly.json()
    assert hourly_body["total"] == 48
    assert len(hourly_body["items"]) == 48
    for row in hourly_body["items"]:
        assert not (
            row["charge_energy_kwh"] > 0 and row["discharge_energy_kwh"] > 0
        )
        assert 0 <= row["soc_percentage"] <= 100
        assert row["solar_generation_kwh"] == pytest.approx(
            row["direct_solar_kwh"]
            + row["charge_energy_kwh"]
            + row["surplus_kwh"],
            abs=1e-6,
        )
        assert row["total_demand_kwh"] == pytest.approx(
            row["direct_solar_kwh"]
            + row["discharge_energy_kwh"]
            + row["grid_import_kwh"],
            abs=1e-6,
        )

    first = hourly_body["items"][0]
    assert first["discharge_energy_kwh"] == pytest.approx(10.0)
    assert first["soc_percentage"] == pytest.approx(50.0)
    second = hourly_body["items"][1]
    assert second["discharge_energy_kwh"] == pytest.approx(10.0)
    assert second["soc_percentage"] == pytest.approx(0.0)

    resident_headers = auth(client, RESIDENT_EMAIL)
    summary = client.get("/api/solarvault/summary", headers=resident_headers)
    assert summary.status_code == 200, summary.text
    summary_body = summary.json()
    assert summary_body["simulation"]["id"] == simulation["id"]
    assert summary_body["overview"]["current_soc_pct"] == pytest.approx(0.0)
    assert summary_body["configuration"]["id"] == simulation[
        "battery_configuration_id"
    ]

    compare = client.get("/api/solarvault/compare", headers=resident_headers)
    assert compare.status_code == 200, compare.text
    assert compare.json()["comparison"]["savings"][
        "grid_reduction_kwh"
    ] == pytest.approx(60.0)

    history = client.get("/api/solarvault/history", headers=resident_headers)
    assert history.status_code == 200, history.text
    assert history.json()["total"] == 1

    detail = client.get(
        f"/api/solarvault/simulations/{simulation['id']}",
        headers=resident_headers,
    )
    assert detail.status_code == 200, detail.text
    assert len(detail.json()["hourly"]) == 48


def test_charging_energy_is_not_allocated_to_apartments_in_the_same_hour(
    client, db
):
    run, _admin, _resident = build_world(db)
    admin_headers = auth(client, ADMIN_EMAIL)
    configure(client, admin_headers)
    simulate(client, admin_headers, simulation_run_id=run.id)

    records = list(
        db.scalars(
            select(BatteryHourlyRecord).order_by(BatteryHourlyRecord.timestamp)
        ).all()
    )
    for record in records:
        assert float(record.solar_generation_kwh) == pytest.approx(
            float(record.direct_solar_kwh)
            + float(record.charge_energy_kwh)
            + float(record.surplus_kwh),
            abs=1e-6,
        )


def test_draft_simulations_are_hidden_from_residents(client, db):
    run, _admin, _resident = build_world(db)
    admin_headers = auth(client, ADMIN_EMAIL)
    resident_headers = auth(client, RESIDENT_EMAIL)
    configure(client, admin_headers)

    draft = simulate(
        client,
        admin_headers,
        simulation_run_id=run.id,
        publish=False,
    )
    assert draft.status_code == 200, draft.text
    assert draft.json()["simulation"]["status"] == "DRAFT"

    assert client.get(
        "/api/solarvault/summary", headers=resident_headers
    ).status_code == 404
    assert client.get(
        "/api/solarvault/history", headers=resident_headers
    ).json()["total"] == 0
    assert client.get(
        "/api/solarvault/summary", headers=admin_headers
    ).status_code == 200

    published = simulate(
        client,
        admin_headers,
        simulation_run_id=run.id,
        publish=True,
    )
    assert published.status_code == 200, published.text
    assert published.json()["duplicate"] is True
    assert published.json()["simulation"]["status"] == "PUBLISHED"
    assert count(db, BatterySimulation) == 1
    assert client.get(
        "/api/solarvault/summary", headers=resident_headers
    ).status_code == 200


def test_identical_simulation_is_not_persisted_twice(client, db):
    run, _admin, _resident = build_world(db)
    admin_headers = auth(client, ADMIN_EMAIL)
    configure(client, admin_headers)

    first = simulate(client, admin_headers, simulation_run_id=run.id)
    second = simulate(client, admin_headers, simulation_run_id=run.id)
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert second.json()["duplicate"] is True
    assert second.json()["simulation"]["id"] == first.json()["simulation"]["id"]
    assert count(db, BatterySimulation) == 1
    assert count(db, BatteryHourlyRecord) == 48


def test_only_administrators_can_configure_and_simulate(client, db):
    run, _admin, _resident = build_world(db)
    resident_headers = auth(client, RESIDENT_EMAIL)

    update = client.put(
        "/api/solarvault/configuration",
        json={"capacity_kwh": 30.0},
        headers=resident_headers,
    )
    assert update.status_code == 403, update.text

    run_response = client.post(
        "/api/solarvault/simulate",
        json={"simulation_run_id": run.id},
        headers=resident_headers,
    )
    assert run_response.status_code == 403, run_response.text

    assert client.get(
        "/api/solarvault/configuration", headers=resident_headers
    ).status_code == 200


def test_configuration_updates_append_a_version(client, db):
    _run, _admin, _resident = build_world(db)
    admin_headers = auth(client, ADMIN_EMAIL)

    current = client.get(
        "/api/solarvault/configuration", headers=admin_headers
    ).json()["configuration"]
    updated = client.put(
        "/api/solarvault/configuration",
        json={"capacity_kwh": 15.0, "notes": "Pilot battery"},
        headers=admin_headers,
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["previous_configuration_id"] == current["id"]
    assert body["configuration"]["id"] != current["id"]
    assert body["configuration"]["capacity_kwh"] == 15.0
    assert body["configuration"]["notes"] == "Pilot battery"

    configurations = list(
        db.scalars(
            select(BatteryConfiguration).order_by(BatteryConfiguration.id)
        ).all()
    )
    assert len(configurations) == 2
    assert configurations[0].is_active is False
    assert configurations[1].is_active is True


@pytest.mark.parametrize(
    "payload",
    [
        {"charge_efficiency_pct": 0},
        {"discharge_efficiency_pct": 101},
        {"min_soc_pct": 90, "max_soc_pct": 20},
        {"min_soc_pct": 10, "max_soc_pct": 50, "initial_soc_pct": 100},
        {"capacity_kwh": -1},
        {"unknown_field": 1},
        {},
    ],
)
def test_invalid_configuration_is_rejected(client, db, payload):
    _run, _admin, _resident = build_world(db)
    headers = auth(client, ADMIN_EMAIL)
    response = client.put(
        "/api/solarvault/configuration", json=payload, headers=headers
    )
    assert response.status_code == 422, response.text


def test_hypothetical_overrides_cannot_be_saved(client, db):
    run, _admin, _resident = build_world(db)
    headers = auth(client, ADMIN_EMAIL)
    response = simulate(
        client,
        headers,
        simulation_run_id=run.id,
        save=True,
        overrides={"capacity_kwh": 12.0},
    )
    assert response.status_code == 422, response.text


def test_simulation_requires_a_completed_run(client, db):
    run, _admin, _resident = build_world(db, status=SimulationStatus.PENDING)
    headers = auth(client, ADMIN_EMAIL)
    response = simulate(client, headers, simulation_run_id=run.id)
    assert response.status_code == 400, response.text
    assert response.json()["error"]["details"]["status"] == "PENDING"

    missing = simulate(client, headers, simulation_run_id=99999)
    assert missing.status_code == 404, missing.text


def test_scenario_simulator_does_not_persist_records(client, db):
    run, _admin, _resident = build_world(db)
    headers = auth(client, ADMIN_EMAIL)
    configure(client, headers)

    preview = simulate(
        client,
        headers,
        simulation_run_id=run.id,
        save=False,
        overrides={"capacity_kwh": 5.0},
    )
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["saved"] is False
    assert body["published"] is False
    assert body["simulation"]["id"] == 0
    assert body["simulation"]["capacity_kwh"] == 5.0
    assert body["simulation"]["total_charged_kwh"] > 0
    assert body["simulation"]["total_charged_kwh"] < 40.0
    assert count(db, BatterySimulation) == 0
    assert count(db, BatteryHourlyRecord) == 0

    larger = simulate(
        client,
        headers,
        simulation_run_id=run.id,
        save=False,
        overrides={"capacity_kwh": 40.0},
    )
    assert larger.status_code == 200, larger.text
    assert larger.json()["simulation"]["total_charged_kwh"] > body["simulation"][
        "total_charged_kwh"
    ]


def test_zero_capacity_matches_the_no_battery_baseline(client, db):
    run, _admin, _resident = build_world(db)
    headers = auth(client, ADMIN_EMAIL)
    configure(
        client,
        headers,
        capacity_kwh=0.0,
        initial_soc_pct=0.0,
        min_soc_pct=0.0,
        max_soc_pct=100.0,
    )
    response = simulate(client, headers, simulation_run_id=run.id)
    assert response.status_code == 200, response.text
    simulation = response.json()["simulation"]
    assert simulation["total_charged_kwh"] == pytest.approx(0.0)
    assert simulation["total_discharged_kwh"] == pytest.approx(0.0)
    assert simulation["grid_import_kwh"] == pytest.approx(
        simulation["baseline_grid_import_kwh"]
    )
    assert simulation["final_soc_pct"] == pytest.approx(0.0)
    assert simulation["warnings"]
    assert simulation["conservation_ok"] is True

    summary = client.get("/api/solarvault/summary", headers=headers)
    assert summary.status_code == 200, summary.text
    assert summary.json()["overview"]["battery_status"] == "DISABLED"


def test_efficiency_losses_are_reported_and_conserved(client, db):
    run, _admin, _resident = build_world(db)
    headers = auth(client, ADMIN_EMAIL)
    configure(
        client,
        headers,
        charge_efficiency_pct=80.0,
        discharge_efficiency_pct=80.0,
    )
    response = simulate(client, headers, simulation_run_id=run.id)
    assert response.status_code == 200, response.text
    simulation = response.json()["simulation"]

    assert simulation["total_charged_kwh"] > 0
    assert simulation["total_stored_gain_kwh"] == pytest.approx(
        simulation["total_charged_kwh"] * 0.8, abs=1e-3
    )
    assert simulation["total_charge_loss_kwh"] == pytest.approx(
        simulation["total_charged_kwh"] * 0.2, abs=1e-3
    )
    assert simulation["total_discharged_kwh"] == pytest.approx(
        simulation["total_stored_used_kwh"] * 0.8, abs=1e-3
    )
    assert simulation["total_discharge_loss_kwh"] == pytest.approx(
        simulation["total_stored_used_kwh"] * 0.2, abs=1e-3
    )
    assert simulation["total_losses_kwh"] == pytest.approx(
        simulation["total_charge_loss_kwh"]
        + simulation["total_discharge_loss_kwh"],
        abs=1e-3,
    )
    assert simulation["conservation_ok"] is True


def test_history_supports_pagination_and_run_filter(client, db):
    run, _admin, _resident = build_world(db)
    headers = auth(client, ADMIN_EMAIL)

    configure(client, headers)
    simulate(client, headers, simulation_run_id=run.id)
    configure(client, headers, capacity_kwh=12.0)
    simulate(client, headers, simulation_run_id=run.id)

    history = client.get(
        f"/api/solarvault/history?simulation_run_id={run.id}&limit=1&offset=0",
        headers=headers,
    )
    assert history.status_code == 200, history.text
    body = history.json()
    assert body["total"] == 2
    assert body["limit"] == 1
    assert len(body["items"]) == 1

    other_run = client.get(
        "/api/solarvault/history?simulation_run_id=99999", headers=headers
    )
    assert other_run.json()["total"] == 0


def test_hourly_endpoint_filters_by_date(client, db):
    run, _admin, _resident = build_world(db)
    headers = auth(client, ADMIN_EMAIL)
    configure(client, headers)
    simulation = simulate(
        client, headers, simulation_run_id=run.id
    ).json()["simulation"]

    day_one = client.get(
        f"/api/solarvault/hourly?simulation_id={simulation['id']}"
        f"&date_from={date(2026, 3, 1)}&date_to={date(2026, 3, 1)}",
        headers=headers,
    )
    assert day_one.status_code == 200, day_one.text
    assert day_one.json()["total"] == 24
