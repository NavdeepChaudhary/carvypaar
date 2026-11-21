"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/context/AuthContext";
import type { UserRole } from "@/lib/types";

/**
 * Redirect to /login (with ?next=) when signed out. If `roles` is given and the
 * user lacks one, redirect to `fallback`. Returns the auth state; render a
 * skeleton while `ready` is false.
 */
export function useRequireAuth(roles?: UserRole[], fallback = "/") {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const allowed = !!user && (!roles || roles.includes(user.role));

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (!allowed) router.replace(fallback);
  }, [loading, user, allowed, router, pathname, fallback]);

  return { user, ready: !loading && allowed };
}
