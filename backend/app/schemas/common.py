"""Shared response schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    app: str
    version: str
    environment: str
    timestamp: datetime


class DatabaseHealthResponse(BaseModel):
    status: str
    dialect: str
    database: str
    latency_ms: float = Field(ge=0)
    checked_at: datetime


class ModuleStatusResponse(BaseModel):
    module: str
    status: str = "placeholder"
    available: bool = False
    message: str


class MessageResponse(BaseModel):
    message: str
