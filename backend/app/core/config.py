"""Application settings loaded from environment variables (and an optional .env file)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import quote_plus

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_JWT_SECRET = "dev-only-insecure-secret-change-me-before-deploying"
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    """Typed application configuration.

    Every value can be overridden with an environment variable. The bundled
    ``.env.example`` documents the supported variables.
    """

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "India Green Grid"
    app_version: str = "1.0.0"
    app_description: str = (
        "Web-based decision-support platform for accelerating India's renewable "
        "energy transition, with integrated Community Solar Management."
    )
    app_env: Literal["development", "test", "production"] = "development"
    debug: bool = False
    api_prefix: str = "/api"
    host: str = "127.0.0.1"
    port: int = 8000
    log_level: str = "INFO"

    database_url: str | None = None
    postgres_host: str = "127.0.0.1"
    postgres_port: int = 5432
    postgres_user: str = "solarequity"
    postgres_password: str = ""
    postgres_db: str = "solarequity360"

    db_pool_size: int = Field(default=5, ge=1, le=50)
    db_max_overflow: int = Field(default=10, ge=0, le=100)
    db_pool_timeout: int = Field(default=30, ge=1, le=300)
    db_pool_recycle: int = Field(default=1800, ge=60)
    db_pool_pre_ping: bool = True
    auto_create_tables: bool = True

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    jwt_secret_key: str = DEV_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=60, ge=5, le=60 * 24 * 7)
    bcrypt_rounds: int = Field(default=12, ge=4, le=16)

    forecast_live_weather_enabled: bool = True
    forecast_weather_timeout_seconds: float = Field(default=6.0, ge=1, le=30)
    forecast_weather_base_url: str = "https://api.open-meteo.com/v1/forecast"

    demo_admin_email: str = "admin@solarequity.com"
    demo_resident_1_email: str = "resident101@solarequity.com"
    demo_resident_2_email: str = "resident102@solarequity.com"
    demo_admin_name: str = "Society Administrator"
    demo_resident_1_name: str = "Resident 101"
    demo_resident_2_name: str = "Resident 102"
    demo_admin_password: str | None = None
    demo_resident_password: str | None = None

    @field_validator("api_prefix")
    @classmethod
    def _normalise_prefix(cls, value: str) -> str:
        value = value.strip()
        if not value.startswith("/"):
            value = f"/{value}"
        return value.rstrip("/") or "/api"

    @field_validator("log_level")
    @classmethod
    def _normalise_log_level(cls, value: str) -> str:
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        value = value.upper()
        if value not in allowed:
            raise ValueError(f"LOG_LEVEL must be one of {sorted(allowed)}")
        return value

    @property
    def database_uri(self) -> str:
        """Return the SQLAlchemy database URL.

        ``DATABASE_URL`` wins when supplied. Otherwise the URL is assembled from
        the individual ``POSTGRES_*`` settings. Credentials are URL-encoded so
        special characters in passwords are safe.
        """

        if self.database_url:
            return self.database_url
        user = quote_plus(self.postgres_user)
        password = quote_plus(self.postgres_password)
        return (
            f"postgresql+psycopg2://{user}:{password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @model_validator(mode="after")
    def _validate_production_safety(self) -> "Settings":
        if self.app_env != "production":
            return self

        insecure_markers = ("replace-with", "change-me", "change-this", "dev-only")
        secret_lower = self.jwt_secret_key.lower()
        if (
            len(self.jwt_secret_key) < 32
            or any(marker in secret_lower for marker in insecure_markers)
        ):
            raise ValueError(
                "JWT_SECRET_KEY must be a unique value of at least 32 characters "
                "without placeholder text in production."
            )
        if self.debug:
            raise ValueError("DEBUG must be false in production.")
        if not self.demo_admin_password or not self.demo_resident_password:
            raise ValueError(
                "DEMO_ADMIN_PASSWORD and DEMO_RESIDENT_PASSWORD must be explicitly "
                "configured before seeding production data."
            )
        for name, password in (
            ("DEMO_ADMIN_PASSWORD", self.demo_admin_password),
            ("DEMO_RESIDENT_PASSWORD", self.demo_resident_password),
        ):
            if any(marker in password.lower() for marker in insecure_markers):
                raise ValueError(f"{name} still contains placeholder text.")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
