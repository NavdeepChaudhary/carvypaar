"use client";

import { useEffect, useRef, useState } from "react";

import { getAccessToken, refreshSession, wsBase } from "@/lib/api";

export type SocketStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface SocketMessage {
  type: string;
  [key: string]: unknown;
}

interface Options {
  /** Send {"type":"auth"} as the first message when a token is available. */
  authenticate?: boolean;
  /** Re-run auth when this changes (e.g. the signed-in user id). */
  authKey?: unknown;
  /** Called after an auth attempt succeeds. */
  onAuthenticated?: () => void;
  enabled?: boolean;
}

const MAX_BACKOFF_MS = 15_000;
const HEARTBEAT_MS = 25_000;

/**
 * Resilient WebSocket: exponential-backoff reconnects, heartbeat pings, and
 * first-message auth (tokens never go in the URL). If auth fails because the
 * access token expired, it refreshes the session once and retries.
 * Returns a stable `send` and the connection status.
 */
export function useSocket(path: string, onMessage: (msg: SocketMessage) => void, options: Options = {}) {
  const { authenticate = false, authKey, onAuthenticated, enabled = true } = options;
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const handlerRef = useRef(onMessage);
  const authedRef = useRef(onAuthenticated);
  handlerRef.current = onMessage;
  authedRef.current = onAuthenticated;

  const sendAuth = (ws: WebSocket) => {
    const token = getAccessToken();
    if (authenticate && token && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "auth", token }));
    }
  };

  useEffect(() => {
    if (!enabled) return;
    let attempt = 0;
    let stopped = false;
    let retryTimer: number | undefined;
    let heartbeat: number | undefined;
    let refreshedForAuth = false;

    const connect = () => {
      const ws = new WebSocket(`${wsBase()}${path}`);
      wsRef.current = ws;
      setStatus(attempt === 0 ? "connecting" : "reconnecting");

      ws.onopen = () => {
        attempt = 0;
        setStatus("open");
        sendAuth(ws);
        heartbeat = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
        }, HEARTBEAT_MS);
      };

      ws.onmessage = (event) => {
        let msg: SocketMessage;
        try {
          msg = JSON.parse(event.data as string) as SocketMessage;
        } catch {
          return;
        }
        if (msg.type === "pong") return;
        if (msg.type === "auth_ok") {
          refreshedForAuth = false;
          authedRef.current?.();
        }
        if (msg.type === "error" && msg.code === "auth_failed" && authenticate && !refreshedForAuth) {
          // Token probably expired: refresh once, then authenticate again.
          refreshedForAuth = true;
          void refreshSession().then((session) => {
            if (session && wsRef.current === ws) sendAuth(ws);
          });
          return;
        }
        handlerRef.current(msg);
      };

      ws.onclose = (event) => {
        window.clearInterval(heartbeat);
        if (stopped) return;
        // 4401/4403/4404 are permanent (auth/origin/not found): don't hammer the server.
        if (event.code >= 4400 && event.code < 4500) {
          setStatus("closed");
          return;
        }
        const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt) + Math.random() * 300;
        attempt += 1;
        setStatus("reconnecting");
        retryTimer = window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      window.clearInterval(heartbeat);
      wsRef.current?.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, enabled]);

  // Re-authenticate when the signed-in user changes (login/logout while connected).
  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) sendAuth(ws);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authKey]);

  const send = (msg: Record<string, unknown>): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  };

  return { status, send };
}
