"use client";

import { clsx } from "clsx";
import { Gavel } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Countdown } from "@/components/auctions/Countdown";
import { CarImage } from "@/components/cars/CarImage";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { auctionsApi, parseUtc } from "@/lib/auctions";
import { formatPrice } from "@/lib/format";
import type { BidOutcome, MyBid } from "@/lib/types";

const OUTCOME: Record<BidOutcome, { label: string; className: string }> = {
  leading: { label: "Winning", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  outbid: { label: "Outbid", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  won: { label: "Won 🏆", className: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" },
  lost: { label: "Lost", className: "bg-muted/15 text-muted" },
  upcoming: { label: "Upcoming", className: "bg-neon/15 text-neon" },
  cancelled: { label: "Cancelled", className: "bg-muted/15 text-muted" },
};

export function MyBidsTab() {
  const [items, setItems] = useState<MyBid[] | null>(null);

  useEffect(() => {
    auctionsApi.mine().then(setItems).catch(() => setItems([]));
  }, []);

  // Active auctions first (ending soonest), then finished ones.
  const sorted = useMemo(() => {
    if (!items) return null;
    const active = items.filter((i) => i.outcome === "leading" || i.outcome === "outbid" || i.outcome === "upcoming");
    const done = items.filter((i) => !active.includes(i));
    active.sort((a, b) => parseUtc(a.auction.end_time) - parseUtc(b.auction.end_time));
    return [...active, ...done];
  }, [items]);

  if (!sorted) return <div className="space-y-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>;
  if (!sorted.length) {
    return (
      <EmptyState icon={Gavel} title="No bids yet" body="Join a live auction and your bids will show up here."
        action={<Link href="/auctions" className="rounded-xl bg-accent px-6 py-3 font-semibold text-on-accent hover:shadow-glow">See live auctions</Link>} />
    );
  }

  return (
    <ul className="space-y-3">
      {sorted.map(({ auction, listing, my_max_bid, outcome }) => {
        const o = OUTCOME[outcome];
        const running = outcome === "leading" || outcome === "outbid";
        const offset = parseUtc(auction.server_time) - Date.now();
        return (
          <li key={auction.id}>
            <Link href={`/auctions/${auction.id}`}
              className="glass flex flex-col gap-4 rounded-2xl p-4 transition-colors hover:border-accent/50 sm:flex-row sm:items-center">
              <CarImage src={listing.cover_image} alt={listing.title} className="h-16 w-24 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{listing.title}</p>
                <p className="text-xs text-muted">
                  Your max {formatPrice(my_max_bid)} · {auction.current_price ? `Top bid ${formatPrice(auction.current_price)}` : "No bids"}
                </p>
              </div>
              {running && <Countdown targetMs={parseUtc(auction.end_time)} offsetMs={offset} size="sm" />}
              <span className={clsx("w-fit rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider", o.className)}>{o.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
