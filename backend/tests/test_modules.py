"""Placeholder module router tests."""

from __future__ import annotations

import pytest

from app.models.user import UserRole
from tests.helpers import DEFAULT_PASSWORD, create_user, login_headers

MODULES = {
    "simulation": "/api/simulation/status",
    "allocation": "/api/allocation/status",
    "billing": "/api/billing/status",
    "roofmax": "/api/roofmax/status",
    "meterguard": "/api/meterguard/status",
    "battery": "/api/battery/status",
}


@pytest.mark.parametrize(("module", "path"), MODULES.items())
def test_placeholder_modules_require_authentication(client, module, path):
    assert client.get(path).status_code == 401


@pytest.mark.parametrize(("module", "path"), MODULES.items())
def test_placeholder_modules_return_status(client, db, module, path):
    create_user(db, email=f"{module}@example.com", role=UserRole.RESIDENT)
    headers = login_headers(client, f"{module}@example.com", DEFAULT_PASSWORD)

    response = client.get(path, headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["module"] == module
    assert body["status"] == "placeholder"
    assert body["available"] is False
    assert body["message"]
