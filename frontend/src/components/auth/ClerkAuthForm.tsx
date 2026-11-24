"use client";

import { SignIn, SignUp, useAuth as useClerkAuth, useClerk } from "@clerk/nextjs";
import { AlertTriangle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/AuthContext";
import { DEMO_MESSAGE, STATIC_DEMO } from "@/lib/api";
import { CLERK_ENABLED } from "@/lib/clerk";
import { navigateAfterAuth, safeNext } from "@/lib/navigation";

type Mode = "sign-in" | "sign-up";

/** Clerk's sign-in or sign-up widget. After Clerk finishes, AuthContext opens the CarVypaar
 *  session and this sends the person on to `?next=` (default: their profile). */
export function ClerkAuthForm({ mode }: { mode: Mode }) {
  if (!CLERK_ENABLED) {
    return (
      <p role="alert" className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-fg">
        {STATIC_DEMO ? DEMO_MESSAGE : "Sign-in isn't set up on this site yet."}
      </p>
    );
  }
  return <ClerkForm mode={mode} />;
}

function ClerkForm({ mode }: { mode: Mode }) {
  const { user, loading } = useAuth();
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { signOut } = useClerk();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const here = mode === "sign-in" ? "/login" : "/register";

  useEffect(() => {
    if (!loading && user) navigateAfterAuth(router, next, here);
  }, [loading, user, next, here, router]);

  if (user || loading || !isLoaded) return <Skeleton className="h-80 rounded-2xl" aria-label="Loading sign-in" />;

  // Clerk signed them in, but our server couldn't open a session (already shown as a toast).
  if (isSignedIn) {
    return (
      <div role="alert" className="space-y-4 rounded-2xl border border-accent/40 bg-accent/10 p-5 text-sm">
        <p className="flex items-start gap-2 font-semibold text-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ink" aria-hidden />
          You&apos;re signed in, but we couldn&apos;t open your CarVypaar session.
        </p>
        <p className="text-muted">The server may still be waking up. Try again in a moment.</p>
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => window.location.reload()}>Try again</Button>
          <Button type="button" variant="outline" onClick={() => void signOut()}>Use another account</Button>
        </div>
      </div>
    );
  }

  const other = encodeURIComponent(next);
  // Hash routing keeps Clerk's extra steps (verify email, second factor) on this one page.
  // Clerk returns here after sign-in; the effect above then goes on to `next` once our
  // session is ready (so guarded pages never see a half-signed-in state).
  return mode === "sign-in" ? (
    <SignIn routing="hash" signUpUrl={`/register?next=${other}`} forceRedirectUrl={`/login?next=${other}`} />
  ) : (
    <SignUp routing="hash" signInUrl={`/login?next=${other}`} forceRedirectUrl={`/register?next=${other}`} />
  );
}
