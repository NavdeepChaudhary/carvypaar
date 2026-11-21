"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { ApiError, apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";

const GIS_SRC = "https://accounts.google.com/gsi/client";

interface GoogleIdApi {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    ux_mode?: "popup" | "redirect";
    use_fedcm_for_prompt?: boolean;
    context?: "signin" | "signup" | "use";
  }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

// Shared across mounts: the script and the provider config are fetched once per page load.
let scriptPromise: Promise<void> | null = null;
let clientIdPromise: Promise<string | null> | null = null;

function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Couldn't load Google sign-in"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

function googleClientId(): Promise<string | null> {
  clientIdPromise ??= apiFetch<{ google_client_id: string | null }>("/api/auth/providers", { auth: false })
    .then((r) => r.google_client_id)
    .catch(() => null);
  return clientIdPromise;
}

/**
 * Official "Sign in with Google" button (Google Identity Services). Google hands us a
 * signed ID token, which the API verifies before creating a session. Renders nothing
 * when the API has no GOOGLE_CLIENT_ID configured, or if Google's script is blocked.
 */
export function GoogleSignInButton({
  context = "signin",
  onSignedIn,
}: {
  context?: "signin" | "signup";
  onSignedIn: (user: User) => void;
}) {
  const { loginWithGoogle } = useAuth();
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [busy, setBusy] = useState(false);
  // Latest handlers without re-initialising Google on every render.
  const handlers = useRef({ loginWithGoogle, onSignedIn });
  handlers.current = { loginWithGoogle, onSignedIn };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const clientId = await googleClientId();
      if (!clientId) {
        if (!cancelled) setState("unavailable");
        return;
      }
      try {
        await loadGis();
      } catch {
        if (!cancelled) setState("unavailable");
        return;
      }
      const gis = window.google?.accounts?.id;
      if (cancelled || !gis || !containerRef.current) return;
      gis.initialize({
        client_id: clientId,
        ux_mode: "popup",
        context,
        use_fedcm_for_prompt: true,
        callback: async ({ credential }) => {
          if (!credential) {
            toast.error("Google sign-in was cancelled");
            return;
          }
          setBusy(true);
          try {
            const user = await handlers.current.loginWithGoogle(credential);
            handlers.current.onSignedIn(user);
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : "Google sign-in failed");
          } finally {
            setBusy(false);
          }
        },
      });
      containerRef.current.innerHTML = "";
      gis.renderButton(containerRef.current, {
        type: "standard",
        theme: theme === "dark" ? "filled_black" : "outline",
        size: "large",
        shape: "pill",
        text: context === "signup" ? "signup_with" : "continue_with",
        logo_alignment: "left",
        width: Math.min(containerRef.current.offsetWidth || 360, 400),
      });
      setState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [context, theme]);

  if (state === "unavailable") return null;

  return (
    <div className="space-y-5">
      <div className="relative min-h-11" aria-busy={busy || state === "loading"}>
        {/* Google renders its own accessible button (an iframe) into this element. */}
        <div ref={containerRef} className={busy ? "pointer-events-none opacity-50" : ""} />
        {state === "loading" && <div className="absolute inset-0 animate-pulse rounded-full bg-elevated" aria-hidden />}
      </div>
      <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-muted" aria-hidden>
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
