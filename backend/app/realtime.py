"""In-process WebSocket hub.

Two kinds of channels:
  * auction rooms: everyone watching auction N gets its bid/status events
  * user channels: a signed-in user's sockets get their notifications

Service code is synchronous and runs in worker threads, so it publishes with
`publish_*()`, which hands the send coroutine to the event loop thread-safely.

Scaling: rooms live in each process's memory. With REDIS_URL set, every
`publish_*` goes through one Redis pub/sub channel and each worker delivers what
it receives to its *own* sockets, so any number of API workers/servers stay in sync.
The publisher also receives its own message via the subscription, so nothing is
delivered twice. If Redis is unreachable, publishing falls back to local delivery.
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from collections.abc import Coroutine
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger("carvypaar.realtime")
CHANNEL = "carvypaar:realtime"


class RealtimeHub:
    def __init__(self) -> None:
        self.loop: asyncio.AbstractEventLoop | None = None
        self._auctions: dict[int, set[WebSocket]] = defaultdict(set)
        self._users: dict[int, set[WebSocket]] = defaultdict(set)
        self._redis: Any = None
        self._listener: asyncio.Task[None] | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self.loop = loop

    # ------------------------------------------------------------ membership
    def join_auction(self, auction_id: int, ws: WebSocket) -> None:
        self._auctions[auction_id].add(ws)

    def leave_auction(self, auction_id: int, ws: WebSocket) -> None:
        room = self._auctions.get(auction_id)
        if room is not None:
            room.discard(ws)
            if not room:
                del self._auctions[auction_id]

    def join_user(self, user_id: int, ws: WebSocket) -> None:
        self._users[user_id].add(ws)

    def leave_user(self, user_id: int, ws: WebSocket) -> None:
        sockets = self._users.get(user_id)
        if sockets is not None:
            sockets.discard(ws)
            if not sockets:
                del self._users[user_id]

    def watchers(self, auction_id: int) -> int:
        return len(self._auctions.get(auction_id, ()))

    # ------------------------------------------------------------ sending
    @staticmethod
    async def _send_all(sockets: set[WebSocket], message: dict[str, Any]) -> None:
        targets = list(sockets)
        results = await asyncio.gather(*(ws.send_json(message) for ws in targets), return_exceptions=True)
        for ws, result in zip(targets, results):
            if isinstance(result, Exception):
                sockets.discard(ws)  # dead connection; its handler will clean up too

    async def broadcast_auction(self, auction_id: int, message: dict[str, Any]) -> None:
        room = self._auctions.get(auction_id)
        if room:
            await self._send_all(room, message)

    async def send_user(self, user_id: int, message: dict[str, Any]) -> None:
        sockets = self._users.get(user_id)
        if sockets:
            await self._send_all(sockets, message)

    # ------------------------------------------------------------ Redis fan-out
    async def start_redis(self, url: str | None = None, client: Any = None) -> None:
        """Subscribe to the shared channel. `client` lets tests inject a fake Redis."""
        if client is None:
            import redis.asyncio as aioredis

            client = aioredis.from_url(url)
        self._redis = client
        pubsub = client.pubsub()
        await pubsub.subscribe(CHANNEL)
        self._listener = asyncio.create_task(self._listen(pubsub))
        logger.info("Realtime fan-out via Redis enabled")

    async def stop_redis(self) -> None:
        if self._listener is not None:
            self._listener.cancel()
            try:
                await self._listener
            except asyncio.CancelledError:
                pass
            self._listener = None
        if self._redis is not None:
            await self._redis.aclose()
            self._redis = None

    async def _listen(self, pubsub: Any) -> None:
        while True:
            try:
                async for message in pubsub.listen():
                    if message.get("type") != "message":
                        continue
                    await self._dispatch(json.loads(message["data"]))
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - keep listening through bad payloads / blips
                logger.exception("Realtime listener error; resubscribing in 1s")
                await asyncio.sleep(1)
                try:
                    await pubsub.subscribe(CHANNEL)
                except Exception:  # noqa: BLE001
                    pass

    async def _dispatch(self, envelope: dict[str, Any]) -> None:
        if envelope.get("kind") == "auction":
            await self.broadcast_auction(int(envelope["id"]), envelope["message"])
        elif envelope.get("kind") == "user":
            await self.send_user(int(envelope["id"]), envelope["message"])

    async def _publish(self, kind: str, target: int, message: dict[str, Any]) -> None:
        envelope = {"kind": kind, "id": target, "message": message}
        try:
            await self._redis.publish(CHANNEL, json.dumps(envelope))
        except Exception:  # noqa: BLE001 - degrade to single-worker behaviour
            logger.warning("Redis publish failed; delivering locally only")
            await self._dispatch(envelope)

    # ------------------------------------------------------------ thread-safe publish
    def _schedule(self, coro: Coroutine[Any, Any, None]) -> None:
        loop = self.loop
        if loop is None or loop.is_closed():
            coro.close()  # no event loop (CLI scripts, some tests): nothing to deliver
            return
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is loop:
            loop.create_task(coro)
        else:
            asyncio.run_coroutine_threadsafe(coro, loop)

    def publish_auction(self, auction_id: int, message: dict[str, Any]) -> None:
        if self._redis is not None:
            self._schedule(self._publish("auction", auction_id, message))
        else:
            self._schedule(self.broadcast_auction(auction_id, message))

    def publish_user(self, user_id: int, message: dict[str, Any]) -> None:
        if self._redis is not None:
            self._schedule(self._publish("user", user_id, message))
        else:
            self._schedule(self.send_user(user_id, message))


hub = RealtimeHub()
