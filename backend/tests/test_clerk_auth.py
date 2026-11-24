"""Clerk token verification and user lookup, without the conftest fakes.

Tokens are real RS256 JWTs signed with a test key; only the JWKS fetch and the Clerk
Backend API call are replaced, so signature, issuer, expiry and `azp` checks run for real."""
import base64
import io
import json
import time
import urllib.error
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app.core.config import settings
from app.services import clerk_auth
from app.services.auth_service import AuthError

FRONTEND_API = "carvypaar-test.clerk.accounts.dev"
PUBLISHABLE_KEY = "pk_test_" + base64.b64encode(f"{FRONTEND_API}$".encode()).decode().rstrip("=")
ISSUER = f"https://{FRONTEND_API}"
CLERK_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
ATTACKER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)

# conftest replaces these two for every test; keep the real ones for this module.
REAL_VERIFY = clerk_auth.verify_session_token
REAL_IDENTITY = clerk_auth.get_identity


@pytest.fixture(autouse=True)
def clerk_enabled(monkeypatch):
    monkeypatch.setattr(settings, "CLERK_PUBLISHABLE_KEY", PUBLISHABLE_KEY)
    monkeypatch.setattr(settings, "CLERK_SECRET_KEY", "sk_test_secret")
    fake_jwks = SimpleNamespace(get_signing_key_from_jwt=lambda token: SimpleNamespace(key=CLERK_KEY.public_key()))
    monkeypatch.setattr(clerk_auth, "_jwks_client", lambda issuer: fake_jwks)


def session_token(key=CLERK_KEY, **overrides) -> str:
    now = int(time.time())
    claims = {"iss": ISSUER, "sub": "user_2abc", "azp": "http://localhost:3000", "sid": "sess_1",
              "iat": now, "nbf": now, "exp": now + 60}
    claims.update(overrides)
    return jwt.encode({k: v for k, v in claims.items() if v is not None}, key, algorithm="RS256")


def test_issuer_from_publishable_key():
    assert clerk_auth.issuer_from_publishable_key(PUBLISHABLE_KEY) == ISSUER
    for bad in ("pk_test_", "nonsense", "pk_live_" + base64.b64encode(b"a b$").decode()):
        with pytest.raises(ValueError):
            clerk_auth.issuer_from_publishable_key(bad)


def test_valid_token_returns_clerk_user_id():
    assert REAL_VERIFY(session_token()) == "user_2abc"
    assert REAL_VERIFY(session_token(azp=None)) == "user_2abc"  # azp is optional


@pytest.mark.parametrize(
    "token",
    [
        session_token(key=ATTACKER_KEY),  # forged signature
        session_token(iss="https://someone-else.clerk.accounts.dev"),
        session_token(exp=int(time.time()) - 120),  # expired
        session_token(azp="https://evil.example"),  # minted for another site
        "not-a-jwt-at-all-but-long-enough",
    ],
)
def test_bad_tokens_rejected(token):
    with pytest.raises(AuthError) as exc:
        REAL_VERIFY(token)
    assert exc.value.status_code == 401


def test_not_configured_is_503(monkeypatch):
    monkeypatch.setattr(settings, "CLERK_SECRET_KEY", None)
    with pytest.raises(AuthError) as exc:
        REAL_VERIFY(session_token())
    assert exc.value.status_code == 503


def test_jwks_outage_is_503(monkeypatch):
    def boom(token):
        raise jwt.PyJWKClientConnectionError("down")

    monkeypatch.setattr(clerk_auth, "_jwks_client", lambda issuer: SimpleNamespace(get_signing_key_from_jwt=boom))
    with pytest.raises(AuthError) as exc:
        REAL_VERIFY(session_token())
    assert exc.value.status_code == 503


def clerk_user(**overrides):
    data = {
        "id": "user_2abc", "first_name": "Speed", "last_name": "Racer", "username": None,
        "has_image": True, "image_url": "https://img.clerk.com/photo",
        "primary_email_address_id": "idn_1",
        "email_addresses": [
            {"id": "idn_0", "email_address": "old@example.com", "verification": {"status": "verified"}},
            {"id": "idn_1", "email_address": "Speed.Racer@Example.com", "verification": {"status": "verified"}},
        ],
    }
    data.update(overrides)
    return data


def fake_urlopen(payload=None, error=None):
    def _open(req, timeout):
        assert req.full_url == "https://api.clerk.com/v1/users/user_2abc"
        assert req.get_header("Authorization") == "Bearer sk_test_secret"
        assert req.get_header("User-agent") == clerk_auth.USER_AGENT  # not Python's default (blocked)
        if error:
            raise error
        return io.BytesIO(json.dumps(payload).encode())

    return _open


def test_identity_uses_verified_primary_email(monkeypatch):
    monkeypatch.setattr(clerk_auth.urllib.request, "urlopen", fake_urlopen(clerk_user()))
    identity = REAL_IDENTITY("user_2abc")
    assert identity.email == "speed.racer@example.com"
    assert identity.name == "Speed Racer" and identity.picture == "https://img.clerk.com/photo"


def test_identity_falls_back_to_email_name(monkeypatch):
    monkeypatch.setattr(clerk_auth.urllib.request, "urlopen",
                        fake_urlopen(clerk_user(first_name=None, last_name=None, has_image=False)))
    identity = REAL_IDENTITY("user_2abc")
    assert identity.name == "speed.racer" and identity.picture is None


def test_unverified_email_rejected(monkeypatch):
    user = clerk_user()
    user["email_addresses"][1]["verification"]["status"] = "unverified"
    monkeypatch.setattr(clerk_auth.urllib.request, "urlopen", fake_urlopen(user))
    with pytest.raises(AuthError) as exc:
        REAL_IDENTITY("user_2abc")
    assert exc.value.status_code == 403


@pytest.mark.parametrize(
    ("error", "status"),
    [
        (urllib.error.HTTPError("u", 404, "Not Found", {}, None), 401),
        (urllib.error.HTTPError("u", 500, "Oops", {}, None), 503),
        (urllib.error.HTTPError("u", 403, "Forbidden", {}, io.BytesIO(b'{"errors":[{"code":"blocked"}]}')), 503),
        (urllib.error.URLError("no route"), 503),
    ],
)
def test_clerk_api_errors(monkeypatch, error, status):
    monkeypatch.setattr(clerk_auth.urllib.request, "urlopen", fake_urlopen(error=error))
    with pytest.raises(AuthError) as exc:
        REAL_IDENTITY("user_2abc")
    assert exc.value.status_code == status


def test_full_exchange_through_the_api(client, monkeypatch):
    """End to end: a signed Clerk token in, a CarvyPaar session out."""
    monkeypatch.setattr(clerk_auth, "verify_session_token", REAL_VERIFY)
    monkeypatch.setattr(clerk_auth, "get_identity", REAL_IDENTITY)
    monkeypatch.setattr(clerk_auth.urllib.request, "urlopen", fake_urlopen(clerk_user()))
    res = client.post("/api/auth/clerk", json={"token": session_token()})
    assert res.status_code == 200, res.text
    user = res.json()["user"]
    assert user["email"] == "speed.racer@example.com" and user["avatar_url"] == "https://img.clerk.com/photo"
