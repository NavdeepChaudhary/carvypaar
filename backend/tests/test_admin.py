"""Admin dashboard: access control, moderation, user management, auctions, stats."""
from datetime import timedelta

import pytest

from app.core.config import settings
from app.core.security import hash_password, utcnow
from app.models import User, UserRole
from tests.conftest import auth_header
from tests.test_auctions import bid, start_auction
from tests.test_listings import create_car


@pytest.fixture()
def admin(client, db_session):
    db_session.add(User(email="boss@example.com", full_name="Boss Admin", role=UserRole.ADMIN,
                        hashed_password=hash_password("Adm1nPass!")))
    db_session.commit()
    return client.post("/api/auth/login", json={"email": "boss@example.com", "password": "Adm1nPass!"}).json()


@pytest.fixture()
def approval_on(monkeypatch):
    monkeypatch.setattr(settings, "REQUIRE_LISTING_APPROVAL", True)


def h(person):
    return auth_header(person["access_token"])


@pytest.mark.parametrize("path", ["/api/admin/stats", "/api/admin/listings", "/api/admin/users", "/api/admin/auctions"])
def test_admin_routes_require_admin(client, register_user, path):
    assert client.get(path).status_code == 401
    seller = register_user("s@example.com", role="seller")
    assert client.get(path, headers=h(seller)).status_code == 403


def test_review_queue_approve_and_reject(client, register_user, admin, approval_on):
    seller = register_user("seller@example.com", role="seller")
    first = create_car(client, seller["access_token"], title="First car in the queue")
    second = create_car(client, seller["access_token"], title="Second car in the queue")
    assert first["status"] == "pending"
    assert client.get("/api/listings").json()["total"] == 0  # nothing public yet

    queue = client.get("/api/admin/listings", headers=h(admin)).json()
    assert [r["listing"]["id"] for r in queue["items"]] == [first["id"], second["id"]]  # oldest first
    assert queue["items"][0]["seller_email"] == "seller@example.com"

    ok = client.post(f"/api/admin/listings/{first['id']}/approve", headers=h(admin))
    assert ok.status_code == 200 and ok.json()["status"] == "active"
    assert client.post(f"/api/admin/listings/{first['id']}/approve", headers=h(admin)).status_code == 409
    assert client.get("/api/listings").json()["total"] == 1

    assert client.post(f"/api/admin/listings/{second['id']}/reject", json={"reason": "x"}, headers=h(admin)).status_code == 422
    rej = client.post(f"/api/admin/listings/{second['id']}/reject", json={"reason": "Photos are blurry"}, headers=h(admin))
    assert rej.json()["status"] == "rejected"

    notes = client.get("/api/notifications", headers=h(seller)).json()["items"]
    assert {n["type"] for n in notes} == {"listing_approved", "listing_rejected"}
    assert "Photos are blurry" in next(n for n in notes if n["type"] == "listing_rejected")["body"]

    # Editing a rejected listing resubmits it for review.
    client.patch(f"/api/listings/{second['id']}", json={"description": "New sharp photos"}, headers=h(seller))
    assert client.get("/api/admin/listings", headers=h(admin)).json()["items"][0]["listing"]["id"] == second["id"]


def test_admin_listings_filter_and_search(client, register_user, admin):
    seller = register_user("seller@example.com", role="seller")
    create_car(client, seller["access_token"], make="Tata", model="Nexon", title="Tata Nexon EV for sale")
    create_car(client, seller["access_token"])
    rows = client.get("/api/admin/listings", params={"status": "all", "q": "nexon"}, headers=h(admin)).json()
    assert rows["total"] == 1
    assert client.get("/api/admin/listings", params={"status": "active", "q": "seller@"}, headers=h(admin)).json()["total"] == 2


def test_admin_removes_listing(client, register_user, admin):
    seller = register_user("seller@example.com", role="seller")
    car = create_car(client, seller["access_token"])
    assert client.delete(f"/api/admin/listings/{car['id']}", headers=h(admin)).status_code == 204
    assert client.get(f"/api/listings/{car['id']}").status_code == 404


def test_admin_own_listings_skip_review(client, admin, approval_on):
    assert create_car(client, admin["access_token"])["status"] == "active"


def test_manage_users(client, register_user, admin):
    buyer = register_user("buyer@example.com")
    uid = buyer["user"]["id"]
    rows = client.get("/api/admin/users", params={"q": "buyer@"}, headers=h(admin)).json()
    assert rows["total"] == 1 and rows["items"][0]["user"]["role"] == "buyer"

    res = client.patch(f"/api/admin/users/{uid}", json={"role": "seller"}, headers=h(admin))
    assert res.status_code == 200 and res.json()["user"]["role"] == "seller"

    # Deactivating signs them out everywhere and blocks login.
    assert client.patch(f"/api/admin/users/{uid}", json={"is_active": False}, headers=h(admin)).json()["user"]["is_active"] is False
    assert client.post("/api/auth/refresh", json={"refresh_token": buyer["refresh_token"]}).status_code == 401
    assert client.get("/api/users/me", headers=h(buyer)).status_code == 401
    assert client.get("/api/admin/users", params={"active": False}, headers=h(admin)).json()["total"] == 1


def test_admin_cannot_lock_themselves_out(client, admin):
    me = admin["user"]["id"]
    assert client.patch(f"/api/admin/users/{me}", json={"is_active": False}, headers=h(admin)).status_code == 409
    assert client.patch(f"/api/admin/users/{me}", json={"role": "buyer"}, headers=h(admin)).status_code == 409


def test_admin_can_demote_another_admin(client, admin, db_session):
    other = User(email="second@example.com", full_name="Second Admin", role=UserRole.ADMIN, hashed_password="x")
    db_session.add(other)
    db_session.commit()
    res = client.patch(f"/api/admin/users/{other.id}", json={"role": "seller"}, headers=h(admin))
    assert res.status_code == 200 and res.json()["user"]["role"] == "seller"


def test_admin_auctions_and_cancel_with_bids(client, register_user, admin):
    seller = register_user("seller@example.com", role="seller")
    buyer = register_user("buyer@example.com")
    auction_id = start_auction(client, seller)["auction"]["id"]
    bid(client, buyer, auction_id, 1_000_000)

    rows = client.get("/api/admin/auctions", params={"status": "live"}, headers=h(admin)).json()
    assert rows["total"] == 1 and rows["items"][0]["auction"]["bid_count"] == 1
    assert "reserve_price" not in rows["items"][0]["auction"]

    # Sellers can't cancel with bids; admins can (bidders are told).
    assert client.post(f"/api/auctions/{auction_id}/cancel", headers=h(seller)).status_code == 409
    res = client.post(f"/api/admin/auctions/{auction_id}/cancel", headers=h(admin))
    assert res.status_code == 200 and res.json()["status"] == "cancelled"
    assert client.get("/api/notifications", headers=h(buyer)).json()["items"][0]["type"] == "auction_ended"


def test_stats(client, register_user, admin, db_session):
    seller = register_user("seller@example.com", role="seller")
    buyer = register_user("buyer@example.com")
    create_car(client, seller["access_token"], make="Tata", model="Nexon", title="Tata Nexon for sale")
    sold = create_car(client, seller["access_token"], price=900_000)
    client.patch(f"/api/listings/{sold['id']}", json={"status": "sold"}, headers=h(seller))
    auction_id = start_auction(client, seller)["auction"]["id"]
    bid(client, buyer, auction_id, 1_000_000)

    s = client.get("/api/admin/stats", headers=h(admin)).json()
    assert s["users_total"] == 3 and s["users_by_role"] == {"admin": 1, "seller": 1, "buyer": 1}
    assert s["users_new_7d"] == 3 and s["users_new_prev_7d"] == 0
    assert s["listings_by_status"] == {"active": 2, "sold": 1}
    assert s["bids_total"] == 1 and s["gmv"] == 900_000.0
    assert len(s["daily"]) == 14
    today = utcnow().date().isoformat()
    assert s["daily"][-1]["date"] == today
    assert s["daily"][-1] == {"date": today, "listings": 3, "users": 3, "bids": 1}
    assert sum(d["listings"] for d in s["daily"][:-1]) == 0
    assert {m["label"] for m in s["top_makes"]} == {"BMW", "Tata"}

    pub = client.get("/api/stats").json()
    assert pub == {"active_listings": 2, "live_auctions": 1, "auctions_closed": 0, "members": 3}
    assert (utcnow() - timedelta(days=1)).date().isoformat() == s["daily"][-2]["date"]
