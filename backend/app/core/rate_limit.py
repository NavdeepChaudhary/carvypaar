"""Shared slowapi limiter. Use `@limiter.limit("5/minute")` on sensitive routes;
every other route gets RATE_LIMIT_DEFAULT via SlowAPIMiddleware."""
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[settings.RATE_LIMIT_DEFAULT],
    storage_uri=settings.rate_limit_storage,  # Redis when REDIS_URL is set (shared across workers)
    enabled=settings.RATE_LIMIT_ENABLED,
)
