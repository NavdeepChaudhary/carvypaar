"""Operational code paths: management CLI, background worker tick, Redis-backed lockout."""
import csv

import pytest
from sqlalchemy import func, select

from app import cli
from app.models import Auction, Listing, User, UserRole


@pytest.fixture()
def cli_db(session_factory, monkeypatch):
    """Point the CLI's session factory at the test database."""
    monkeypatch.setattr(cli, "SessionLocal", session_factory)
    return session_factory


def test_create_admin_and_promote(cli_db, capsys):
    assert cli.main(["create-admin", "--email", "Ops@Example.com", "--name", "Ops", "--password", "Op3ratorPass!"]) == 0
    with cli_db() as db:
        admin = db.scalar(select(User).where(User.email == "ops@example.com"))
        assert admin.role == UserRole.ADMIN and admin.is_verified
        admin.role = UserRole.BUYER
        db.commit()
    assert cli.main(["create-admin", "--email", "ops@example.com", "--password", "Op3ratorPass!"]) == 0
    assert "Promoted" in capsys.readouterr().out
    with cli_db() as db:
        assert db.scalar(select(User.role).where(User.email == "ops@example.com")) == UserRole.ADMIN


def test_create_admin_validates_input(cli_db, capsys):
    assert cli.main(["create-admin", "--email", "not-an-email", "--password", "Op3ratorPass!"]) == 1
    assert cli.main(["create-admin", "--email", "x@example.com", "--password", "password123"]) == 1  # common
    assert "Invalid input" in capsys.readouterr().err


def test_seed_export_and_reprice_commands(cli_db, tmp_path, capsys):
    assert cli.main(["seed", "--count", "12"]) == 0
    with cli_db() as db:
        assert db.scalar(select(func.count()).select_from(Listing)) == 12
        assert db.scalar(select(func.count()).select_from(Auction)) == 4  # count // 3
    assert cli.main(["seed", "--count", "0"]) == 1

    out = tmp_path / "market.csv"
    assert cli.main(["export-training-data", "--out", str(out)]) == 0
    rows = list(csv.DictReader(out.open(encoding="utf-8")))
    assert len(rows) == 8  # live auctions have no market price yet
    assert set(rows[0]) == {"make", "model", "fuel_type", "transmission", "body_type", "condition",
                            "location", "year", "mileage", "price"}

    # No trained model in tests -> reprice is a clear no-op, not a crash.
    assert cli.main(["reprice-demo"]) == 0
    assert "No trained model" in capsys.readouterr().out
    assert cli.main(["seed-auctions", "--count", "9"]) == 1


def test_auction_worker_tick_uses_current_session_factory(session_factory, client, register_user):
    """The background worker opens its own sessions; make sure it sees the same DB."""
    from datetime import timedelta

    from app.core.security import utcnow
    from app.main import _run_auction_tick
    from tests.test_auctions import start_auction

    seller = register_user("seller@example.com", role="seller")
    auction_id = start_auction(client, seller)["auction"]["id"]
    with session_factory() as db:
        a = db.get(Auction, auction_id)
        a.start_time = utcnow() - timedelta(hours=2)
        a.end_time = a.original_end_time = utcnow() - timedelta(seconds=1)
        db.commit()
    assert _run_auction_tick() == {"opened": 0, "closed": 1}


def test_lockout_with_redis_store(monkeypatch):
    import fakeredis
    import redis

    from app.core import lockout
    from app.core.config import settings

    monkeypatch.setattr(redis.Redis, "from_url", classmethod(lambda cls, url, **kw: fakeredis.FakeRedis()))
    throttle = lockout.LoginThrottle(lockout.RedisStore("redis://fake"))
    for _ in range(settings.LOGIN_LOCKOUT_ATTEMPTS):
        assert throttle.retry_after("a@example.com", "1.2.3.4") == 0
        throttle.failed("a@example.com", "1.2.3.4")
    wait = throttle.retry_after("a@example.com", "1.2.3.4")
    assert 0 < wait <= settings.LOGIN_LOCKOUT_MINUTES * 60
    assert throttle.retry_after("a@example.com", "5.6.7.8") == 0  # other IP unaffected
    throttle.succeeded("a@example.com", "1.2.3.4")
    assert throttle.retry_after("a@example.com", "1.2.3.4") == 0
