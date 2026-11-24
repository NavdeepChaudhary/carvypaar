"""Auth flow tests: registration, login, token refresh/rotation, logout."""
from datetime import timedelta

from sqlalchemy import select

from app.core.security import create_access_token, utcnow
from app.models import RefreshToken
from tests.conftest import DEFAULT_PASSWORD, auth_header


def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_security_headers_present(client):
    res = client.get("/api/health")
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"


def test_register_returns_tokens_and_sets_cookie(client):
    res = client.post(
        "/api/auth/register",
        json={"email": "New@Example.com", "password": DEFAULT_PASSWORD, "full_name": "New Driver", "role": "seller"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"] and body["refresh_token"]
    assert body["user"]["email"] == "new@example.com"  # normalised
    assert body["user"]["role"] == "seller"
    assert "hashed_password" not in body["user"]
    set_cookie = res.headers["set-cookie"]
    assert "cv_refresh=" in set_cookie and "HttpOnly" in set_cookie and "Path=/api/auth" in set_cookie


def test_register_duplicate_email_conflicts(client, register_user):
    register_user("dup@example.com")
    res = client.post(
        "/api/auth/register",
        json={"email": "DUP@example.com", "password": DEFAULT_PASSWORD, "full_name": "Again"},
    )
    assert res.status_code == 409


def test_cannot_self_register_as_admin(client):
    res = client.post(
        "/api/auth/register",
        json={"email": "evil@example.com", "password": DEFAULT_PASSWORD, "full_name": "Evil", "role": "admin"},
    )
    assert res.status_code == 422


def test_weak_password_rejected(client):
    for bad in ["short1", "allletters", "12345678", "a1" * 40]:
        res = client.post(
            "/api/auth/register", json={"email": "weak@example.com", "password": bad, "full_name": "Weak"}
        )
        assert res.status_code == 422, bad


def test_login_success_and_failure(client, register_user):
    register_user("login@example.com")
    ok = client.post("/api/auth/login", json={"email": "login@example.com", "password": DEFAULT_PASSWORD})
    assert ok.status_code == 200
    assert ok.json()["user"]["email"] == "login@example.com"

    wrong = client.post("/api/auth/login", json={"email": "login@example.com", "password": "Wrong1234"})
    assert wrong.status_code == 401
    missing = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "Wrong1234"})
    assert missing.status_code == 401
    # Same message for both, so emails can't be enumerated.
    assert wrong.json()["detail"] == missing.json()["detail"]


def test_inactive_user_cannot_login(client, register_user, db_session):
    data = register_user("inactive@example.com")
    from app.models import User

    user = db_session.get(User, data["user"]["id"])
    user.is_active = False
    db_session.commit()
    res = client.post("/api/auth/login", json={"email": "inactive@example.com", "password": DEFAULT_PASSWORD})
    assert res.status_code == 403


def test_protected_route_requires_valid_token(client, register_user):
    tokens = register_user()
    assert client.get("/api/users/me").status_code == 401
    assert client.get("/api/users/me", headers=auth_header("garbage")).status_code == 401
    # A refresh token must not be accepted as an access token.
    assert client.get("/api/users/me", headers=auth_header(tokens["refresh_token"])).status_code == 401
    res = client.get("/api/users/me", headers=auth_header(tokens["access_token"]))
    assert res.status_code == 200
    assert res.json()["email"] == "driver@example.com"


def test_access_token_for_deleted_user_rejected(client):
    token, _ = create_access_token(user_id=9999, role="buyer")
    assert client.get("/api/users/me", headers=auth_header(token)).status_code == 401


def test_refresh_rotates_token_via_body(client, register_user):
    tokens = register_user()
    res = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert res.status_code == 200
    new = res.json()
    assert new["refresh_token"] != tokens["refresh_token"]
    # Old token is now revoked (inside grace window -> 401 but no family revocation).
    again = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert again.status_code == 401
    # New token still works.
    assert client.post("/api/auth/refresh", json={"refresh_token": new["refresh_token"]}).status_code == 200


def test_refresh_via_cookie(client, register_user):
    register_user()  # TestClient stores the httpOnly cookie
    res = client.post("/api/auth/refresh")
    assert res.status_code == 200
    assert res.json()["access_token"]


def test_refresh_token_reuse_revokes_all_sessions(client, register_user, db_session):
    tokens = register_user()
    rotated = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).json()

    # Simulate the stolen old token being replayed long after rotation.
    old_jti_row = db_session.scalars(select(RefreshToken).where(RefreshToken.revoked_at.is_not(None))).first()
    old_jti_row.revoked_at = utcnow() - timedelta(minutes=5)
    db_session.commit()

    replay = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert replay.status_code == 401
    # Every session in the family is now dead, including the legitimately rotated one.
    res = client.post("/api/auth/refresh", json={"refresh_token": rotated["refresh_token"]})
    assert res.status_code == 401


def test_refresh_rejects_access_token(client, register_user):
    tokens = register_user()
    res = client.post("/api/auth/refresh", json={"refresh_token": tokens["access_token"]})
    assert res.status_code == 401


def test_logout_revokes_refresh_token(client, register_user):
    tokens = register_user()
    res = client.post("/api/auth/logout", json={"refresh_token": tokens["refresh_token"]})
    assert res.status_code == 204
    assert client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401
