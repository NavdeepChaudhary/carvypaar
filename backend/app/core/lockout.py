"""Login brute-force protection (complements the per-IP rate limit).

After LOGIN_LOCKOUT_ATTEMPTS failed logins for the same (email, client IP) within
LOGIN_LOCKOUT_MINUTES, further attempts from that pair are refused (429) until the
window expires. A successful login clears the counter.

Keying on email+IP (not email alone) means an attacker can't lock a real user out
of their account from somewhere else, while one source still can't hammer one account.
Uses Redis when REDIS_URL is set (shared across workers), else process memory.
"""
from __future__ import annotations

import threading
import time
from typing import Protocol

from app.core.config import settings


class _Store(Protocol):
    def hit(self, key: str, window: int) -> int: ...
    def count(self, key: str) -> int: ...
    def ttl(self, key: str) -> int: ...
    def clear(self, key: str) -> None: ...


class MemoryStore:
    def __init__(self) -> None:
        self._data: dict[str, tuple[int, float]] = {}
        self._lock = threading.Lock()

    def _live(self, key: str) -> tuple[int, float] | None:
        item = self._data.get(key)
        if item and item[1] <= time.monotonic():
            self._data.pop(key, None)
            return None
        return item

    def hit(self, key: str, window: int) -> int:
        with self._lock:
            item = self._live(key)
            count, expires = (item[0] + 1, item[1]) if item else (1, time.monotonic() + window)
            self._data[key] = (count, expires)
            if len(self._data) > 50_000:  # bound memory under attack
                now = time.monotonic()
                for k in [k for k, (_, exp) in self._data.items() if exp <= now]:
                    self._data.pop(k, None)
            return count

    def count(self, key: str) -> int:
        with self._lock:
            item = self._live(key)
            return item[0] if item else 0

    def ttl(self, key: str) -> int:
        with self._lock:
            item = self._live(key)
            return max(1, int(item[1] - time.monotonic())) if item else 0

    def clear(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)


class RedisStore:
    def __init__(self, url: str) -> None:
        import redis

        self._r = redis.Redis.from_url(url, socket_timeout=2)

    def hit(self, key: str, window: int) -> int:
        pipe = self._r.pipeline()
        pipe.incr(key)
        pipe.expire(key, window, nx=True)
        return int(pipe.execute()[0])

    def count(self, key: str) -> int:
        return int(self._r.get(key) or 0)

    def ttl(self, key: str) -> int:
        return max(1, int(self._r.ttl(key)))

    def clear(self, key: str) -> None:
        self._r.delete(key)


class LoginThrottle:
    def __init__(self, store: _Store) -> None:
        self.store = store

    @staticmethod
    def _key(email: str, ip: str | None) -> str:
        return f"carvypaar:login-fail:{email.lower()}:{ip or '-'}"

    def retry_after(self, email: str, ip: str | None) -> int:
        """Seconds until the pair may try again (0 = not locked)."""
        key = self._key(email, ip)
        return self.store.ttl(key) if self.store.count(key) >= settings.LOGIN_LOCKOUT_ATTEMPTS else 0

    def failed(self, email: str, ip: str | None) -> None:
        self.store.hit(self._key(email, ip), settings.LOGIN_LOCKOUT_MINUTES * 60)

    def succeeded(self, email: str, ip: str | None) -> None:
        self.store.clear(self._key(email, ip))


def _build() -> LoginThrottle:
    return LoginThrottle(RedisStore(settings.REDIS_URL) if settings.REDIS_URL else MemoryStore())


throttle = _build()
