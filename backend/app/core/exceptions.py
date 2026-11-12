"""Application exceptions and centralized FastAPI exception handlers."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import request_id_var

logger = logging.getLogger(__name__)


class AppException(Exception):
    """Base class for expected, client-safe application errors."""

    status_code = 400
    code = "application_error"

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        code: str | None = None,
        details: Any = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code or self.status_code
        self.code = code or self.code
        self.details = details
        self.headers = headers


class BadRequestError(AppException):
    status_code = 400
    code = "bad_request"


class UnauthorizedError(AppException):
    status_code = 401
    code = "unauthorized"

    def __init__(self, message: str, *, details: Any = None) -> None:
        super().__init__(
            message,
            details=details,
            headers={"WWW-Authenticate": "Bearer"},
        )


class ForbiddenError(AppException):
    status_code = 403
    code = "forbidden"


class NotFoundError(AppException):
    status_code = 404
    code = "not_found"


class ConflictError(AppException):
    status_code = 409
    code = "conflict"


class ServiceUnavailableError(AppException):
    status_code = 503
    code = "service_unavailable"


def _error_response(
    status_code: int,
    code: str,
    message: str,
    details: Any = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body = {
        "error": {
            "code": code,
            "message": message,
            "details": jsonable_encoder(details) if details is not None else None,
        },
        "request_id": request_id_var.get(),
    }
    return JSONResponse(status_code=status_code, content=body, headers=headers)


def register_exception_handlers(app: FastAPI) -> None:
    """Attach handlers that produce one predictable JSON error envelope."""

    @app.exception_handler(AppException)
    async def handle_app_exception(request: Request, exc: AppException) -> JSONResponse:
        if exc.status_code >= 500:
            logger.error("Application error: %s", exc.message)
        else:
            logger.info("Request rejected: %s (%s)", exc.message, exc.code)
        return _error_response(
            exc.status_code,
            exc.code,
            exc.message,
            exc.details,
            exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        details = [
            {
                "field": ".".join(str(part) for part in error.get("loc", ())),
                "message": error.get("msg", "Invalid value"),
                "type": error.get("type", "value_error"),
            }
            for error in exc.errors()
        ]
        logger.info("Validation failed for %s %s", request.method, request.url.path)
        return _error_response(
            422,
            "validation_error",
            "The request payload is invalid.",
            details,
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        message = exc.detail if isinstance(exc.detail, str) else "HTTP error"
        return _error_response(
            exc.status_code,
            f"http_{exc.status_code}",
            message,
            None if isinstance(exc.detail, str) else exc.detail,
            dict(exc.headers or {}),
        )

    @app.exception_handler(SQLAlchemyError)
    async def handle_database_error(request: Request, exc: SQLAlchemyError) -> JSONResponse:
        logger.exception("Unhandled database error")
        return _error_response(
            500,
            "database_error",
            "A database error occurred. Please try again later.",
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled server error")
        return _error_response(
            500,
            "internal_server_error",
            "An unexpected error occurred. Please try again later.",
        )
