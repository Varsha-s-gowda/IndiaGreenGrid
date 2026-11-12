"""End-to-end tests for the fair-allocation API and service."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import func, select

from app.models.allocation import (
    AllocationMethod,
    AllocationRecord,
    AllocationRun,
    AllocationRunStatus,
    AllocationSummary,
)
from app.models.ownership_share import OwnershipShare
from app.models.user import UserRole
from tests.allocation_helpers import (
    START_DATE,
    create_linked_resident,
    create_run,
    setup_world,
)
from tests.helpers import DEFAULT_PASSWORD, create_user, login_headers


def _admin_headers(client, db) -> dict[str, str]:
    create_user(db, email="alloc.admin@example.com", role=UserRole.ADMIN)
    return login_headers(client, "alloc.admin@example.com", DEFAULT_PASSWORD)


def _resident_headers(client, db, *, email: str, flat_number: str) -> dict[str, str]:
    create_linked_resident(db, email=email, flat_number=flat_number)
    return login_headers(client, email, DEFAULT_PASSWORD)


def _calculate(client, headers, **overrides):
    payload = {
        "simulation_run_id": overrides.pop("simulation_run_id"),
        "method": overrides.pop("method", AllocationMethod.EQUAL_SHARE),
        "save": overrides.pop("save", False),
    }
    payload.update(overrides)
    return client.post("/api/allocation/calculate", json=payload, headers=headers)


def test_equal_share_preview_and_manual_totals(client, db):
    apartments = setup_world(db)
    run = create_run(db, apartments, solar_per_hour=24.0, demand=1.0)
    headers = _admin_headers(client, db)

    response = _calculate(client, headers, simulation_run_id=run.id)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["saved"] is False
    assert body["run_id"] is None
    assert body["apartments_analyzed"] == 60
    assert body["hour_count"] == 24
    assert body["totals"]["total_solar_generation_kwh"] == pytest.approx(576.0)
    assert body["totals"]["total_allocated_kwh"] == pytest.approx(576.0)
    assert body["totals"]["total_apartment_consumption_kwh"] == pytest.approx(
        1440.0
    )
    assert body["totals"]["grid_import_kwh"] == pytest.approx(864.0)
    assert body["totals"]["surplus_kwh"] == pytest.approx(0.0)
    assert body["totals"]["average_coverage_percentage"] == pytest.approx(40.0)

    for summary in body["apartments"]:
        assert summary["total_consumption_kwh"] == pytest.approx(24.0)
        assert summary["total_solar_allocation_kwh"] == pytest.approx(9.6)
        assert summary["solar_coverage_percentage"] == pytest.approx(40.0)

    assert body["fairness"]["jain_index"] == pytest.approx(1.0)
    assert body["fairness"]["positive_demand_apartments"] == 60

    assert db.scalar(select(func.count()).select_from(AllocationRun)) == 0


def test_save_creates_records_summaries_and_prevents_duplicates(client, db):
    apartments = setup_world(db)
    run = create_run(db, apartments)
    headers = _admin_headers(client, db)

    first = _calculate(
        client, headers, simulation_run_id=run.id, save=True
    )
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["saved"] is True
    assert body["duplicate"] is False
    assert body["status"] == AllocationRunStatus.SAVED
    assert body["apartments_analyzed"] == 60

    run_id = body["run_id"]
    assert db.scalar(select(func.count()).select_from(AllocationRun)) == 1
    assert (
        db.scalar(select(func.count()).select_from(AllocationSummary))
        == 60
    )
    assert (
        db.scalar(select(func.count()).select_from(AllocationRecord))
        == 24 * 60
    )

    second = _calculate(
        client, headers, simulation_run_id=run.id, save=True
    )
    assert second.status_code == 200, second.text
    duplicate = second.json()
    assert duplicate["duplicate"] is True
    assert duplicate["run_id"] == run_id
    assert db.scalar(select(func.count()).select_from(AllocationRun)) == 1


def test_common_area_energy_is_consumed_first(client, db):
    apartments = setup_world(db)
    run = create_run(
        db,
        apartments,
        solar_per_hour=10.0,
        common_per_hour=6.0,
        demand=1.0,
    )
    headers = _admin_headers(client, db)

    body = _calculate(client, headers, simulation_run_id=run.id).json()
    assert body["totals"]["total_solar_generation_kwh"] == pytest.approx(240.0)
    assert body["totals"]["common_solar_consumption_kwh"] == pytest.approx(144.0)
    assert body["totals"]["available_for_apartments_kwh"] == pytest.approx(96.0)
    assert body["totals"]["total_allocated_kwh"] == pytest.approx(96.0)
    assert body["totals"]["surplus_kwh"] == pytest.approx(0.0)

    for summary in body["apartments"]:
        assert summary["total_solar_allocation_kwh"] == pytest.approx(1.6, abs=1e-4)
        assert summary["solar_coverage_percentage"] == pytest.approx(
            1.6 / 24.0 * 100.0, abs=1e-3
        )


def test_common_grid_import_is_balanced_at_night(client, db):
    apartments = setup_world(db)
    run = create_run(
        db,
        apartments,
        solar_per_hour=2.0,
        common_per_hour=6.0,
        demand=1.0,
    )
    headers = _admin_headers(client, db)

    body = _calculate(client, headers, simulation_run_id=run.id).json()
    totals = body["totals"]
    assert totals["conservation_ok"] is True
    assert totals["total_solar_generation_kwh"] == pytest.approx(48.0)
    assert totals["common_solar_consumption_kwh"] == pytest.approx(48.0)
    assert totals["available_for_apartments_kwh"] == pytest.approx(0.0)
    assert totals["total_allocated_kwh"] == pytest.approx(0.0)
    assert totals["surplus_kwh"] == pytest.approx(0.0)
    assert totals["grid_import_kwh"] == pytest.approx(1440.0)


def test_zero_solar_and_zero_demand_are_reported_without_division_errors(
    client, db
):
    apartments = setup_world(db)
    zero_solar = create_run(db, apartments, solar_per_hour=0.0)
    headers = _admin_headers(client, db)

    body = _calculate(client, headers, simulation_run_id=zero_solar.id).json()
    assert body["totals"]["total_solar_generation_kwh"] == 0.0
    assert body["totals"]["total_allocated_kwh"] == 0.0
    assert body["totals"]["surplus_kwh"] == 0.0
    assert body["totals"]["grid_import_kwh"] == pytest.approx(1440.0)
    assert body["fairness"]["jain_index"] is None
    assert body["fairness"]["jain_index_applicable"] is False
    assert body["fairness"]["jain_index_reason"]

    zero_demand = create_run(
        db, apartments, solar_per_hour=24.0, demand=0.0
    )
    body = _calculate(client, headers, simulation_run_id=zero_demand.id).json()
    assert body["totals"]["total_apartment_consumption_kwh"] == 0.0
    assert body["totals"]["total_allocated_kwh"] == 0.0
    assert body["totals"]["surplus_kwh"] == pytest.approx(576.0)
    assert body["fairness"]["positive_demand_apartments"] == 0
    assert body["fairness"]["jain_index"] is None


def test_excess_generation_becomes_surplus_and_caps_are_respected(client, db):
    apartments = setup_world(db)
    run = create_run(db, apartments, solar_per_hour=100.0, demand=1.0)
    headers = _admin_headers(client, db)

    body = _calculate(client, headers, simulation_run_id=run.id).json()
    assert body["totals"]["total_allocated_kwh"] == pytest.approx(1440.0)
    assert body["totals"]["surplus_kwh"] == pytest.approx(960.0)
    assert body["totals"]["grid_import_kwh"] == 0.0
    assert body["totals"]["apartment_solar_coverage_percentage"] == pytest.approx(
        100.0
    )
    for summary in body["apartments"]:
        assert summary["total_solar_allocation_kwh"] <= summary[
            "total_consumption_kwh"
        ]
        assert summary["total_grid_import_kwh"] == 0.0


def test_all_methods_conserve_energy_and_ownership_tracks_shares(client, db):
    apartments = setup_world(db)
    run = create_run(db, apartments, solar_per_hour=24.0, demand=1.0)
    headers = _admin_headers(client, db)

    results = {}
    for method in AllocationMethod.ALL:
        response = _calculate(
            client, headers, simulation_run_id=run.id, method=method
        )
        assert response.status_code == 200, response.text
        body = response.json()
        results[method] = body
        totals = body["totals"]
        assert totals["conservation_ok"] is True
        assert totals["total_allocated_kwh"] + totals["surplus_kwh"] == pytest.approx(
            totals["available_for_apartments_kwh"], abs=1e-6
        )
        assert totals["total_allocated_kwh"] + totals["grid_import_kwh"] == pytest.approx(
            totals["total_apartment_consumption_kwh"], abs=1e-4
        )
        assert totals["common_solar_consumption_kwh"] + totals[
            "total_allocated_kwh"
        ] + totals["surplus_kwh"] == pytest.approx(
            totals["total_solar_generation_kwh"], abs=1e-4
        )
        for summary in body["apartments"]:
            assert (
                summary["total_solar_allocation_kwh"]
                <= summary["total_consumption_kwh"] + 1e-6
            )

    ownership = {
        summary["flat_number"]: summary
        for summary in results[AllocationMethod.OWNERSHIP_BASED]["apartments"]
    }
    equal = {
        summary["flat_number"]: summary
        for summary in results[AllocationMethod.EQUAL_SHARE]["apartments"]
    }
    assert len({round(item["total_solar_allocation_kwh"], 6) for item in equal.values()}) == 1
    assert len({round(item["total_solar_allocation_kwh"], 6) for item in ownership.values()}) > 1
    total_ownership_allocation = sum(
        item["total_solar_allocation_kwh"] for item in ownership.values()
    )
    assert total_ownership_allocation == pytest.approx(576.0, abs=1e-4)


def test_invalid_or_missing_ownership_blocks_allocation(client, db):
    apartments = setup_world(db)
    run = create_run(db, apartments)
    headers = _admin_headers(client, db)

    missing = db.scalar(select(OwnershipShare).limit(1))
    db.delete(missing)
    db.commit()

    response = _calculate(client, headers, simulation_run_id=run.id)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "bad_request"
    assert "Ownership shares are missing" in response.json()["error"]["message"]

    db.add(
        OwnershipShare(
            apartment_id=missing.apartment_id,
            contribution_amount=missing.contribution_amount,
            ownership_percentage=missing.ownership_percentage + 1,
        )
    )
    db.commit()
    response = _calculate(client, headers, simulation_run_id=run.id)
    assert response.status_code == 400
    assert "must total 100.000%" in response.json()["error"]["message"]


def test_missing_readings_require_documented_policy_to_save(client, db):
    apartments = setup_world(db)
    run = create_run(
        db,
        apartments,
        omit_meter=lambda hour, apartment: hour == 5
        and apartment.flat_number == "A-101",
    )
    headers = _admin_headers(client, db)

    blocked_preview = _calculate(client, headers, simulation_run_id=run.id)
    assert blocked_preview.status_code == 400
    assert "incomplete SolarTwin readings" in blocked_preview.json()["error"]["message"]
    assert blocked_preview.json()["error"]["details"]["incomplete_hours"] == 1

    blocked_save = _calculate(
        client, headers, simulation_run_id=run.id, save=True
    )
    assert blocked_save.status_code == 400
    assert "requires allow_incomplete=true" in blocked_save.json()["error"]["message"]

    preview = _calculate(
        client,
        headers,
        simulation_run_id=run.id,
        allow_incomplete=True,
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["hour_count"] == 23
    assert preview.json()["incomplete_data"] is True
    assert preview.json()["missing_report"]["incomplete_hours"] == 1

    no_policy = _calculate(
        client,
        headers,
        simulation_run_id=run.id,
        save=True,
        allow_incomplete=True,
    )
    assert no_policy.status_code == 400
    assert "documented administrator policy" in no_policy.json()["error"]["message"]

    saved = _calculate(
        client,
        headers,
        simulation_run_id=run.id,
        save=True,
        allow_incomplete=True,
        incomplete_policy=(
            "Administrator approved excluding the one hour with a missing "
            "meter reading; no readings were interpolated."
        ),
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["status"] == AllocationRunStatus.SAVED_WITH_GAPS
    assert body["incomplete_data"] is True
    assert body["hour_count"] == 23


def test_only_admins_can_calculate_and_list_runs(client, db):
    apartments = setup_world(db)
    run = create_run(db, apartments)
    resident = _resident_headers(
        client, db, email="alloc.resident@example.com", flat_number="A-101"
    )
    admin = _admin_headers(client, db)

    assert client.post(
        "/api/allocation/calculate",
        json={"simulation_run_id": run.id, "method": "EQUAL_SHARE", "save": False},
    ).status_code == 401
    assert _calculate(client, resident, simulation_run_id=run.id).status_code == 403
    assert client.get("/api/allocation/runs", headers=resident).status_code == 403
    assert client.get("/api/allocation/runs", headers=admin).status_code == 200
    assert client.get("/api/allocation/status", headers=resident).status_code == 200


def test_auth_payload_exposes_resident_flat_reference(client, db):
    setup_world(db)
    resident = _resident_headers(
        client, db, email="me.resident@example.com", flat_number="A-101"
    )

    me = client.get("/api/auth/me", headers=resident)
    assert me.status_code == 200, me.text
    body = me.json()
    assert body["role"] == "RESIDENT"
    assert body["flat_number"] == "A-101"
    assert body["apartment_id"] is not None


def test_residents_are_scoped_to_their_own_apartment(client, db):
    apartments = setup_world(db)
    run = create_run(db, apartments)
    admin = _admin_headers(client, db)
    resident = _resident_headers(
        client, db, email="scoped.resident@example.com", flat_number="A-101"
    )

    saved = _calculate(client, admin, simulation_run_id=run.id, save=True)
    assert saved.status_code == 200, saved.text
    run_id = saved.json()["run_id"]

    own = client.get(
        "/api/allocation/A-101", params={"allocation_run_id": run_id}, headers=resident
    )
    assert own.status_code == 200, own.text
    assert own.json()["apartment"]["flat_number"] == "A-101"

    other = client.get(
        "/api/allocation/A-102", params={"allocation_run_id": run_id}, headers=resident
    )
    assert other.status_code == 403

    hourly = client.get(
        "/api/allocation/hourly",
        params={"allocation_run_id": run_id, "limit": 100},
        headers=resident,
    )
    assert hourly.status_code == 200, hourly.text
    payload = hourly.json()
    assert payload["flat_number"] == "A-101"
    assert payload["total"] == 24
    assert {item["flat_number"] for item in payload["items"]} == {"A-101"}

    admin_other = client.get(
        "/api/allocation/A-102", params={"allocation_run_id": run_id}, headers=admin
    )
    assert admin_other.status_code == 200


def test_records_are_aggregated_hourly_daily_and_monthly(client, db):
    apartments = setup_world(db)
    run = create_run(db, apartments)
    admin = _admin_headers(client, db)
    saved = _calculate(client, admin, simulation_run_id=run.id, save=True)
    run_id = saved.json()["run_id"]

    hourly = client.get(
        "/api/allocation/hourly",
        params={"allocation_run_id": run_id, "flat_id": "A-101", "limit": 100},
        headers=admin,
    )
    assert hourly.status_code == 200, hourly.text
    assert hourly.json()["total"] == 24
    assert all(
        item["allocated_solar_kwh"] == pytest.approx(0.4)
        for item in hourly.json()["items"]
    )

    daily = client.get(
        "/api/allocation/daily",
        params={"allocation_run_id": run_id, "flat_id": "A-101"},
        headers=admin,
    )
    assert daily.status_code == 200, daily.text
    assert daily.json()["total"] == 1
    day = daily.json()["items"][0]
    assert day["period"] == str(START_DATE)
    assert day["allocated_solar_kwh"] == pytest.approx(9.6)
    assert day["consumption_kwh"] == pytest.approx(24.0)
    assert day["solar_coverage_percentage"] == pytest.approx(40.0)

    monthly = client.get(
        "/api/allocation/monthly",
        params={"allocation_run_id": run_id, "flat_id": "A-101"},
        headers=admin,
    )
    assert monthly.status_code == 200, monthly.text
    assert monthly.json()["total"] == 1
    month = monthly.json()["items"][0]
    assert month["period"] == "2026-03"
    assert month["allocated_solar_kwh"] == pytest.approx(9.6)

    all_daily = client.get(
        "/api/allocation/daily",
        params={"allocation_run_id": run_id},
        headers=admin,
    )
    assert all_daily.status_code == 200, all_daily.text
    assert all_daily.json()["items"][0]["apartment_count"] == 60
    assert all_daily.json()["items"][0]["allocated_solar_kwh"] == pytest.approx(576.0)


def test_fairness_endpoint_compares_three_methods_on_identical_inputs(client, db):
    apartments = setup_world(db)
    run = create_run(db, apartments)
    admin = _admin_headers(client, db)

    response = client.get(
        "/api/allocation/fairness",
        params={"simulation_run_id": run.id},
        headers=admin,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["source"] == "preview"
    assert {item["method"] for item in body["methods"]} == set(AllocationMethod.ALL)
    for item in body["methods"]:
        assert item["fairness"]["jain_index"] is not None
    assert set(body["comparison"]["jain_index"]) == set(AllocationMethod.ALL)

    saved = _calculate(client, admin, simulation_run_id=run.id, save=True).json()
    saved_response = client.get(
        "/api/allocation/fairness",
        params={"allocation_run_id": saved["run_id"]},
        headers=admin,
    )
    assert saved_response.status_code == 200, saved_response.text
    saved_body = saved_response.json()
    assert saved_body["source"] == "saved"
    assert saved_body["methods"][0]["fairness"]["jain_index"] == pytest.approx(
        saved["fairness"]["jain_index"]
    )


def test_comparison_preview_saved_and_what_if_never_persists(client, db):
    apartments = setup_world(db)
    run = create_run(db, apartments)
    admin = _admin_headers(client, db)

    preview = client.get(
        "/api/allocation/compare",
        params={"simulation_run_id": run.id},
        headers=admin,
    )
    assert preview.status_code == 200, preview.text
    preview_body = preview.json()
    assert preview_body["source"] == "preview"
    assert preview_body["apartments_compared"] == 60
    assert len(preview_body["methods"]) == 3
    assert db.scalar(select(func.count()).select_from(AllocationRun)) == 0

    run_ids = {}
    for method in AllocationMethod.ALL:
        body = _calculate(
            client, admin, simulation_run_id=run.id, method=method, save=True
        ).json()
        run_ids[method] = body["run_id"]

    saved = client.get(
        "/api/allocation/compare",
        params={"simulation_run_id": run.id, "source": "saved"},
        headers=admin,
    )
    assert saved.status_code == 200, saved.text
    saved_body = saved.json()
    assert saved_body["source"] == "saved"
    assert saved_body["saved_run_ids"] == run_ids

    hypothetical = client.post(
        "/api/allocation/compare",
        json={
            "simulation_run_id": run.id,
            "solar_multiplier": 0.5,
            "hypothetical": True,
        },
        headers=admin,
    )
    assert hypothetical.status_code == 200, hypothetical.text
    hypothetical_body = hypothetical.json()
    assert hypothetical_body["source"] == "preview"
    assert hypothetical_body["is_hypothetical"] is True
    assert db.scalar(select(func.count()).select_from(AllocationRun)) == 3

    blocked = _calculate(
        client,
        admin,
        simulation_run_id=run.id,
        save=True,
        solar_multiplier=0.5,
    )
    assert blocked.status_code == 400
    assert "preview only" in blocked.json()["error"]["message"]


def test_saved_comparison_rejects_incomplete_method_sets(client, db):
    apartments = setup_world(db)
    run = create_run(db, apartments)
    admin = _admin_headers(client, db)

    _calculate(
        client,
        admin,
        simulation_run_id=run.id,
        method=AllocationMethod.EQUAL_SHARE,
        save=True,
    )
    response = client.get(
        "/api/allocation/compare",
        params={"simulation_run_id": run.id, "source": "saved"},
        headers=admin,
    )
    assert response.status_code == 404
    assert "Save all three methods first" in response.json()["error"]["message"]


def test_run_history_detail_and_apartment_detail(client, db):
    apartments = setup_world(db)
    run = create_run(db, apartments)
    admin = _admin_headers(client, db)
    body = _calculate(
        client, admin, simulation_run_id=run.id, save=True
    ).json()
    run_id = body["run_id"]

    history = client.get("/api/allocation/runs", headers=admin)
    assert history.status_code == 200
    assert history.json()["total"] == 1
    assert history.json()["items"][0]["id"] == run_id

    detail = client.get(f"/api/allocation/runs/{run_id}", headers=admin)
    assert detail.status_code == 200, detail.text
    assert detail.json()["run"]["id"] == run_id
    assert detail.json()["apartments_analyzed"] == 60

    flat = client.get(
        f"/api/allocation/A-101",
        params={"allocation_run_id": run_id},
        headers=admin,
    )
    assert flat.status_code == 200, flat.text
    flat_body = flat.json()
    assert flat_body["saved"] is True
    assert flat_body["summary"]["total_solar_allocation_kwh"] == pytest.approx(9.6)
    assert flat_body["summary"]["estimated_solar_credit"] == pytest.approx(72.0)
    assert flat_body["tariff_price_per_kwh"] == pytest.approx(7.5)

    missing = client.get("/api/allocation/ZZ-999", headers=admin)
    assert missing.status_code == 404
