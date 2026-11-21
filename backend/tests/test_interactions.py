"""Offers, contact messages and notifications."""
import pytest

from app.seed import seed
from tests.conftest import auth_header
from tests.test_listings import create_car


@pytest.fixture()
def setup(client, register_user):
    seller = register_user("seller@example.com", role="seller")
    buyer = register_user("buyer@example.com", role="buyer")
    car = create_car(client, seller["access_token"])
    return seller, buyer, car


def test_offer_lifecycle_with_notifications(client, setup):
    seller, buyer, car = setup
    s, b = auth_header(seller["access_token"]), auth_header(buyer["access_token"])

    res = client.post(f"/api/listings/{car['id']}/offers", json={"amount": 5400000, "message": " Cash buyer "}, headers=b)
    assert res.status_code == 201, res.text
    offer = res.json()
    assert offer["status"] == "pending" and offer["message"] == "Cash buyer"

    notes = client.get("/api/notifications", headers=s).json()
    assert notes["unread_count"] == 1 and notes["items"][0]["type"] == "offer_received"

    received = client.get("/api/offers", params={"box": "received"}, headers=s).json()
    assert [o["id"] for o in received] == [offer["id"]]
    assert client.get("/api/offers", params={"box": "sent"}, headers=b).json()[0]["amount"] == 5400000.0

    # Buyer can't accept their own offer; seller can't withdraw it.
    assert client.patch(f"/api/offers/{offer['id']}", json={"status": "accepted"}, headers=b).status_code == 403
    assert client.patch(f"/api/offers/{offer['id']}", json={"status": "withdrawn"}, headers=s).status_code == 403

    ok = client.patch(f"/api/offers/{offer['id']}", json={"status": "accepted"}, headers=s)
    assert ok.status_code == 200 and ok.json()["status"] == "accepted"
    assert client.patch(f"/api/offers/{offer['id']}", json={"status": "rejected"}, headers=s).status_code == 409

    buyer_notes = client.get("/api/notifications", headers=b).json()
    assert buyer_notes["items"][0]["type"] == "offer_updated"
    assert "accepted" in buyer_notes["items"][0]["title"]


def test_new_offer_replaces_pending_one(client, setup):
    _, buyer, car = setup
    b = auth_header(buyer["access_token"])
    client.post(f"/api/listings/{car['id']}/offers", json={"amount": 5000000}, headers=b)
    client.post(f"/api/listings/{car['id']}/offers", json={"amount": 5200000}, headers=b)
    statuses = sorted(o["status"] for o in client.get("/api/offers", params={"box": "sent"}, headers=b).json())
    assert statuses == ["pending", "withdrawn"]


def test_offer_rules(client, setup, register_user):
    seller, buyer, car = setup
    s, b = auth_header(seller["access_token"]), auth_header(buyer["access_token"])
    assert client.post(f"/api/listings/{car['id']}/offers", json={"amount": 1}, headers=s).status_code == 403
    assert client.post(f"/api/listings/{car['id']}/offers", json={"amount": -5}, headers=b).status_code == 422
    stranger = auth_header(register_user("x@example.com")["access_token"])
    offer = client.post(f"/api/listings/{car['id']}/offers", json={"amount": 100}, headers=b).json()
    assert client.patch(f"/api/offers/{offer['id']}", json={"status": "rejected"}, headers=stranger).status_code == 404

    client.patch(f"/api/listings/{car['id']}", json={"status": "inactive"}, headers=s)
    assert client.post(f"/api/listings/{car['id']}/offers", json={"amount": 100}, headers=b).status_code == 404


def test_contact_seller_and_reply(client, setup):
    seller, buyer, car = setup
    s, b = auth_header(seller["access_token"]), auth_header(buyer["access_token"])

    assert client.post(f"/api/listings/{car['id']}/messages", json={"body": "   "}, headers=b).status_code == 422
    assert client.post(f"/api/listings/{car['id']}/messages", json={"body": "Hi"}, headers=s).status_code == 403

    msg = client.post(f"/api/listings/{car['id']}/messages", json={"body": "Is it still available?"}, headers=b).json()
    assert msg["recipient"]["id"] == seller["user"]["id"]
    assert client.get("/api/notifications", headers=s).json()["items"][0]["type"] == "message"

    reply = client.post(f"/api/messages/{msg['id']}/reply", json={"body": "Yes! Come by Saturday."}, headers=s)
    assert reply.status_code == 201 and reply.json()["recipient"]["id"] == buyer["user"]["id"]

    assert len(client.get("/api/messages", headers=b).json()) == 2
    assert client.post(f"/api/messages/{msg['id']}/read", headers=b).status_code == 404  # not the recipient
    assert client.post(f"/api/messages/{msg['id']}/read", headers=s).status_code == 204


def test_notifications_mark_read(client, setup):
    seller, buyer, car = setup
    s, b = auth_header(seller["access_token"]), auth_header(buyer["access_token"])
    for amount in (100, 200):
        client.post(f"/api/listings/{car['id']}/offers", json={"amount": amount}, headers=b)
    notes = client.get("/api/notifications", headers=s).json()
    assert notes["unread_count"] == 2
    assert client.post(f"/api/notifications/{notes['items'][0]['id']}/read", headers=s).status_code == 204
    assert client.get("/api/notifications", headers=s).json()["unread_count"] == 1
    # Other users can't touch my notifications.
    assert client.post(f"/api/notifications/{notes['items'][1]['id']}/read", headers=b).status_code == 404
    assert client.post("/api/notifications/read-all", headers=s).status_code == 204
    assert client.get("/api/notifications", params={"unread_only": True}, headers=s).json()["items"] == []


def test_seed_creates_searchable_listings(client, db_session):
    seed(db_session, count=10)
    res = client.get("/api/listings", params={"page_size": 48}).json()
    assert res["total"] == 10
    assert all(item["image_count"] >= 3 for item in res["items"])


def test_seed_auctions(client, db_session):
    from app.seed import seed_auctions

    seed(db_session, count=12)
    assert seed_auctions(db_session, 4) == 4
    live = client.get("/api/auctions", params={"tab": "live"}).json()
    assert live["total"] == 4  # the first four schedule slots are already running
    assert all(c["listing"]["auction_id"] == c["auction"]["id"] for c in live["items"])
