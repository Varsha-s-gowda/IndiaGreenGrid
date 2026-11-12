"""Health, middleware and error-envelope tests."""

from __future__ import annotations


def test_application_health(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["app"] == "India Green Grid"
    assert body["version"] == "1.0.0"
    assert body["environment"] == "test"
    assert body["timestamp"]
    assert response.headers.get("X-Request-ID")


def test_request_id_is_echoed(client):
    response = client.get("/api/health", headers={"X-Request-ID": "trace-123"})

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "trace-123"


def test_database_health(client):
    response = client.get("/api/health/database")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "connected"
    assert body["dialect"] == "sqlite"
    assert body["latency_ms"] >= 0
    assert body["checked_at"]


def test_unknown_route_uses_error_envelope(client):
    response = client.get("/api/does-not-exist")

    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "http_404"
    assert body["error"]["message"]
    assert "request_id" in body


def test_root_redirects_to_docs(client):
    response = client.get("/", follow_redirects=False)

    assert response.status_code in (302, 307)
    assert response.headers["location"] == "/docs"


def test_openapi_document_exposes_all_modules(client):
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    for path in (
        "/api/health",
        "/api/health/database",
        "/api/auth/register",
        "/api/auth/login",
        "/api/auth/me",
        "/api/simulation/status",
        "/api/allocation/status",
        "/api/billing/status",
        "/api/roofmax/status",
        "/api/meterguard/status",
        "/api/battery/status",
    ):
        assert path in paths
