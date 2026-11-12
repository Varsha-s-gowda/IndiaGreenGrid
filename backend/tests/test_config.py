"""Configuration safety tests."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def _production_settings(**overrides):
    values = {
        "app_env": "production",
        "debug": False,
        "jwt_secret_key": "s" * 64,
        "demo_admin_password": "StrongAdmin#2026",
        "demo_resident_password": "StrongResident#2026",
        "_env_file": None,
    }
    values.update(overrides)
    return Settings(**values)


def test_production_accepts_strong_secrets():
    settings = _production_settings()

    assert settings.is_production is True
    assert settings.database_uri


@pytest.mark.parametrize(
    "secret",
    [
        "short",
        "replace-with-a-random-secret-at-least-32-characters",
        "dev-only-insecure-secret-change-me-before-deploying",
    ],
)
def test_production_rejects_weak_or_placeholder_jwt_secrets(secret):
    with pytest.raises(ValidationError):
        _production_settings(jwt_secret_key=secret)


def test_production_rejects_placeholder_demo_passwords():
    with pytest.raises(ValidationError):
        _production_settings(demo_admin_password="change-this-admin-password")
