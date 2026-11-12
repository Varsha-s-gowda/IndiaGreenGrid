"""Health-check business logic."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.exceptions import ServiceUnavailableError
from app.schemas.common import DatabaseHealthResponse

logger = logging.getLogger(__name__)


def check_database(db: Session) -> DatabaseHealthResponse:
    """Run a lightweight query and report connection metadata."""

    started = time.perf_counter()
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        logger.exception("Database health check failed")
        raise ServiceUnavailableError(
            "The database is unavailable.",
            details={"hint": "Check DATABASE_URL and that PostgreSQL is running."},
        ) from exc

    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    bind = db.get_bind()
    url = bind.url

    return DatabaseHealthResponse(
        status="connected",
        dialect=url.get_backend_name(),
        database=url.database or "unknown",
        latency_ms=latency_ms,
        checked_at=datetime.now(timezone.utc),
    )
