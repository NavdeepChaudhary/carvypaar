"""End-to-end auction smoke test against a RUNNING API (http://localhost:8000).

Simulates a watcher, two buyers (one over WebSocket, one over REST) and the
background worker closing the auction, then removes the data it created.
Needs the demo seed (torque@carvypaar.com) and the API started with the worker on.

    cd backend
    uvicorn app.main:app --port 8000          # terminal 1
    python scripts/e2e_auction.py             # terminal 2
"""
import asyncio
import json
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import websockets

sys.path.insert(0, ".")
from app.db.session import new_session  # noqa: E402
from app.models import Auction, Listing, User  # noqa: E402
from sqlalchemy import delete, select  # noqa: E402

API = "http://localhost:8000/api"
WS = "ws://localhost:8000/api/ws"
ORIGIN = {"Origin": "http://localhost:3000"}
CAR = {"title": "E2E 2020 Porsche 911 Carrera", "make": "Porsche", "model": "911 Carrera", "year": 2020,
       "mileage": 18000, "fuel_type": "petrol", "transmission": "automatic", "body_type": "coupe",
       "condition": "excellent", "color": "GT Silver", "location": "Mumbai", "price": 12000000}


def ok(label, cond):
    print(("PASS " if cond else "FAIL ") + label)
    if not cond:
        raise SystemExit(1)


def set_end(auction_id, seconds_from_now):
    with new_session() as db:
        a = db.get(Auction, auction_id)
        a.end_time = datetime.now(timezone.utc) + timedelta(seconds=seconds_from_now)
        a.original_end_time = a.end_time
        db.commit()


async def recv_until(ws, predicate, timeout=10):
    deadline = time.monotonic() + timeout
    while True:
        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=max(0.1, deadline - time.monotonic())))
        if predicate(msg):
            return msg


async def main():
    tag = uuid.uuid4().hex[:6]
    async with httpx.AsyncClient(base_url=API, timeout=10) as http:
        seller = (await http.post("/auth/login", json={"email": "torque@carvypaar.com", "password": "DemoPass123"})).json()
        b1 = (await http.post("/auth/register", json={"email": f"e2e1-{tag}@example.com", "password": "Racing123",
                                                       "full_name": "Asha Verma"})).json()
        b2 = (await http.post("/auth/register", json={"email": f"e2e2-{tag}@example.com", "password": "Racing123",
                                                       "full_name": "Kabir Singh"})).json()
        hs = {"Authorization": f"Bearer {seller['access_token']}"}
        listing = (await http.post("/listings", json=CAR, headers=hs)).json()
        end = datetime.now(timezone.utc) + timedelta(minutes=15)
        detail = (await http.post(f"/listings/{listing['id']}/auction", headers=hs, json={
            "starting_price": 9000000, "bid_increment": 50000, "end_time": end.isoformat()})).json()
        aid = detail["auction"]["id"]
        ok(f"auction {aid} created live", detail["auction"]["status"] == "live")

        async with websockets.connect(f"{WS}/auctions/{aid}", additional_headers=ORIGIN) as watcher, \
                websockets.connect(f"{WS}/auctions/{aid}", additional_headers=ORIGIN) as bidder, \
                websockets.connect(f"{WS}/notifications", additional_headers=ORIGIN) as inbox:
            ok("watcher snapshot", json.loads(await watcher.recv())["type"] == "snapshot")
            await bidder.recv()
            await inbox.send(json.dumps({"type": "auth", "token": b1["access_token"]}))
            ok("inbox auth", json.loads(await inbox.recv())["type"] == "auth_ok")

            await bidder.send(json.dumps({"type": "auth", "token": b1["access_token"]}))
            await recv_until(bidder, lambda m: m["type"] == "auth_ok")
            await bidder.send(json.dumps({"type": "bid", "amount": 9000000, "ref": "a"}))
            okmsg = await recv_until(bidder, lambda m: m["type"] in ("bid_ok", "error"))
            ok("WS bid accepted", okmsg["type"] == "bid_ok")
            ev = await recv_until(watcher, lambda m: m["type"] == "bid")
            ok("watcher saw WS bid live", ev["auction"]["current_price"] == 9000000)

            r = await http.post(f"/auctions/{aid}/bids", json={"amount": 9050000},
                                headers={"Authorization": f"Bearer {b2['access_token']}"})
            ok("REST bid accepted", r.status_code == 201)
            ev = await recv_until(watcher, lambda m: m["type"] == "bid")
            ok("watcher saw REST bid live", ev["auction"]["current_price"] == 9050000)
            push = await recv_until(inbox, lambda m: m["type"] == "notification")
            ok("buyer 1 got live OUTBID push", push["notification"]["type"] == "outbid")

            # Anti-sniping: 30 s left, bid -> +120 s.
            set_end(aid, 30)
            await bidder.send(json.dumps({"type": "bid", "amount": 9100000, "ref": "b"}))
            ev = await recv_until(watcher, lambda m: m["type"] == "bid")
            left = (datetime.fromisoformat(ev["auction"]["end_time"]) - datetime.now(timezone.utc)).total_seconds()
            ok(f"anti-snipe extended ({left:.0f}s left, expected ~150)", ev["extended"] and 140 < left < 155)

            # Worker closes it: set end 2 s out and wait for the status broadcast.
            set_end(aid, 2)
            ev = await recv_until(watcher, lambda m: m["type"] == "status", timeout=10)
            ok("worker closed auction", ev["auction"]["status"] == "ended")
            ok("buyer 1 is the winner", ev["auction"]["winner_id"] == b1["user"]["id"])
            push = await recv_until(inbox, lambda m: m["type"] == "notification" and m["notification"]["type"] == "auction_won")
            ok("buyer 1 got live WON push", "won" in push["notification"]["title"])

        listing_now = (await http.get(f"/listings/{listing['id']}", headers=hs)).json()
        ok("listing marked sold", listing_now["status"] == "sold")
        try:
            async with websockets.connect(f"{WS}/auctions/{aid}", additional_headers={"Origin": "https://evil.example"}) as ws:
                await ws.recv()
            ok("foreign origin rejected", False)
        except websockets.exceptions.InvalidStatus:
            ok("foreign origin rejected", True)
    print("ALL E2E CHECKS PASSED")


def cleanup():
    """Remove the listing and throwaway users this script created."""
    with new_session() as db:
        for listing in db.scalars(select(Listing).where(Listing.title.like("E2E %"))):
            db.delete(listing)
        db.execute(delete(User).where(User.email.like("e2e%@example.com")))
        db.commit()


try:
    asyncio.run(main())
finally:
    cleanup()
