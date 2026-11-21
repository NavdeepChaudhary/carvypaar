/**
 * Typed fetch wrapper for the CarvyPaar API.
 *
 * Token strategy:
 *  - Access token lives only in memory (never localStorage), so XSS can't steal it.
 *  - Refresh token is an httpOnly cookie set by the API (scoped to /api/auth).
 *  - On a 401 we transparently refresh once and retry the request.
 */
import type { AuthResponse } from "./types";

// "" = same origin (the API is served under /api by the same host, e.g. behind Caddy).
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

/** GitHub Pages preview: there is no backend, so API calls fail fast with a clear message. */
export const STATIC_DEMO = process.env.NEXT_PUBLIC_STATIC_DEMO === "1";
export const DEMO_MESSAGE =
  "This is a preview on GitHub Pages. Signing in, listings, auctions and price checks need the CarvyPaar server, which isn't connected here.";

let accessToken: string | null = null;
type SessionListener = (session: AuthResponse | null) => void;
const listeners = new Set<SessionListener>();

/** ws(s)://host for WebSocket endpoints: derived from the API URL, or from the page's own
 *  host when the API is same-origin. Called in the browser only. */
export function wsBase(): string {
  // Proxy mode (Vercel): HTTP goes through this site, WebSockets straight to the backend.
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL.replace(/\/$/, "");
  if (API_URL) return API_URL.replace(/^http/, "ws");
  return `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Subscribe to session changes caused by background refreshes. */
export function onSessionChange(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Turn FastAPI error payloads ({detail: string} or validation arrays) into one message. */
export function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((d) => {
          const item = d as { msg?: string; loc?: (string | number)[] };
          const field = item.loc?.filter((p) => p !== "body").join(".");
          const msg = (item.msg ?? "Invalid value").replace(/^Value error, /, "");
          return field ? `${field}: ${msg}` : msg;
        })
        .join("\n");
    }
  }
  if (body && typeof body === "object" && "error" in body) {
    return String((body as { error: unknown }).error); // slowapi rate-limit payload
  }
  return fallback;
}

// A single in-flight refresh shared by all callers. Without this, parallel 401s
// (or React StrictMode's double effects) would race and trip reuse detection.
let refreshPromise: Promise<AuthResponse | null> | null = null;

export function refreshSession(): Promise<AuthResponse | null> {
  if (STATIC_DEMO) return Promise.resolve(null); // no backend in the Pages preview
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/api/auth/refresh`, { method: "POST", credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as AuthResponse;
      })
      .catch(() => null)
      .then((session) => {
        accessToken = session?.access_token ?? null;
        listeners.forEach((l) => l(session));
        return session;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Attach the access token (default true). */
  auth?: boolean;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}, retried = false): Promise<T> {
  if (STATIC_DEMO) throw new ApiError(DEMO_MESSAGE, 0);
  const { body, auth = true, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isForm) finalHeaders.set("Content-Type", "application/json");
  if (auth && accessToken) finalHeaders.set("Authorization", `Bearer ${accessToken}`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
      credentials: "include",
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }

  if (res.status === 401 && auth && !retried && !path.startsWith("/api/auth/")) {
    const session = await refreshSession();
    if (session) return apiFetch<T>(path, options, true);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    throw new ApiError(extractMessage(data, `Request failed (${res.status})`), res.status, data);
  }
  return data as T;
}
