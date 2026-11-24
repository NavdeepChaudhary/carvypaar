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


CLERK_TEST_PREFIX = "test-clerk-session:"


def clerk_token(email: str) -> str:
    """A stand-in Clerk session token: the fake below maps it straight to a Clerk user."""
    return f"{CLERK_TEST_PREFIX}{email}"


@pytest.fixture(autouse=True)
def fake_clerk(monkeypatch):
    """Replace the two network calls to Clerk (token verification, user lookup). The real
    token checks are covered with signed JWTs in test_clerk_auth.py."""
    from app.services import clerk_auth

    def verify(token: str) -> str:
        if not token.startswith(CLERK_TEST_PREFIX):
            raise clerk_auth.AuthError("Sign-in failed: invalid or expired session")
        return "user_" + token[len(CLERK_TEST_PREFIX):]

    def identity(user_id: str) -> clerk_auth.ClerkIdentity:
        email = user_id.removeprefix("user_")
        return clerk_auth.ClerkIdentity(user_id=user_id, email=email, name="Test Driver", picture=None)

    monkeypatch.setattr(clerk_auth, "verify_session_token", verify)
    monkeypatch.setattr(clerk_auth, "get_identity", identity)


@pytest.fixture()
def register_user(client: TestClient, session_factory) -> Callable[..., dict[str, Any]]:
    """Factory: create a user, sign them in through Clerk and return the token response JSON."""
    from app.models import UserRole
    from app.services import auth_service

    def _register(email: str = "driver@example.com", role: str = "buyer", **extra: Any) -> dict[str, Any]:
        with session_factory() as db:
            extra.setdefault("full_name", "Test Driver")
            auth_service.register_user(db, email=email, password=DEFAULT_PASSWORD, role=UserRole(role), **extra)
        res = client.post("/api/auth/clerk", json={"token": clerk_token(email)})
        assert res.status_code == 200, res.text
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
