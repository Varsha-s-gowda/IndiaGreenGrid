"""Live weather retrieval for the forecasting module (D8).

Open-Meteo is used because it requires no API key.  The provider is strictly
optional: any network error, timeout, malformed payload or unsupported
location returns ``None`` and the caller falls back to the bundled sample
templates.  This module never fabricates a reading.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

CITY_COORDINATES: dict[str, tuple[float, float, str]] = {
    "New Delhi": (28.6139, 77.2090, "Delhi"),
    "Jaipur": (26.9124, 75.7873, "Rajasthan"),
    "Ahmedabad": (23.0225, 72.5714, "Gujarat"),
    "Mumbai": (19.0760, 72.8777, "Maharashtra"),
    "Pune": (18.5204, 73.8567, "Maharashtra"),
    "Bengaluru": (12.9716, 77.5946, "Karnataka"),
    "Chennai": (13.0827, 80.2707, "Tamil Nadu"),
    "Hyderabad": (17.3850, 78.4867, "Telangana"),
    "Kolkata": (22.5726, 88.3639, "West Bengal"),
    "Lucknow": (26.8467, 80.9462, "Uttar Pradesh"),
}

SOURCE_NAME = "Open-Meteo"
SOURCE_URL = "https://open-meteo.com/"


@dataclass
class WeatherDay:
    """Minimal weather day shared by live and template forecast paths."""

    forecast_date: date
    temperature_c: float
    irradiance_kwh_m2_day: float
    wind_speed_ms: float
    cloud_cover_pct: float
    state: str = ""


@dataclass
class LiveWeather:
    location: str
    state: str
    days: list[WeatherDay]
    retrieved_at: datetime
    source_name: str = SOURCE_NAME
    source_url: str = SOURCE_URL
    request_url: str = ""
    notes: list[str] = field(default_factory=list)


def supported_locations() -> list[dict[str, Any]]:
    return [
        {"location": name, "state": state}
        for name, (_, _, state) in CITY_COORDINATES.items()
    ]


def fetch_live_weather(location: str) -> LiveWeather | None:
    """Fetch a 7-day daily forecast from Open-Meteo.

    Returns ``None`` (never raises) when the provider is disabled, the
    location is unknown, the request fails or the payload is unusable.
    """

    if not settings.forecast_live_weather_enabled:
        return None
    coordinates = CITY_COORDINATES.get(location)
    if coordinates is None:
        return None
    latitude, longitude, state = coordinates

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "daily": (
            "temperature_2m_max,shortwave_radiation_sum,"
            "wind_speed_10m_max,cloud_cover_mean"
        ),
        "wind_speed_unit": "ms",
        "forecast_days": 7,
        "timezone": "Asia/Kolkata",
    }
    try:
        with httpx.Client(
            timeout=settings.forecast_weather_timeout_seconds,
            follow_redirects=True,
        ) as client:
            response = client.get(settings.forecast_weather_base_url, params=params)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Open-Meteo fetch failed for %s: %s", location, exc)
        return None

    daily = payload.get("daily") or {}
    dates = daily.get("time") or []
    temperatures = daily.get("temperature_2m_max") or []
    radiation = daily.get("shortwave_radiation_sum") or []
    wind = daily.get("wind_speed_10m_max") or []
    cloud = daily.get("cloud_cover_mean") or []
    if not dates or not (
        len(dates) == len(temperatures) == len(radiation) == len(wind) == len(cloud)
    ):
        logger.warning("Open-Meteo payload for %s was incomplete.", location)
        return None

    days: list[WeatherDay] = []
    for index, raw_date in enumerate(dates):
        try:
            day = date.fromisoformat(str(raw_date))
            irradiance = float(radiation[index]) / 3.6
            days.append(
                WeatherDay(
                    forecast_date=day,
                    temperature_c=float(temperatures[index]),
                    irradiance_kwh_m2_day=round(max(0.0, irradiance), 3),
                    wind_speed_ms=round(max(0.0, float(wind[index])), 2),
                    cloud_cover_pct=round(max(0.0, min(100.0, float(cloud[index]))), 1),
                    state=state,
                )
            )
        except (TypeError, ValueError):
            logger.warning("Skipping malformed weather day for %s.", location)
            continue

    if not days:
        return None

    return LiveWeather(
        location=location,
        state=state,
        days=days,
        retrieved_at=datetime.now(timezone.utc),
        request_url=str(response.url),
        notes=[
            "Daily shortwave radiation is converted from MJ/m2/day to kWh/m2/day.",
            "Generation is still an engineering estimate, not metered output.",
        ],
    )
