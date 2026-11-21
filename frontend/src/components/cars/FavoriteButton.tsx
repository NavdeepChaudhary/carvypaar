"use client";

import { clsx } from "clsx";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";
import { toast } from "sonner";

import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api";
import { listingsApi } from "@/lib/listings";

/** Optimistic heart toggle. Signed-out users are sent to login. */
export function FavoriteButton({
  listingId,
  initial,
  onChange,
  className,
  size = "md",
  variant = "overlay",
}: {
  listingId: number;
  initial: boolean;
  onChange?: (fav: boolean) => void;
  className?: string;
  size?: "md" | "lg";
  /** overlay: translucent, for use on photos. solid: for use on cards/panels. */
  variant?: "overlay" | "solid";
}) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [fav, setFav] = useState(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => setFav(initial), [initial]);

  const toggle = async (e: MouseEvent) => {
    e.preventDefault(); // cards wrap this in a link
    e.stopPropagation();
    if (!user) {
      toast("Sign in to save cars to your garage");
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (busy) return;
    const next = !fav;
    setFav(next);
    setBusy(true);
    try {
      await (next ? listingsApi.favorite(listingId) : listingsApi.unfavorite(listingId));
      onChange?.(next);
      if (next) toast.success("Saved to your garage");
    } catch (err) {
      setFav(!next); // roll back
      toast.error(err instanceof ApiError ? err.message : "Couldn't update favorites");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.button
      type="button"
      onClick={toggle}
      whileTap={{ scale: 0.8 }}
      aria-pressed={fav}
      aria-label={fav ? "Remove from saved cars" : "Save car"}
      className={clsx(
        "grid place-items-center rounded-full border backdrop-blur-md transition-colors",
        size === "lg" ? "h-12 w-12" : "h-10 w-10",
        fav
          ? "border-accent bg-accent text-white shadow-glow"
          : variant === "overlay"
            ? "border-white/20 bg-black/40 text-white hover:border-accent"
            : "border-line bg-elevated text-fg hover:border-accent hover:text-accent",
        className,
      )}
    >
      <Heart className={clsx(size === "lg" ? "h-5 w-5" : "h-4 w-4", fav && "fill-current")} aria-hidden />
    </motion.button>
  );
}
