"""Auth flow tests: Clerk sign-in exchange, token refresh/rotation, logout."""
from datetime import timedelta

from sqlalchemy import select

from app.core.security import create_access_token, utcnow
from app.models import RefreshToken
from tests.conftest import auth_header, clerk_token


def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_security_headers_present(client):
    res = client.get("/api/health")
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"


def test_clerk_sign_in_creates_account_and_sets_cookie(client, db_session):
    res = client.post("/api/auth/clerk", json={"token": clerk_token("new@example.com")})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"] and body["refresh_token"]
    user = body["user"]
    assert user["email"] == "new@example.com" and user["role"] == "buyer" and user["is_verified"] is True
    assert "hashed_password" not in user
    set_cookie = res.headers["set-cookie"]
    assert "cv_refresh=" in set_cookie and "HttpOnly" in set_cookie and "Path=/api/auth" in set_cookie
    from app.models import User

    assert db_session.get(User, user["id"]).clerk_user_id == "user_new@example.com"
    # Signing in again finds the same account.
    again = client.post("/api/auth/clerk", json={"token": clerk_token("new@example.com")})
    assert again.json()["user"]["id"] == user["id"]


def test_clerk_sign_in_links_existing_account_by_email(client, register_user, db_session):
    seller = register_user("seller@example.com", role="seller")  # existing account, now linked
    assert seller["user"]["role"] == "seller"
    from app.models import User

    assert db_session.get(User, seller["user"]["id"]).clerk_user_id == "user_seller@example.com"


def test_clerk_sign_in_rejects_bad_token_and_other_linked_account(client, register_user, db_session, monkeypatch):
    assert client.post("/api/auth/clerk", json={"token": "not-a-clerk-token-at-all"}).status_code == 401
    assert client.post("/api/auth/clerk", json={"token": "short"}).status_code == 422
    data = register_user("taken@example.com")
    from app.models import User

    db_session.get(User, data["user"]["id"]).clerk_user_id = "user_someone-else"
    db_session.commit()
    from app.services import clerk_auth

    other = clerk_auth.ClerkIdentity(user_id="user_x", email="taken@example.com", name="X", picture=None)
    monkeypatch.setattr(clerk_auth, "get_identity", lambda _id: other)
    assert client.post("/api/auth/clerk", json={"token": clerk_token("x")}).status_code == 409


def test_inactive_user_cannot_sign_in(client, register_user, db_session):
    data = register_user("inactive@example.com")
    from app.models import User

    user = db_session.get(User, data["user"]["id"])
    user.is_active = False
    db_session.commit()
    res = client.post("/api/auth/clerk", json={"token": clerk_token("inactive@example.com")})
    assert res.status_code == 403


def test_old_password_endpoints_are_gone(client):
    for path in ("/api/auth/login", "/api/auth/register", "/api/auth/google"):
        assert client.post(path, json={}).status_code in (404, 405)


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
