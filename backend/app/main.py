"""FastAPI application factory."""
from __future__ import annotations

import asyncio
import logging
import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import text

from app.api.routes import admin, auctions, auth, interactions, listings, price, users, ws
from app.core.config import settings
from app.core.middleware import BodySizeLimitMiddleware, RequestContextMiddleware, SecurityHeadersMiddleware
from app.core.rate_limit import limiter
from app.db.session import new_session
from app.realtime import hub
from app.services import auction_service
from app.services.images import ImageValidationError
from app.services.listing_service import ListingError

logging.basicConfig(level=settings.LOG_LEVEL, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger("carvypaar")


def _run_auction_tick() -> dict[str, int]:
    with new_session() as db:
        return auction_service.tick(db)


async def auction_worker() -> None:
    """Opens scheduled auctions and closes expired ones (winner, notifications, broadcast)."""
    logger.info("Auction worker started (tick=%ss)", settings.AUCTION_TICK_SECONDS)
    while True:
        try:
            result = await asyncio.to_thread(_run_auction_tick)
            if result["opened"] or result["closed"]:
                logger.info("Auction tick: %s", result)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - a bad tick must never kill the worker
            logger.exception("Auction tick failed")
        await asyncio.sleep(settings.AUCTION_TICK_SECONDS)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # Schema is managed by Alembic (`alembic upgrade head`), never create_all here.
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    hub.bind_loop(asyncio.get_running_loop())
    if settings.REDIS_URL:
        await hub.start_redis(settings.REDIS_URL)  # cross-worker WebSocket fan-out
    worker = asyncio.create_task(auction_worker()) if settings.AUCTION_WORKER_ENABLED else None
    logger.info("%s API starting (env=%s)", settings.APP_NAME, settings.ENVIRONMENT)
    try:
        yield
    finally:
        if worker is not None:
            worker.cancel()
            with suppress(asyncio.CancelledError):
                await worker
        await hub.stop_redis()
        logger.info("%s API shutting down", settings.APP_NAME)


def create_app() -> FastAPI:
    app = FastAPI(
        title=f"{settings.APP_NAME} API",
        version="0.1.0",
        lifespan=lifespan,
        # Hide interactive docs in production to reduce attack surface.
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
    )

    # --- Rate limiting ---
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]
    app.add_middleware(SlowAPIMiddleware)

    # --- Request size limit: rejects oversized bodies (413) before they're read ---
    app.add_middleware(
        BodySizeLimitMiddleware,
        default_max=settings.MAX_JSON_BODY_KB * 1024,
        upload_max=settings.max_upload_request_bytes,
        upload_path=re.compile(rf"^{re.escape(settings.API_PREFIX)}/listings/\d+/images$"),
    )

    # --- Compression + CORS (explicit origins only; credentials needed for refresh cookie) ---
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )
    # Starlette runs the LAST-added middleware FIRST. Execution order is therefore:
    # RequestContext -> SecurityHeaders -> CORS -> GZip -> BodySizeLimit -> SlowAPI -> routes,
    # so every response (including 413s and CORS preflights) gets security headers and a request ID.
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestContextMiddleware)

    # --- Domain errors -> JSON ---
    @app.exception_handler(ListingError)
    async def listing_error(_request: Request, exc: ListingError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})

    @app.exception_handler(ImageValidationError)
    async def image_error(_request: Request, exc: ImageValidationError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    # --- Never leak stack traces to clients ---
    @app.exception_handler(Exception)
    async def unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    # --- Routes ---
    app.include_router(auth.router, prefix=settings.API_PREFIX)
    app.include_router(users.router, prefix=settings.API_PREFIX)
    app.include_router(listings.router, prefix=settings.API_PREFIX)
    app.include_router(interactions.offers, prefix=settings.API_PREFIX)
    app.include_router(interactions.messages, prefix=settings.API_PREFIX)
    app.include_router(interactions.notifications, prefix=settings.API_PREFIX)
    app.include_router(auctions.router, prefix=settings.API_PREFIX)
    app.include_router(price.router, prefix=settings.API_PREFIX)
    app.include_router(admin.router, prefix=settings.API_PREFIX)
    app.include_router(admin.public, prefix=settings.API_PREFIX)
    app.include_router(ws.router, prefix=settings.API_PREFIX)

    @app.get(f"{settings.API_PREFIX}/health", tags=["meta"])
    def health() -> dict[str, str]:
        """Liveness + DB connectivity check (used by Docker healthcheck)."""
        db_status = "ok"
        try:
            with new_session() as db:
                db.execute(text("SELECT 1"))
        except Exception:  # noqa: BLE001 - report, don't crash
            db_status = "unavailable"
        return {"status": "ok", "database": db_status, "app": settings.APP_NAME}

    # --- Local uploads (swap for a CDN when using S3/Cloudinary) ---
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

    return app


app = create_app()
