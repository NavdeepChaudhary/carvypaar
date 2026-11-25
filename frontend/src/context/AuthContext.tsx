"use client";

import { useAuth as useClerkAuth } from "@clerk/nextjs";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ApiError, apiFetch, onSessionChange, refreshSession, setAccessToken } from "@/lib/api";
import { CLERK_ENABLED } from "@/lib/clerk";
import type { AuthResponse, ProfileUpdate, User } from "@/lib/types";

/**
 * Sign-in is done by Clerk. Once Clerk says someone is signed in, we trade their Clerk
 * session token for a CarVypaar session (POST /api/auth/clerk), which the rest of the app
 * uses exactly as before: access token in memory, refresh token in an httpOnly cookie.
 */
interface AuthContextValue {
  user: User | null;
  /** True until we know whether someone is signed in. */
  loading: boolean;
  logout: () => Promise<void>;
  updateProfile: (data: ProfileUpdate) => Promise<User>;
  becomeSeller: () => Promise<User>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

type ApplySession = (session: AuthResponse | null) => void;

/** How long sign-in keeps retrying while the API server wakes from sleep. */
const WAKE_TIMEOUT_MS = 90_000;

/** Errors a sleeping or still-booting server gives: unreachable, or a gateway error. */
function isWakingUp(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 0 || err.status === 502 || err.status === 503 || err.status === 504);
}

/** Keeps the CarVypaar session in step with Clerk's. Rendered only when Clerk is configured. */
function ClerkSessionSync({
  applySession,
  hasSession,
  onSettled,
  signOutRef,
}: {
  applySession: ApplySession;
  hasSession: () => boolean;
  onSettled: () => void;
  signOutRef: { current: (() => Promise<void>) | null };
}) {
  const { isLoaded, isSignedIn, userId, getToken, signOut } = useClerkAuth();
  signOutRef.current = () => signOut();

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      if (isSignedIn) {
        // The free API server sleeps when idle; while it boots (up to about a minute) its
        // host answers 502/503/504 or drops the connection. Keep trying through that.
        const deadline = Date.now() + WAKE_TIMEOUT_MS;
        let wakingToast: string | number | undefined;
        try {
          for (let attempt = 0; ; attempt++) {
            try {
              // A fresh Clerk token each time: they only live about a minute.
              const token = await getToken({ skipCache: attempt > 0 });
              if (!token) throw new ApiError("Couldn't read your sign-in session", 401);
              const session = await apiFetch<AuthResponse>("/api/auth/clerk", { method: "POST", body: { token }, auth: false });
              if (!cancelled) applySession(session);
              break;
            } catch (err) {
              if (cancelled) return;
              if (!isWakingUp(err) || Date.now() > deadline) throw err;
              wakingToast ??= toast.loading("Waking up the server… this can take up to a minute.");
              await new Promise((r) => setTimeout(r, Math.min(2_000 * 2 ** attempt, 8_000)));
              if (cancelled) return;
            }
          }
        } catch (err) {
          if (cancelled) return;
          applySession(null);
          toast.error(err instanceof ApiError ? err.message : "Couldn't sign you in. Please try again.");
        } finally {
          if (wakingToast !== undefined) toast.dismiss(wakingToast);
        }
      } else if (hasSession()) {
        // Signed out of Clerk (here or in another tab): end the CarVypaar session too.
        await apiFetch<void>("/api/auth/logout", { method: "POST", auth: false }).catch(() => undefined);
        if (!cancelled) applySession(null);
      }
      if (!cancelled) onSettled();
    })();
    return () => {
      cancelled = true;
    };
    // userId: re-sync when a different person signs in.
  }, [isLoaded, isSignedIn, userId, getToken, applySession, hasSession, onSettled]);

  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Absolute expiry time (ms). A new value on every session, so the timer below re-arms.
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const userRef = useRef<User | null>(null);
  const clerkSignOut = useRef<(() => Promise<void>) | null>(null);

  const applySession = useCallback<ApplySession>((session) => {
    setAccessToken(session?.access_token ?? null);
    userRef.current = session?.user ?? null;
    setUser(session?.user ?? null);
    setExpiresAt(session ? Date.now() + session.expires_in * 1000 : null);
  }, []);
  const hasSession = useCallback(() => userRef.current !== null, []);
  const settle = useCallback(() => setLoading(false), []);

  // Refresh a minute before the access token expires, so public pages (which
  // don't retry on 401) keep seeing the user as signed in.
  useEffect(() => {
    if (!expiresAt) return;
    const delay = Math.max(10_000, expiresAt - Date.now() - 60_000);
    const timer = window.setTimeout(() => void refreshSession(), delay);
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  useEffect(() => onSessionChange(applySession), [applySession]);

  // Without Clerk (GitHub Pages preview) nobody can sign in: we're done loading at once.
  useEffect(() => {
    if (!CLERK_ENABLED) setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch<void>("/api/auth/logout", { method: "POST", auth: false });
    } catch {
      // Signing out locally matters more than telling the server.
    } finally {
      applySession(null);
    }
    await clerkSignOut.current?.();
  }, [applySession]);

  const updateProfile = useCallback(async (data: ProfileUpdate) => {
    const updated = await apiFetch<User>("/api/users/me", { method: "PATCH", body: data });
    userRef.current = updated;
    setUser(updated);
    return updated;
  }, []);

  const becomeSeller = useCallback(async () => {
    const updated = await apiFetch<User>("/api/users/me/become-seller", { method: "POST" });
    userRef.current = updated;
    setUser(updated);
    return updated;
  }, []);

  const value = useMemo(
    () => ({ user, loading, logout, updateProfile, becomeSeller }),
    [user, loading, logout, updateProfile, becomeSeller],
  );

  return (
    <AuthContext.Provider value={value}>
      {CLERK_ENABLED && (
        <ClerkSessionSync applySession={applySession} hasSession={hasSession} onSettled={settle} signOutRef={clerkSignOut} />
      )}
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
