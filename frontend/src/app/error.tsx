"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

/** Route-level error boundary: a crash in one page never blanks the whole app. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error); // surfaces in the browser console / error tracking
  }, [error]);

  return (
    <div className="container-page flex min-h-[80vh] flex-col items-center justify-center pt-24 text-center" role="alert">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-accent/10 text-accent">
        <AlertTriangle className="h-8 w-8" aria-hidden />
      </div>
      <h1 className="mt-6 font-display text-2xl font-bold uppercase">Engine trouble</h1>
      <p className="mt-2 max-w-md text-muted">Something went wrong loading this page. It&apos;s not you, it&apos;s us.</p>
      <div className="mt-8 flex gap-3">
        <button type="button" onClick={reset} className="rounded-xl bg-accent px-6 py-3 font-semibold text-white hover:shadow-glow">
          Try again
        </button>
        <Link href="/" className="rounded-xl border border-line px-6 py-3 font-semibold hover:border-accent">
          Back to home
        </Link>
      </div>
    </div>
  );
}
