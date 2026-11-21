"""Pure-ASGI middleware: request IDs + access log, body-size limits, security headers.

Written as raw ASGI (not BaseHTTPMiddleware) so they add negligible overhead,
never buffer bodies, and pass WebSocket traffic through untouched.
"""
from __future__ import annotations

import logging
import re
import time
import uuid
from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any

from app.core.config import settings

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]

access_log = logging.getLogger("carvypaar.access")
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{8,64}$")


def _header(scope: Scope, name: bytes) -> str | None:
    for key, value in scope.get("headers", []):
        if key == name:
            return value.decode("latin-1")
    return None


class RequestContextMiddleware:
    """Assigns every request an ID (reusing a well-formed incoming X-Request-ID from a
    proxy), returns it as a response header, and writes one access-log line per request.
    Paths and status codes only: never bodies, tokens or query strings (they may hold PII)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = _header(scope, b"x-request-id")
        request_id = incoming if incoming and _REQUEST_ID_RE.match(incoming) else uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        started = time.perf_counter()
        status = 500

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message.setdefault("headers", []).append((b"x-request-id", request_id.encode()))
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            client = scope.get("client") or ("-", 0)
            access_log.info(
                "%s %s %s %d %.1fms rid=%s",
                client[0], scope["method"], scope["path"], status,
                (time.perf_counter() - started) * 1000, request_id,
            )


class BodySizeLimitMiddleware:
    """Rejects oversized request bodies with 413 before the app (or multipart parser)
    reads them. Checks Content-Length up front and also counts streamed bytes, so
    chunked uploads can't bypass the limit."""

    def __init__(self, app: ASGIApp, default_max: int, upload_max: int, upload_path: re.Pattern[str]) -> None:
        self.app = app
        self.default_max = default_max
        self.upload_max = upload_max
        self.upload_path = upload_path

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] in ("GET", "HEAD", "OPTIONS"):
            await self.app(scope, receive, send)
            return
        limit = self.upload_max if self.upload_path.match(scope["path"]) else self.default_max
        declared = _header(scope, b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > limit:
            await self._reject(send, limit)
            return

        received = 0
        exceeded = False
        response_started = False

        async def limited_receive() -> Message:
            nonlocal received, exceeded
            if exceeded:
                return {"type": "http.request", "body": b"", "more_body": False}
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    # Stop feeding the body. (Raising here wouldn't work: FastAPI turns any
                    # body-parsing error into a generic 400.) The app then fails on the
                    # truncated body and send_wrapper swaps its response for our 413.
                    exceeded = True
                    return {"type": "http.request", "body": b"", "more_body": False}
            return message

        async def send_wrapper(message: Message) -> None:
            nonlocal response_started
            if exceeded:
                if message["type"] == "http.response.start" and not response_started:
                    response_started = True
                    await self._reject(send, limit)
                return  # drop the app's own response for the truncated request
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        await self.app(scope, limited_receive, send_wrapper)

    @staticmethod
    async def _reject(send: Send, limit: int) -> None:
        body = (b'{"detail":"Request body too large (max %d MB)"}' % max(1, limit // (1024 * 1024)))
        await send({"type": "http.response.start", "status": 413,
                    "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})


# API responses are JSON, never rendered as documents: lock them down completely.
_API_CSP = b"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
# Uploaded files: even if a non-image ever slipped through, the browser won't run it.
_UPLOAD_CSP = b"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        is_upload = scope["path"].startswith("/uploads/")
        is_docs = scope["path"] in ("/docs", "/redoc") or scope["path"].startswith("/docs/")

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                present = {k.lower() for k, _ in headers}

                def add(name: bytes, value: bytes) -> None:
                    if name not in present:
                        headers.append((name, value))

                add(b"x-content-type-options", b"nosniff")
                add(b"x-frame-options", b"DENY")
                add(b"referrer-policy", b"strict-origin-when-cross-origin")
                add(b"permissions-policy", b"camera=(), microphone=(), geolocation=(), payment=()")
                add(b"cross-origin-opener-policy", b"same-origin")
                if is_upload:
                    add(b"content-security-policy", _UPLOAD_CSP)
                    add(b"cross-origin-resource-policy", b"cross-origin")  # the web app may live on another origin
                elif not is_docs:  # Swagger UI needs its own scripts/styles (dev only)
                    add(b"content-security-policy", _API_CSP)
                    add(b"cross-origin-resource-policy", b"same-site")
                if settings.is_production:
                    add(b"strict-transport-security", b"max-age=63072000; includeSubDomains")
                add(b"cache-control", b"public, max-age=604800, immutable" if is_upload else b"no-store")
            await send(message)

        await self.app(scope, receive, send_wrapper)
