"""Profile and password-change tests, plus storage path-safety tests."""
import pytest

from app.services.storage import LocalStorage
from tests.conftest import DEFAULT_PASSWORD, auth_header


def test_update_profile(client, register_user):
    tokens = register_user()
    res = client.patch(
        "/api/users/me",
        headers=auth_header(tokens["access_token"]),
        json={"full_name": "  Speed Racer  ", "phone": "+91 98765 43210", "location": "Pune", "bio": ""},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["full_name"] == "Speed Racer"
    assert body["phone"] == "+91 98765 43210"
    assert body["location"] == "Pune"
    assert body["bio"] is None


def test_update_profile_validation(client, register_user):
    tokens = register_user()
    headers = auth_header(tokens["access_token"])
    assert client.patch("/api/users/me", headers=headers, json={"phone": "call-me"}).status_code == 422
    assert client.patch("/api/users/me", headers=headers, json={"full_name": ""}).status_code == 422


def test_profile_update_cannot_escalate_role(client, register_user):
    tokens = register_user()
    res = client.patch("/api/users/me", headers=auth_header(tokens["access_token"]), json={"role": "admin"})
    assert res.status_code == 200
    assert res.json()["role"] == "buyer"  # unknown fields are ignored


def test_change_password_revokes_sessions(client, register_user):
    tokens = register_user("pw@example.com")
    headers = auth_header(tokens["access_token"])

    bad = client.post("/api/users/me/password", headers=headers,
                      json={"current_password": "nope", "new_password": "N3wPassword!"})
    assert bad.status_code == 400

    ok = client.post("/api/users/me/password", headers=headers,
                     json={"current_password": DEFAULT_PASSWORD, "new_password": "N3wPassword!"})
    assert ok.status_code == 204
    # Old refresh token is revoked; new password works; old one doesn't.
    assert client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "pw@example.com", "password": "N3wPassword!"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "pw@example.com", "password": DEFAULT_PASSWORD}).status_code == 401


def test_public_profile_hides_private_fields(client, register_user):
    tokens = register_user(phone="+1 555 123 4567")
    res = client.get(f"/api/users/{tokens['user']['id']}")
    assert res.status_code == 200
    body = res.json()
    assert "email" not in body and "phone" not in body
    assert client.get("/api/users/424242").status_code == 404


def test_buyer_can_become_seller_and_then_list(client, register_user):
    tokens = register_user("upgrade@example.com", role="buyer")
    headers = auth_header(tokens["access_token"])
    res = client.post("/api/users/me/become-seller", headers=headers)
    assert res.status_code == 200 and res.json()["role"] == "seller"
    # The old access token still says "buyer", but roles are read from the DB.
    from tests.test_listings import CAR

    assert client.post("/api/listings", json=CAR, headers=headers).status_code == 201


def test_local_storage_roundtrip_and_traversal(tmp_path):
    storage = LocalStorage(tmp_path, "http://localhost:8000")
    stored = storage.save(b"img", extension="jpg", folder="listings")
    assert (tmp_path / stored.key).read_bytes() == b"img"
    assert stored.url.startswith("http://localhost:8000/uploads/listings/")
    storage.delete(stored.key)
    assert not (tmp_path / stored.key).exists()

    storage.delete("../../outside.txt")  # silently ignored, never escapes root
    with pytest.raises(ValueError):
        storage.save(b"x", extension="../sh")
