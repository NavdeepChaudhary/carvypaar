"""Google sign-in. Tokens are real RS256 JWTs signed with a test key; only the JWKS
lookup is replaced, so signature, audience, issuer, expiry and email checks all run for real."""
import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import select

from app.core.config import settings
from app.models import User
from app.services import google_auth
from tests.conftest import DEFAULT_PASSWORD, auth_header

CLIENT_ID = "1234567890-test.apps.googleusercontent.com"
GOOGLE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
ATTACKER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(autouse=True)
def google_enabled(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", CLIENT_ID)
    fake_jwks = SimpleNamespace(get_signing_key_from_jwt=lambda token: SimpleNamespace(key=GOOGLE_KEY.public_key()))
    monkeypatch.setattr(google_auth, "_jwks_client", lambda: fake_jwks)


def google_token(key=GOOGLE_KEY, **overrides) -> str:
    now = int(time.time())
    claims = {
        "iss": "https://accounts.google.com", "aud": CLIENT_ID, "sub": "google-uid-1",
        "email": "Speed.Racer@gmail.com", "email_verified": True, "name": "Speed Racer",
        "picture": "https://lh3.googleusercontent.com/a/photo", "iat": now, "exp": now + 3600,
    }
    claims.update(overrides)
    return jwt.encode({k: v for k, v in claims.items() if v is not None}, key, algorithm="RS256")


def sign_in(client, token):
    return client.post("/api/auth/google", json={"credential": token})


def test_providers_endpoint(client, monkeypatch):
    assert client.get("/api/auth/providers").json() == {"google_client_id": CLIENT_ID}
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", None)
    assert client.get("/api/auth/providers").json() == {"google_client_id": None}
    assert sign_in(client, google_token()).status_code == 503


def test_first_sign_in_creates_account(client, db_session):
    res = sign_in(client, google_token())
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["access_token"] and "cv_refresh=" in res.headers["set-cookie"]
    user = body["user"]
    assert user["email"] == "speed.racer@gmail.com" and user["full_name"] == "Speed Racer"
    assert user["role"] == "buyer" and user["is_verified"] is True
    assert user["has_google"] is True and user["has_password"] is False
    # The session works like any other.
    assert client.get("/api/users/me", headers=auth_header(body["access_token"])).json()["id"] == user["id"]
    # Signing in again finds the same account (by Google's stable `sub`).
    again = sign_in(client, google_token(email="renamed@gmail.com"))
    assert again.json()["user"]["id"] == user["id"]
    assert db_session.scalar(select(User).where(User.google_sub == "google-uid-1")).email == "speed.racer@gmail.com"


def test_links_existing_password_account_by_verified_email(client, register_user):
    existing = register_user("speed.racer@gmail.com", role="seller")
    res = sign_in(client, google_token())
    assert res.status_code == 200
    user = res.json()["user"]
    assert user["id"] == existing["user"]["id"] and user["role"] == "seller"
    assert user["has_password"] is True and user["has_google"] is True
    # Password login keeps working too.
    assert client.post("/api/auth/login", json={"email": "speed.racer@gmail.com", "password": DEFAULT_PASSWORD}).status_code == 200


def test_email_already_linked_to_other_google_account(client):
    sign_in(client, google_token(sub="google-uid-1"))
    res = sign_in(client, google_token(sub="google-uid-2"))  # same email, different Google account
    assert res.status_code == 409


@pytest.mark.parametrize("bad", [
    {"key": ATTACKER_KEY},                        # forged signature
    {"aud": "someone-elses-client-id"},           # token minted for another app
    {"iss": "https://evil.example"},              # not Google
    {"exp": int(time.time()) - 120},              # expired
    {"sub": None},                                # required claim missing
])
def test_rejects_invalid_tokens(client, bad):
    key = bad.pop("key", GOOGLE_KEY)
    assert sign_in(client, google_token(key=key, **bad)).status_code == 401


def test_rejects_unverified_email(client):
    assert sign_in(client, google_token(email_verified=False)).status_code == 403


def test_rejects_garbage_and_alg_none(client):
    assert sign_in(client, "x" * 50).status_code == 401
    unsigned = jwt.encode({"iss": "accounts.google.com", "aud": CLIENT_ID, "sub": "1", "email": "a@b.co",
                           "email_verified": True, "iat": int(time.time()), "exp": int(time.time()) + 60}, None, algorithm="none")
    assert sign_in(client, unsigned).status_code == 401


def test_deactivated_user_cannot_sign_in_with_google(client, db_session):
    uid = sign_in(client, google_token()).json()["user"]["id"]
    user = db_session.get(User, uid)
    user.is_active = False
    db_session.commit()
    assert sign_in(client, google_token()).status_code == 403


def test_google_only_account_password_rules(client):
    body = sign_in(client, google_token()).json()
    # No password yet: password login fails with the generic message.
    res = client.post("/api/auth/login", json={"email": "speed.racer@gmail.com", "password": "Whatever123"})
    assert res.status_code == 401 and res.json()["detail"] == "Incorrect email or password"
    # They can set a first password without a "current" one...
    headers = auth_header(body["access_token"])
    assert client.post("/api/users/me/password", json={"new_password": "Gr1dStart!"}, headers=headers).status_code == 204
    # ...after which password login works, and changing it needs the current password.
    login = client.post("/api/auth/login", json={"email": "speed.racer@gmail.com", "password": "Gr1dStart!"})
    assert login.status_code == 200 and login.json()["user"]["has_password"] is True
    new_headers = auth_header(login.json()["access_token"])
    assert client.post("/api/users/me/password", json={"new_password": "An0therOne!"}, headers=new_headers).status_code == 400
