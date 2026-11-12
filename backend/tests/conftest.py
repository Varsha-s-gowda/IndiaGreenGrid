"""Test configuration. Environment is set before importing the application."""

from __future__ import annotations

import os

os.environ.update(
    {
        "APP_ENV": "test",
        "DATABASE_URL": "sqlite+pysqlite:///:memory:",
        "JWT_SECRET_KEY": "test-only-secret-key-with-more-than-32-characters",
        "BCRYPT_ROUNDS": "4",
        "AUTO_CREATE_TABLES": "true",
        "LOG_LEVEL": "WARNING",
        "DEMO_ADMIN_PASSWORD": "AdminTest#2026",
        "DEMO_RESIDENT_PASSWORD": "ResidentTest#2026",
        "FORECAST_LIVE_WEATHER_ENABLED": "false",
    }
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401  (register metadata)
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def reset_database():
    """Give every test a clean schema in the shared in-memory database."""

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
