"""SQLAlchemy engine, session factory and declarative base."""

from __future__ import annotations

from collections.abc import Generator
from typing import Any

from sqlalchemy import MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Base class for all ORM models."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def _engine_options(database_url: str) -> dict[str, Any]:
    """Build engine options, including connection pooling for PostgreSQL."""

    if database_url.startswith("sqlite"):
        options: dict[str, Any] = {
            "connect_args": {"check_same_thread": False},
        }
        if ":memory:" in database_url:
            options["poolclass"] = StaticPool
        return options

    return {
        "pool_pre_ping": settings.db_pool_pre_ping,
        "pool_size": settings.db_pool_size,
        "max_overflow": settings.db_max_overflow,
        "pool_timeout": settings.db_pool_timeout,
        "pool_recycle": settings.db_pool_recycle,
    }


engine = create_engine(
    settings.database_uri,
    echo=settings.debug,
    future=True,
    **_engine_options(settings.database_uri),
)

SessionLocal = sessionmaker(
    bind=engine,
    class_=Session,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a request-scoped database session."""

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables defined by the ORM metadata.

    This is convenient for local development and tests. Production deployments
    should use a migration tool (for example Alembic) and set
    ``AUTO_CREATE_TABLES=false``.
    """

    import app.models  # noqa: F401  (import side effect)

    Base.metadata.create_all(bind=engine)


def dispose_db() -> None:
    engine.dispose()
