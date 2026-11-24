"""Security hardening: headers, body limits, JWT claims,
password policy, production config guards, input bounds, Redis fan-out."""
import asyncio
from datetime import timedelta
from io import BytesIO

import jwt
import pytest
from PIL import Image
from pydantic import ValidationError

from app.core.config import Settings, settings
from app.core.security import create_access_token, utcnow
from tests.conftest import auth_header
from tests.test_listings import create_car


# ---------------------------------------------------------------- headers
def test_api_security_headers(client):
    res = client.get("/api/health")
    h = res.headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert "default-src 'none'" in h["content-security-policy"]
    assert h["cross-origin-opener-policy"] == "same-origin"
    assert h["cache-control"] == "no-store"
    assert len(h["x-request-id"]) == 32
    assert "strict-transport-security" not in h  # only in production


def test_request_id_is_propagated_only_if_well_formed(client):
    assert client.get("/api/health", headers={"X-Request-ID": "proxy-req-12345"}).headers["x-request-id"] == "proxy-req-12345"
    evil = client.get("/api/health", headers={"X-Request-ID": "bad id\r\nX-Injected: 1"}).headers["x-request-id"]
    assert evil != "bad id\r\nX-Injected: 1" and len(evil) == 32


def test_uploaded_files_are_sandboxed(client, register_user):
    seller = register_user("s@example.com", role="seller")
    car = create_car(client, seller["access_token"])
    buf = BytesIO()
    Image.new("RGB", (400, 300), (1, 2, 3)).save(buf, format="PNG")
    url = client.post(f"/api/listings/{car['id']}/images", files=[("files", ("a.png", buf.getvalue(), "image/png"))],
                      headers=auth_header(seller["access_token"])).json()[0]["url"]
    res = client.get(url.replace("http://localhost:8000", ""))
    assert res.status_code == 200 and res.headers["content-type"] == "image/webp"
    assert "sandbox" in res.headers["content-security-policy"]
    assert res.headers["cross-origin-resource-policy"] == "cross-origin"


def test_cors_rejects_unknown_origin(client):
    res = client.options("/api/auth/refresh", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in res.headers


# ---------------------------------------------------------------- body size
def test_oversized_json_body_rejected_before_parsing(client):
    huge = "x" * (settings.MAX_JSON_BODY_KB * 1024 + 10)
    res = client.post("/api/auth/clerk", content=f'{{"token":"{huge}"}}',
                      headers={"Content-Type": "application/json"})
    assert res.status_code == 413
    assert res.headers["x-content-type-options"] == "nosniff"  # headers still applied to the 413


def test_chunked_body_without_length_still_limited(client):
    def gen():
        for _ in range(settings.MAX_JSON_BODY_KB + 5):
            yield b"x" * 1024

    res = client.post("/api/auth/clerk", content=gen(), headers={"Content-Type": "application/json"})
    assert res.status_code == 413


def test_upload_route_allows_larger_bodies(client, register_user):
    seller = register_user("s@example.com", role="seller")
    car = create_car(client, seller["access_token"])
    payload = b"0" * (settings.MAX_JSON_BODY_KB * 1024 * 2)  # too big for JSON routes, fine for uploads
    res = client.post(f"/api/listings/{car['id']}/images", files=[("files", ("a.png", payload, "image/png"))],
                      headers=auth_header(seller["access_token"]))
    assert res.status_code == 422  # reached the image validator (not a valid PNG), not a 413


# ---------------------------------------------------------------- JWT
def test_tokens_from_other_issuers_or_audiences_rejected(client, register_user):
    user = register_user()
    claims = jwt.decode(user["access_token"], options={"verify_signature": False})
    assert claims["iss"] == settings.JWT_ISSUER and claims["aud"] == settings.JWT_AUDIENCE
    for override in ({"iss": "someone-else"}, {"aud": "other-app"}):
        forged = jwt.encode({**claims, **override}, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
        assert client.get("/api/users/me", headers=auth_header(forged)).status_code == 401


def test_alg_none_and_wrong_key_rejected(client, register_user):
    user = register_user()
    claims = jwt.decode(user["access_token"], options={"verify_signature": False})
    unsigned = jwt.encode(claims, key=None, algorithm="none")
    wrong_key = jwt.encode(claims, "not-the-real-secret-but-long-enough-0123456789", algorithm="HS256")
    for token in (unsigned, wrong_key):
        assert client.get("/api/users/me", headers=auth_header(token)).status_code == 401


def test_expired_token_rejected(client, register_user, monkeypatch):
    user = register_user()
    monkeypatch.setattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", -5)
    token, _ = create_access_token(user["user"]["id"], "buyer")
    assert client.get("/api/users/me", headers=auth_header(token)).status_code == 401


# ---------------------------------------------------------------- password policy
@pytest.mark.parametrize("pw", ["Password123", "qwerty123", "Carvypaar1"])
def test_common_passwords_rejected(pw):
    # Still enforced for admin accounts made with `python -m app.cli create-admin`.
    from app.schemas.auth import RegisterRequest

    with pytest.raises(ValidationError, match="too common"):
        RegisterRequest(email="c@example.com", password=pw, full_name="Common")


# ---------------------------------------------------------------- production guards
PROD = {"ENVIRONMENT": "production", "SECRET_KEY": "s" * 48, "COOKIE_SECURE": True,
        "CORS_ORIGINS": "https://carvypaar.example", "DATABASE_URL": "postgresql+psycopg://u:p@db/x"}


def test_production_settings_accept_safe_config():
    assert Settings(**PROD).is_production


@pytest.mark.parametrize("override", [
    {"SECRET_KEY": "short"},
    {"COOKIE_SECURE": False},
    {"CORS_ORIGINS": "http://carvypaar.example"},
    {"CORS_ORIGINS": "*"},
    {"DATABASE_URL": "sqlite:///./prod.db"},
])
def test_production_settings_refuse_unsafe_config(override):
    with pytest.raises(ValidationError):
        Settings(**{**PROD, **override})


# ---------------------------------------------------------------- input bounds
def test_auction_cannot_be_scheduled_absurdly_far_ahead(client, register_user):
    seller = register_user("s@example.com", role="seller")
    car = create_car(client, seller["access_token"])
    start = utcnow() + timedelta(days=200)
    res = client.post(f"/api/listings/{car['id']}/auction", headers=auth_header(seller["access_token"]), json={
        "starting_price": 100000, "bid_increment": 1000,
        "start_time": start.isoformat(), "end_time": (start + timedelta(days=1)).isoformat()})
    assert res.status_code == 422


@pytest.mark.parametrize("params", [{"page_size": 10_000}, {"page": 0}, {"q": "x" * 500}])
def test_pagination_and_search_bounds(client, params):
    assert client.get("/api/listings", params=params).status_code == 422


# ---------------------------------------------------------------- Redis fan-out
def test_realtime_fanout_across_workers_via_redis():
    """Two hubs (= two API workers) share one Redis: an event published on worker A
    reaches a socket connected to worker B, exactly once."""
    import fakeredis

    from app.realtime import RealtimeHub

    class FakeSocket:
        def __init__(self) -> None:
            self.sent: list[dict] = []

        async def send_json(self, message: dict) -> None:
            self.sent.append(message)

    async def scenario() -> tuple[list[dict], list[dict]]:
        server = fakeredis.FakeServer()
        worker_a, worker_b = RealtimeHub(), RealtimeHub()
        loop = asyncio.get_running_loop()
        for hub in (worker_a, worker_b):
            hub.bind_loop(loop)
            await hub.start_redis(client=fakeredis.aioredis.FakeRedis(server=server))
        watcher_on_b, user_on_a = FakeSocket(), FakeSocket()
        worker_b.join_auction(7, watcher_on_b)  # type: ignore[arg-type]
        worker_a.join_user(42, user_on_a)  # type: ignore[arg-type]

        worker_a.publish_auction(7, {"type": "bid", "amount": 1})
        worker_b.publish_user(42, {"type": "notification"})
        for _ in range(50):
            await asyncio.sleep(0.02)
            if watcher_on_b.sent and user_on_a.sent:
                break
        await asyncio.sleep(0.1)  # allow any (wrong) duplicate to arrive
        for hub in (worker_a, worker_b):
            await hub.stop_redis()
        return watcher_on_b.sent, user_on_a.sent

    auction_events, user_events = asyncio.run(scenario())
    assert auction_events == [{"type": "bid", "amount": 1}]
    assert user_events == [{"type": "notification"}]
