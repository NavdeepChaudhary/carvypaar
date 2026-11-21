"""Test fixtures.

Each test gets its own SQLite *file* database (not :memory:) so that request
handlers, WebSocket handlers, worker threads and the test itself can all open
independent sessions and connections, just like production.
"""
import os
import tempfile

# Must be set before any `app.*` import so Settings picks them up.
os.environ.update(
    {
        "ENVIRONMENT": "test",
        "DATABASE_URL": "sqlite://",
        "RATE_LIMIT_ENABLED": "false",
        "BCRYPT_ROUNDS": "4",
        "AUCTION_WORKER_ENABLED": "false",
        # Most tests want listings live immediately; approval tests switch it on explicitly.
        "REQUIRE_LISTING_APPROVAL": "false",  # tests drive auction_service.tick() directly
        "PRICE_MODEL_PATH": os.path.join(tempfile.gettempdir(), "carvypaar-no-model.joblib"),  # opt-in per test
        "UPLOAD_DIR": tempfile.mkdtemp(prefix="carvypaar-test-uploads-"),
    }
)

from collections.abc import Callable, Generator  # noqa: E402
from typing import Any  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402

from app import models  # noqa: E402,F401  (register tables)
from app.db import session as session_module  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402

DEFAULT_PASSWORD = "Sup3rSecret!"


@pytest.fixture()
def session_factory(tmp_path, monkeypatch) -> Generator[sessionmaker[Session], None, None]:
    engine = session_module.build_engine(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    # Every app code path (get_db, WebSockets, workers) opens sessions via this attribute.
    monkeypatch.setattr(session_module, "SessionLocal", factory)
    yield factory
    engine.dispose()


@pytest.fixture()
def db_session(session_factory) -> Generator[Session, None, None]:
    """A session for the test itself (arranging data, asserting state)."""
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(session_factory) -> Generator[TestClient, None, None]:
    with TestClient(fastapi_app) as c:
        yield c


@pytest.fixture()
def register_user(client: TestClient) -> Callable[..., dict[str, Any]]:
    """Factory: register a user and return the token response JSON."""

    def _register(email: str = "driver@example.com", role: str = "buyer", **extra: Any) -> dict[str, Any]:
        payload = {"email": email, "password": DEFAULT_PASSWORD, "full_name": "Test Driver", "role": role}
        payload.update(extra)
        res = client.post("/api/auth/register", json=payload)
        assert res.status_code == 201, res.text
        return res.json()

    return _register


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _fresh_login_throttle():
    """Failed-login counters live in process memory; isolate them per test."""
    from app.core import lockout

    lockout.throttle.store = lockout.MemoryStore()
    yield
