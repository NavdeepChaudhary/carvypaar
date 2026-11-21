"""WebSocket endpoints.

  /api/ws/auctions/{id}   live auction room (anyone can watch; auth to bid)
  /api/ws/notifications   personal notification stream (auth required)

Protocol (JSON text frames):
  client -> {"type": "auth", "token": "<access token>"}       (sent as first message, never in the URL)
  client -> {"type": "bid", "amount": 1250000, "ref": "abc"}  (auction room only; `ref` is echoed back)
  client -> {"type": "ping"}
  server -> snapshot | bid | status | auth_ok | bid_ok | error | pong | notification

Security: Origin is checked against CORS_ORIGINS (blocks cross-site WebSocket
hijacking), frames are size-capped, and bids are rate limited per socket.
"""
from __future__ import annotations

import json
import time
from collections import deque
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.security import TokenError, decode_token
from app.db.session import new_session
from app.models import User
from app.realtime import hub
from app.schemas.listing import MAX_PRICE
from app.services import auction_service
from app.services.listing_service import ListingError

router = APIRouter(prefix="/ws", tags=["websockets"])

MAX_FRAME_BYTES = 4096
AUTH_TIMEOUT_CLOSE = 4401  # app-specific close codes (4000-4999)
NOT_FOUND_CLOSE = 4404
FORBIDDEN_ORIGIN_CLOSE = 4403


def _origin_allowed(ws: WebSocket) -> bool:
    origin = ws.headers.get("origin")
    # Non-browser clients (mobile apps, scripts) send no Origin; browsers always do.
    return origin is None or origin in settings.cors_origins_list


def _user_from_token(token: Any) -> User | None:
    if not isinstance(token, str) or len(token) > 4096:
        return None
    try:
        user_id = int(decode_token(token, expected_type="access")["sub"])
    except (TokenError, ValueError, KeyError):
        return None
    with new_session() as db:
        user = db.get(User, user_id)
        if user is None or not user.is_active:
            return None
        db.expunge(user)
        return user


async def _receive(ws: WebSocket) -> dict[str, Any] | None:
    """Read one JSON object; returns None (after telling the client) if malformed."""
    text = await ws.receive_text()
    if len(text.encode()) > MAX_FRAME_BYTES:
        await ws.send_json({"type": "error", "message": "Message too large"})
        return None
    try:
        msg = json.loads(text)
    except json.JSONDecodeError:
        await ws.send_json({"type": "error", "message": "Invalid JSON"})
        return None
    if not isinstance(msg, dict):
        await ws.send_json({"type": "error", "message": "Expected a JSON object"})
        return None
    return msg


def _snapshot(auction_id: int) -> dict[str, Any] | None:
    with new_session() as db:
        try:
            a = auction_service.get_visible_auction(db, auction_id, None)
        except ListingError:
            return None
        return {
            "type": "snapshot",
            "auction": auction_service.to_state(a).model_dump(mode="json"),
            "bids": [auction_service.to_bid_read(b).model_dump(mode="json") for b in auction_service.recent_bids(db, a.id)],
        }


def _bid(auction_id: int, user_id: int, amount: Decimal) -> dict[str, Any]:
    with new_session() as db:
        user = db.get(User, user_id)
        if user is None or not user.is_active:
            raise ListingError("Account unavailable", 401)
        result = auction_service.place_bid(db, auction_id, user, amount)
        return result.model_dump(mode="json")


def _parse_amount(raw: Any) -> Decimal | None:
    if isinstance(raw, bool) or not isinstance(raw, (int, float, str)):
        return None
    try:
        amount = Decimal(str(raw)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None
    return amount if Decimal(0) < amount <= MAX_PRICE else None


@router.websocket("/auctions/{auction_id}")
async def auction_socket(ws: WebSocket, auction_id: int) -> None:
    if not _origin_allowed(ws):
        await ws.close(code=FORBIDDEN_ORIGIN_CLOSE)
        return
    await ws.accept()
    snapshot = await run_in_threadpool(_snapshot, auction_id)
    if snapshot is None:
        await ws.send_json({"type": "error", "message": "Auction not found"})
        await ws.close(code=NOT_FOUND_CLOSE)
        return

    hub.join_auction(auction_id, ws)
    user: User | None = None
    recent: deque[float] = deque()
    try:
        await ws.send_json(snapshot)
        while True:
            msg = await _receive(ws)
            if msg is None:
                continue
            kind = msg.get("type")
            ref = msg.get("ref") if isinstance(msg.get("ref"), (str, int)) else None

            if kind == "ping":
                await ws.send_json({"type": "pong"})
            elif kind == "auth":
                user = await run_in_threadpool(_user_from_token, msg.get("token"))
                if user is None:
                    await ws.send_json({"type": "error", "code": "auth_failed", "message": "Invalid or expired token"})
                else:
                    await ws.send_json({"type": "auth_ok", "user_id": user.id})
            elif kind == "bid":
                if user is None:
                    await ws.send_json({"type": "error", "code": "auth_required", "ref": ref, "message": "Sign in to bid"})
                    continue
                now = time.monotonic()
                while recent and now - recent[0] > settings.WS_BID_RATE_WINDOW_SECONDS:
                    recent.popleft()
                if len(recent) >= settings.WS_BID_RATE_LIMIT:
                    await ws.send_json({"type": "error", "code": "rate_limited", "ref": ref, "message": "Slow down! Too many bids."})
                    continue
                recent.append(now)
                amount = _parse_amount(msg.get("amount"))
                if amount is None:
                    await ws.send_json({"type": "error", "code": "invalid_amount", "ref": ref, "message": "Enter a valid bid amount"})
                    continue
                try:
                    result = await run_in_threadpool(_bid, auction_id, user.id, amount)
                except ListingError as exc:
                    await ws.send_json({"type": "error", "code": "bid_rejected", "ref": ref, "message": exc.message})
                    continue
                # Everyone (including this socket) also gets the "bid" broadcast.
                await ws.send_json({"type": "bid_ok", "ref": ref, **result})
            else:
                await ws.send_json({"type": "error", "message": f"Unknown message type: {kind!r}"})
    except WebSocketDisconnect:
        pass
    finally:
        hub.leave_auction(auction_id, ws)


@router.websocket("/notifications")
async def notification_socket(ws: WebSocket) -> None:
    if not _origin_allowed(ws):
        await ws.close(code=FORBIDDEN_ORIGIN_CLOSE)
        return
    await ws.accept()
    user: User | None = None
    try:
        # The first message must authenticate.
        msg = await _receive(ws)
        if msg is not None and msg.get("type") == "auth":
            user = await run_in_threadpool(_user_from_token, msg.get("token"))
        if user is None:
            await ws.send_json({"type": "error", "code": "auth_failed", "message": "Invalid or expired token"})
            await ws.close(code=AUTH_TIMEOUT_CLOSE)
            return
        hub.join_user(user.id, ws)
        await ws.send_json({"type": "auth_ok", "user_id": user.id})
        while True:
            msg = await _receive(ws)
            if msg is not None and msg.get("type") == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        if user is not None:
            hub.leave_user(user.id, ws)


