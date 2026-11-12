"""Request correlation and access logging middleware."""

from __future__ import annotations

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import request_id_var

logger = logging.getLogger("solarequity.access")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Attach a request ID, structured access log and response header."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        extra = {
            "method": request.method,
            "path": request.url.path,
            "client_ip": request.client.host if request.client else None,
        }

        try:
            response = await call_next(request)
        except Exception:
            extra["duration_ms"] = round((time.perf_counter() - started) * 1000, 2)
            logger.exception("Request failed", extra=extra)
            request_id_var.reset(token)
            raise

        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "HTTP %s %s -> %s",
            request.method,
            request.url.path,
            response.status_code,
            extra={**extra, "status_code": response.status_code, "duration_ms": duration_ms},
        )
        request_id_var.reset(token)
        return response
