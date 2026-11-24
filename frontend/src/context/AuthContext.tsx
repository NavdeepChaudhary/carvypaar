"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { apiFetch, onSessionChange, refreshSession, setAccessToken } from "@/lib/api";
import type { AuthResponse, ProfileUpdate, RegisterPayload, User } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  /** True until the initial silent refresh finishes. */
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  /** Exchange a Google Identity Services credential (ID token) for a session. */
  loginWithGoogle: (credential: string) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<User>;
  logout: () => Promise<void>;
  updateProfile: (data: ProfileUpdate) => Promise<User>;
  changePassword: (current: string, next: string) => Promise<void>;
  becomeSeller: () => Promise<User>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Absolute expiry time (ms). A new value on every session, so the timer below re-arms.
  const [expiresAt, setExpiresAt] = useState<number | null>(null);

  const applySession = useCallback((session: AuthResponse | null) => {
    setAccessToken(session?.access_token ?? null);
    setUser(session?.user ?? null);
    setExpiresAt(session ? Date.now() + session.expires_in * 1000 : null);
  }, []);

  // Refresh a minute before the access token expires, so public pages (which
  // don't retry on 401) keep seeing the user as signed in.
  useEffect(() => {
    if (!expiresAt) return;
    const delay = Math.max(10_000, expiresAt - Date.now() - 60_000);
    const timer = window.setTimeout(() => void refreshSession(), delay);
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  // Restore the session from the httpOnly refresh cookie on first load.
  useEffect(() => {
    const unsubscribe = onSessionChange(applySession);
    refreshSession().finally(() => setLoading(false));
    return unsubscribe;
  }, [applySession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await apiFetch<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: { email, password },
        auth: false,
      });
      applySession(session);
      return session.user;
    },
    [applySession],
  );

  const loginWithGoogle = useCallback(
    async (credential: string) => {
      const session = await apiFetch<AuthResponse>("/api/auth/google", {
        method: "POST",
        body: { credential },
        auth: false,
      });
      applySession(session);
      return session.user;
    },
    [applySession],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const session = await apiFetch<AuthResponse>("/api/auth/register", {
        method: "POST",
        body: payload,
        auth: false,
      });
      applySession(session);
      return session.user;
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch<void>("/api/auth/logout", { method: "POST", auth: false });
    } finally {
      applySession(null);
    }
  }, [applySession]);

  const updateProfile = useCallback(async (data: ProfileUpdate) => {
    const updated = await apiFetch<User>("/api/users/me", { method: "PATCH", body: data });
    setUser(updated);
    return updated;
  }, []);

  const changePassword = useCallback(
    async (current: string, next: string) => {
      await apiFetch<void>("/api/users/me/password", {
        method: "POST",
        // Google-only accounts set a first password without a current one.
        body: { current_password: current || undefined, new_password: next },
      });
      // The API revokes all sessions on password change; sign in again with the new password.
      if (user) await login(user.email, next);
    },
    [login, user],
  );

  const becomeSeller = useCallback(async () => {
    const updated = await apiFetch<User>("/api/users/me/become-seller", { method: "POST" });
    setUser(updated);
    return updated;
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, loginWithGoogle, register, logout, updateProfile, changePassword, becomeSeller }),
    [user, loading, login, loginWithGoogle, register, logout, updateProfile, changePassword, becomeSeller],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
