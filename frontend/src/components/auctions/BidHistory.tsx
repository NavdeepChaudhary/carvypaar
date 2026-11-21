"use client";

import { clsx } from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, Gavel } from "lucide-react";

import { formatPrice, timeAgo } from "@/lib/format";
import type { Bid } from "@/lib/types";

/** Newest/highest bid first; new bids slide in. */
export function BidHistory({ bids, meId }: { bids: Bid[]; meId?: number }) {
  if (!bids.length) {
    return (
      <div className="flex flex-col items-center py-10 text-center text-sm text-muted">
        <Gavel className="mb-3 h-8 w-8 opacity-40" aria-hidden />
        No bids yet. Be the first!
      </div>
    );
  }
  return (
    <ol className="space-y-2" aria-label="Bid history">
      <AnimatePresence initial={false}>
        {bids.map((b, i) => {
          const mine = b.bidder.id === meId;
          return (
            <motion.li
              key={b.id}
              layout
              initial={{ opacity: 0, x: -24, backgroundColor: "rgba(255,31,61,0.25)" }}
              animate={{ opacity: 1, x: 0, backgroundColor: "rgba(0,0,0,0)" }}
              transition={{ duration: 0.6 }}
              className={clsx(
                "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
                i === 0 ? "border-accent/50" : "border-line/60",
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className={clsx("grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold",
                  i === 0 ? "bg-accent text-white shadow-glow" : "bg-elevated text-muted")}>
                  {i === 0 ? <Crown className="h-4 w-4" aria-label="Leading bid" /> : bids.length - i}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {b.bidder.display_name}{mine && <span className="ml-2 text-xs text-accent">(you)</span>}
                  </p>
                  <p className="text-xs text-muted">{timeAgo(b.created_at)}</p>
                </div>
              </div>
              <p className={clsx("font-display font-bold tabular-nums", i === 0 && "text-accent")}>{formatPrice(b.amount)}</p>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
