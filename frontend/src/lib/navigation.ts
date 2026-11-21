/** Only allow same-origin relative redirects (prevents open-redirect via ?next=). */
export function safeNext(next: string | null | undefined, fallback = "/profile"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/**
 * Navigate after signing in. Uses the client router, but falls back to a full page load
 * if the route hasn't changed shortly after. That happens when a tab is running an older
 * build of the app (e.g. after a redeploy or dev-server restart): the router fetches the
 * new page but can't apply it, leaving the user stuck on the sign-in form.
 */
export function navigateAfterAuth(router: { replace: (href: string) => void }, href: string, fromPath: string): void {
  router.replace(href);
  window.setTimeout(() => {
    if (window.location.pathname === fromPath) window.location.assign(href);
  }, 1500);
}
