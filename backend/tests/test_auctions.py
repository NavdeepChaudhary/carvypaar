"""Auctions: creation, bidding rules, anti-sniping, closing, WebSockets, concurrency."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.core.security import utcnow
from app.models import Auction, Listing
from app.services import auction_service
from tests.conftest import auth_header
from tests.test_listings import create_car


def iso(dt) -> str:
    return dt.isoformat()


@pytest.fixture()
def people(register_user):
    return {
        "seller": register_user("seller@example.com", role="seller"),
        "alice": register_user("alice@example.com", full_name="Alice Kapoor"),
        "bob": register_user("bob@example.com", full_name="Bob Mehta"),
    }


def h(person) -> dict[str, str]:
    return auth_header(person["access_token"])


def start_auction(client, seller, *, starting=1_000_000, increment=10_000, reserve=None, minutes=60, start_in=None):
    car = create_car(client, seller["access_token"])
    now = utcnow()
    body = {"starting_price": starting, "bid_increment": increment, "end_time": iso(now + timedelta(minutes=minutes))}
    if reserve is not None:
        body["reserve_price"] = reserve
    if start_in is not None:
        body["start_time"] = iso(now + timedelta(minutes=start_in))
        body["end_time"] = iso(now + timedelta(minutes=start_in + minutes))
    res = client.post(f"/api/listings/{car['id']}/auction", json=body, headers=h(seller))
    assert res.status_code == 201, res.text
    return res.json()


def bid(client, person, auction_id, amount):
    return client.post(f"/api/auctions/{auction_id}/bids", json={"amount": amount}, headers=h(person))


def set_times(db, auction_id, *, end_in_seconds=None, start_in_seconds=None):
    a = db.get(Auction, auction_id)
    now = utcnow()
    if start_in_seconds is not None:
        a.start_time = now + timedelta(seconds=start_in_seconds)
    if end_in_seconds is not None:
        a.end_time = now + timedelta(seconds=end_in_seconds)
        a.original_end_time = a.end_time
        if start_in_seconds is None:  # keep the DB invariant end_time > start_time
            a.start_time = a.end_time - timedelta(hours=1)
    db.commit()


# ---------------------------------------------------------------- creation
def test_create_auction(client, people):
    detail = start_auction(client, people["seller"], reserve=1_500_000)
    a = detail["auction"]
    assert a["status"] == "live"
    assert a["min_next_bid"] == 1_000_000.0
    assert a["has_reserve"] is True and a["reserve_met"] is False
    assert "reserve_price" not in a  # never leaked
    assert detail["listing"]["listing_type"] == "auction"
    assert detail["listing"]["auction_id"] == a["id"]
    assert detail["is_seller"] is True
    assert a["end_time"].endswith("+00:00")  # explicit UTC for browsers


def test_create_auction_validation(client, people):
    seller = people["seller"]
    car = create_car(client, seller["access_token"])
    url = f"/api/listings/{car['id']}/auction"
    now = utcnow()
    base = {"starting_price": 100000, "bid_increment": 1000, "end_time": iso(now + timedelta(hours=1))}

    assert client.post(url, json={**base, "reserve_price": 50000}, headers=h(seller)).status_code == 422
    assert client.post(url, json={**base, "end_time": iso(now + timedelta(minutes=5))}, headers=h(seller)).status_code == 422
    assert client.post(url, json={**base, "end_time": iso(now + timedelta(days=40))}, headers=h(seller)).status_code == 422
    assert client.post(url, json={**base, "start_time": iso(now - timedelta(hours=1))}, headers=h(seller)).status_code == 422
    assert client.post(url, json={**base, "bid_increment": 0}, headers=h(seller)).status_code == 422
    # Not the owner / not a seller.
    assert client.post(url, json=base, headers=h(people["alice"])).status_code == 403
    # Only one auction per listing.
    assert client.post(url, json=base, headers=h(seller)).status_code == 201
    assert client.post(url, json=base, headers=h(seller)).status_code == 409


def test_auction_withdraws_pending_offers(client, people, db_session):
    seller, alice = people["seller"], people["alice"]
    car = create_car(client, seller["access_token"])
    client.post(f"/api/listings/{car['id']}/offers", json={"amount": 900000}, headers=h(alice))
    client.post(f"/api/listings/{car['id']}/auction", headers=h(seller), json={
        "starting_price": 500000, "bid_increment": 5000, "end_time": iso(utcnow() + timedelta(hours=1))})
    offers = client.get("/api/offers", params={"box": "sent"}, headers=h(alice)).json()
    assert offers[0]["status"] == "withdrawn"
    # Auction listings take bids, not offers.
    assert client.post(f"/api/listings/{car['id']}/offers", json={"amount": 1}, headers=h(alice)).status_code == 409


# ---------------------------------------------------------------- bidding rules
def test_bid_rules(client, people):
    auction_id = start_auction(client, people["seller"])["auction"]["id"]
    seller, alice, bob = people["seller"], people["alice"], people["bob"]

    assert bid(client, seller, auction_id, 2_000_000).status_code == 403  # own car
    assert bid(client, alice, auction_id, 999_999).status_code == 400  # below starting price

    first = bid(client, alice, auction_id, 1_000_000)
    assert first.status_code == 201, first.text
    assert first.json()["auction"]["min_next_bid"] == 1_010_000.0
    assert first.json()["bid"]["bidder"]["display_name"] == "Alice K."

    assert bid(client, alice, auction_id, 1_100_000).status_code == 409  # already leading
    res = bid(client, bob, auction_id, 1_009_999)
    assert res.status_code == 400 and "1,010,000" in res.json()["detail"]
    assert bid(client, bob, auction_id, 1_010_000).status_code == 201
    assert client.post(f"/api/auctions/{auction_id}/bids", json={"amount": 2_000_000}).status_code == 401

    history = client.get(f"/api/auctions/{auction_id}/bids").json()
    assert [b["amount"] for b in history] == [1_010_000.0, 1_000_000.0]


def test_outbid_notification(client, people):
    auction_id = start_auction(client, people["seller"])["auction"]["id"]
    bid(client, people["alice"], auction_id, 1_000_000)
    bid(client, people["bob"], auction_id, 1_050_000)
    notes = client.get("/api/notifications", headers=h(people["alice"])).json()["items"]
    assert notes[0]["type"] == "outbid"
    assert notes[0]["link"] == f"/auctions/{auction_id}"
    assert client.get("/api/notifications", headers=h(people["bob"])).json()["unread_count"] == 0


def test_cannot_bid_before_start_or_after_end(client, people, db_session):
    upcoming = start_auction(client, people["seller"], start_in=30)["auction"]
    assert upcoming["status"] == "scheduled"
    assert bid(client, people["alice"], upcoming["id"], 1_000_000).status_code == 409

    live = start_auction(client, people["seller"])["auction"]
    set_times(db_session, live["id"], end_in_seconds=-1)
    res = bid(client, people["alice"], live["id"], 1_000_000)
    assert res.status_code == 409 and "ended" in res.json()["detail"]


def test_anti_sniping_extends_end_time(client, people, db_session):
    auction_id = start_auction(client, people["seller"])["auction"]["id"]

    # Plenty of time left: no extension.
    first = bid(client, people["alice"], auction_id, 1_000_000).json()
    assert first["extended"] is False and first["auction"]["extended"] is False

    set_times(db_session, auction_id, end_in_seconds=60)  # inside the 2-minute window
    before = db_session.get(Auction, auction_id).end_time
    res = bid(client, people["bob"], auction_id, 1_010_000).json()
    assert res["extended"] is True and res["auction"]["extended"] is True
    db_session.expire_all()
    after = db_session.get(Auction, auction_id).end_time
    assert round((after - before).total_seconds()) == 120


# ---------------------------------------------------------------- lifecycle
def test_tick_activates_scheduled(client, people, db_session):
    auction_id = start_auction(client, people["seller"], start_in=30)["auction"]["id"]
    set_times(db_session, auction_id, start_in_seconds=-1)
    assert auction_service.tick(db_session)["opened"] == 1
    assert client.get(f"/api/auctions/{auction_id}").json()["auction"]["status"] == "live"


def test_close_with_winner(client, people, db_session):
    seller, alice, bob = people["seller"], people["alice"], people["bob"]
    detail = start_auction(client, seller, reserve=1_020_000)
    auction_id, listing_id = detail["auction"]["id"], detail["listing"]["id"]
    bid(client, alice, auction_id, 1_000_000)
    bid(client, bob, auction_id, 1_050_000)
    set_times(db_session, auction_id, end_in_seconds=-1)

    assert auction_service.tick(db_session)["closed"] == 1
    assert auction_service.tick(db_session)["closed"] == 0  # idempotent

    state = client.get(f"/api/auctions/{auction_id}").json()["auction"]
    assert state["status"] == "ended"
    assert state["winner_id"] == bob["user"]["id"]
    assert state["final_price"] == 1_050_000.0 and state["reserve_met"] is True
    db_session.expire_all()
    assert db_session.get(Listing, listing_id).status.value == "sold"

    assert client.get("/api/notifications", headers=h(bob)).json()["items"][0]["type"] == "auction_won"
    assert client.get("/api/notifications", headers=h(alice)).json()["items"][0]["type"] == "auction_ended"
    assert client.get("/api/notifications", headers=h(seller)).json()["items"][0]["type"] == "auction_ended"

    outcomes = {m["auction"]["id"]: m["outcome"] for m in client.get("/api/users/me/bids", headers=h(alice)).json()}
    assert outcomes[auction_id] == "lost"
    assert client.get("/api/users/me/bids", headers=h(bob)).json()[0]["outcome"] == "won"


def test_close_reserve_not_met(client, people, db_session):
    detail = start_auction(client, people["seller"], reserve=2_000_000)
    auction_id, listing_id = detail["auction"]["id"], detail["listing"]["id"]
    bid(client, people["alice"], auction_id, 1_000_000)
    set_times(db_session, auction_id, end_in_seconds=-1)
    auction_service.tick(db_session)

    state = client.get(f"/api/auctions/{auction_id}", headers=h(people["seller"])).json()["auction"]
    assert state["status"] == "ended" and state["winner_id"] is None and state["reserve_met"] is False
    db_session.expire_all()
    listing = db_session.get(Listing, listing_id)
    assert listing.status.value == "inactive" and listing.listing_type.value == "sale"  # can be relisted


def test_cancel_only_without_bids(client, people):
    seller = people["seller"]
    a1 = start_auction(client, seller)["auction"]["id"]
    assert client.post(f"/api/auctions/{a1}/cancel", headers=h(people["alice"])).status_code == 403
    res = client.post(f"/api/auctions/{a1}/cancel", headers=h(seller))
    assert res.status_code == 200 and res.json()["status"] == "cancelled"

    a2 = start_auction(client, seller)["auction"]["id"]
    bid(client, people["alice"], a2, 1_000_000)
    assert client.post(f"/api/auctions/{a2}/cancel", headers=h(seller)).status_code == 409


def test_listing_locked_during_auction(client, people):
    seller = people["seller"]
    detail = start_auction(client, seller)
    listing_id, auction_id = detail["listing"]["id"], detail["auction"]["id"]
    url = f"/api/listings/{listing_id}"
    assert client.patch(url, json={"price": 1}, headers=h(seller)).status_code == 409
    assert client.patch(url, json={"status": "sold"}, headers=h(seller)).status_code == 409
    assert client.patch(url, json={"description": "Fresh tyres"}, headers=h(seller)).status_code == 200
    bid(client, people["alice"], auction_id, 1_000_000)
    assert client.delete(url, headers=h(seller)).status_code == 409


def test_list_auctions_tabs(client, people, db_session):
    seller = people["seller"]
    live = start_auction(client, seller)["auction"]["id"]
    upcoming = start_auction(client, seller, start_in=30)["auction"]["id"]
    ended = start_auction(client, seller)["auction"]["id"]
    set_times(db_session, ended, end_in_seconds=-1)
    auction_service.tick(db_session)

    def ids(tab):
        return [c["auction"]["id"] for c in client.get("/api/auctions", params={"tab": tab}).json()["items"]]

    assert ids("live") == [live] and ids("upcoming") == [upcoming] and ids("ended") == [ended]


# ---------------------------------------------------------------- concurrency
def test_concurrent_equal_bids_only_one_wins(client, people, register_user):
    auction_id = start_auction(client, people["seller"])["auction"]["id"]
    bidders = [register_user(f"racer{i}@example.com") for i in range(6)]
    with ThreadPoolExecutor(max_workers=6) as pool:
        codes = list(pool.map(lambda p: bid(client, p, auction_id, 1_000_000).status_code, bidders))
    assert codes.count(201) == 1, codes
    state = client.get(f"/api/auctions/{auction_id}").json()["auction"]
    assert state["bid_count"] == 1 and state["current_price"] == 1_000_000.0


# ---------------------------------------------------------------- WebSockets
def test_ws_snapshot_and_live_bid_broadcast(client: TestClient, people):
    auction_id = start_auction(client, people["seller"])["auction"]["id"]
    with client.websocket_connect(f"/api/ws/auctions/{auction_id}") as watcher, \
            client.websocket_connect(f"/api/ws/auctions/{auction_id}") as bidder:
        snap = watcher.receive_json()
        assert snap["type"] == "snapshot" and snap["auction"]["id"] == auction_id and snap["bids"] == []
        bidder.receive_json()  # its own snapshot

        bidder.send_json({"type": "bid", "amount": 1_000_000, "ref": "r1"})
        assert bidder.receive_json()["code"] == "auth_required"

        bidder.send_json({"type": "auth", "token": "nonsense"})
        assert bidder.receive_json()["code"] == "auth_failed"
        bidder.send_json({"type": "auth", "token": people["alice"]["access_token"]})
        assert bidder.receive_json() == {"type": "auth_ok", "user_id": people["alice"]["user"]["id"]}

        bidder.send_json({"type": "bid", "amount": 1, "ref": "low"})
        err = bidder.receive_json()
        assert err["code"] == "bid_rejected" and err["ref"] == "low"

        bidder.send_json({"type": "bid", "amount": 1_000_000, "ref": "ok"})
        msgs = [bidder.receive_json(), bidder.receive_json()]  # broadcast + bid_ok (either order)
        assert {m["type"] for m in msgs} == {"bid", "bid_ok"}
        assert next(m for m in msgs if m["type"] == "bid_ok")["ref"] == "ok"

        event = watcher.receive_json()
        assert event["type"] == "bid" and event["auction"]["current_price"] == 1_000_000.0
        assert event["bid"]["bidder"]["display_name"] == "Alice K."

        # A REST bid is broadcast to sockets too.
        bid(client, people["bob"], auction_id, 1_010_000)
        assert watcher.receive_json()["auction"]["current_price"] == 1_010_000.0

        watcher.send_text("{not json")
        assert watcher.receive_json()["message"] == "Invalid JSON"
        watcher.send_json({"type": "ping"})
        assert watcher.receive_json() == {"type": "pong"}


def test_ws_status_broadcast_on_close(client, people, db_session):
    auction_id = start_auction(client, people["seller"])["auction"]["id"]
    with client.websocket_connect(f"/api/ws/auctions/{auction_id}") as ws:
        ws.receive_json()
        set_times(db_session, auction_id, end_in_seconds=-1)
        auction_service.tick(db_session)
        event = ws.receive_json()
        assert event["type"] == "status" and event["auction"]["status"] == "ended"


def test_ws_rejects_unknown_auction_and_foreign_origin(client):
    with client.websocket_connect("/api/ws/auctions/999") as ws:
        assert ws.receive_json()["message"] == "Auction not found"
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/api/ws/notifications", headers={"origin": "https://evil.example"}) as ws:
            ws.receive_json()


def test_ws_notifications_pushed_live(client, people):
    auction_id = start_auction(client, people["seller"])["auction"]["id"]
    with client.websocket_connect("/api/ws/notifications", headers={"origin": "http://localhost:3000"}) as ws:
        ws.send_json({"type": "auth", "token": people["alice"]["access_token"]})
        assert ws.receive_json()["type"] == "auth_ok"
        bid(client, people["alice"], auction_id, 1_000_000)
        bid(client, people["bob"], auction_id, 1_100_000)
        push = ws.receive_json()
        assert push["type"] == "notification"
        assert push["notification"]["type"] == "outbid"
        assert push["notification"]["created_at"].endswith("+00:00")
    listed = client.get("/api/notifications", headers=h(people["alice"])).json()["items"][0]
    assert listed["created_at"].endswith("+00:00")  # REST and push agree


def test_ws_notifications_require_auth(client):
    with client.websocket_connect("/api/ws/notifications") as ws:
        ws.send_json({"type": "ping"})
        assert ws.receive_json()["code"] == "auth_failed"
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()


def test_admin_can_delete_listing_with_bids_cleanly(client, people, db_session):
    """DB-level ON DELETE CASCADE removes bids/auction; the ORM must not double-delete."""
    import warnings

    from app.core.security import hash_password
    from app.models import Bid, User, UserRole

    detail = start_auction(client, people["seller"])
    bid(client, people["alice"], detail["auction"]["id"], 1_000_000)
    db_session.add(User(email="boss@example.com", full_name="Boss", role=UserRole.ADMIN,
                        hashed_password=hash_password("Adm1nPass!")))
    db_session.commit()
    admin = client.post("/api/auth/login", json={"email": "boss@example.com", "password": "Adm1nPass!"}).json()
    with warnings.catch_warnings():
        warnings.simplefilter("error")  # an SAWarning would fail the test
        res = client.delete(f"/api/listings/{detail['listing']['id']}", headers=auth_header(admin["access_token"]))
    assert res.status_code == 204
    assert db_session.query(Bid).count() == 0
