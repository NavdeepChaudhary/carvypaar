"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api";
import { auctionsApi, parseUtc } from "@/lib/auctions";
import type { AuctionDetail, AuctionState, Bid } from "@/lib/types";

import { useSocket, type SocketMessage } from "./useSocket";

const BID_TIMEOUT_MS = 8000;

interface Pending {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: number;
}

/** Newer state wins; bid_count is a monotonically increasing version. */
export function newer(current: AuctionState, incoming: AuctionState): boolean {
  return incoming.bid_count > current.bid_count || (incoming.bid_count === current.bid_count && incoming.status !== current.status)
    || (incoming.bid_count === current.bid_count && parseUtc(incoming.end_time) !== parseUtc(current.end_time));
}

export function mergeBids(existing: Bid[], incoming: Bid[]): Bid[] {
  const byId = new Map(existing.map((b) => [b.id, b]));
  incoming.forEach((b) => byId.set(b.id, b));
  return [...byId.values()].sort((a, b) => b.amount - a.amount || b.id - a.id).slice(0, 50);
}

/**
 * Live auction state. Bids go over the WebSocket when it's open and
 * authenticated, otherwise over REST; either way every client receives the
 * server's "bid" broadcast, so all views converge on the same state.
 */
export function useLiveAuction(initial: AuctionDetail) {
  const { user } = useAuth();
  const auctionId = initial.auction.id;
  const [auction, setAuction] = useState<AuctionState>(initial.auction);
  const [bids, setBids] = useState<Bid[]>(initial.bids);
  const [clockOffset, setClockOffset] = useState(() => parseUtc(initial.auction.server_time) - Date.now());
  const [extendedAt, setExtendedAt] = useState<number | null>(null);
  const [myMaxBid, setMyMaxBid] = useState<number | null>(initial.my_max_bid);
  const [socketAuthed, setSocketAuthed] = useState(false);
  const pending = useRef(new Map<string, Pending>());

  const applyState = useCallback((incoming: AuctionState) => {
    setAuction((cur) => (newer(cur, incoming) ? incoming : cur));
    setClockOffset(parseUtc(incoming.server_time) - Date.now());
  }, []);

  const settle = (ref: unknown, error?: string) => {
    if (typeof ref !== "string") return;
    const p = pending.current.get(ref);
    if (!p) return;
    window.clearTimeout(p.timer);
    pending.current.delete(ref);
    if (error) p.reject(new Error(error));
    else p.resolve();
  };

  const onMessage = useCallback(
    (msg: SocketMessage) => {
      switch (msg.type) {
        case "snapshot":
          applyState(msg.auction as AuctionState);
          setBids((b) => mergeBids(b, msg.bids as Bid[]));
          break;
        case "bid":
          applyState(msg.auction as AuctionState);
          setBids((b) => mergeBids(b, [msg.bid as Bid]));
          if (msg.extended) setExtendedAt(Date.now());
          break;
        case "status":
          applyState(msg.auction as AuctionState);
          break;
        case "bid_ok":
          // Carries the same payload as the broadcast; apply it in case it arrives first.
          if (msg.auction) applyState(msg.auction as AuctionState);
          if (msg.bid) setBids((b) => mergeBids(b, [msg.bid as Bid]));
          settle(msg.ref);
          break;
        case "error":
          settle(msg.ref, String(msg.message ?? "Bid failed"));
          break;
      }
    },
    [applyState],
  );

  const { status, send } = useSocket(`/api/ws/auctions/${auctionId}`, onMessage, {
    authenticate: true,
    authKey: user?.id,
    onAuthenticated: () => setSocketAuthed(true),
  });

  useEffect(() => {
    if (status !== "open") setSocketAuthed(false);
  }, [status]);
  useEffect(() => setSocketAuthed(false), [user?.id]);

  const placeBid = useCallback(
    async (amount: number) => {
      if (status === "open" && socketAuthed && user) {
        const ref = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const done = new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => {
            pending.current.delete(ref);
            reject(new Error("The bid timed out. Check the bid history before retrying."));
          }, BID_TIMEOUT_MS);
          pending.current.set(ref, { resolve, reject, timer });
        });
        if (send({ type: "bid", amount, ref })) {
          await done;
          setMyMaxBid((m) => Math.max(m ?? 0, amount));
          return;
        }
        settle(ref, "Connection lost");
      }
      // REST fallback (also handles token refresh automatically).
      try {
        const result = await auctionsApi.placeBid(auctionId, amount);
        applyState(result.auction);
        setBids((b) => mergeBids(b, [result.bid]));
        if (result.extended) setExtendedAt(Date.now());
        setMyMaxBid((m) => Math.max(m ?? 0, amount));
      } catch (err) {
        throw new Error(err instanceof ApiError ? err.message : "Bid failed");
      }
    },
    [status, socketAuthed, user, send, auctionId, applyState],
  );

  // Reject anything still pending on unmount.
  useEffect(() => {
    const map = pending.current;
    return () => map.forEach((p) => window.clearTimeout(p.timer));
  }, []);

  return { auction, bids, clockOffset, extendedAt, myMaxBid, connection: status, placeBid };
}
