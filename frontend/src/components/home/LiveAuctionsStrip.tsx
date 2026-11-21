"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AuctionCard, AuctionCardSkeleton } from "@/components/auctions/AuctionCard";
import { auctionsApi } from "@/lib/auctions";
import type { AuctionCard as AuctionCardData } from "@/lib/types";

/** "Ending soon" auctions on the homepage; renders nothing when none are live. */
export function LiveAuctionsStrip() {
  const [items, setItems] = useState<AuctionCardData[] | null>(null);

  useEffect(() => {
    auctionsApi.list("live", 1, 3).then((p) => setItems(p.items)).catch(() => setItems([]));
  }, []);

  if (items !== null && items.length === 0) return null;

  return (
    <section className="container-page pt-20" aria-labelledby="live-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent">
            <span className="h-2 w-2 animate-ping rounded-full bg-accent" aria-hidden /> Live now
          </p>
          <h2 id="live-heading" className="mt-3 font-display text-3xl font-black uppercase sm:text-4xl">Ending soon</h2>
        </div>
        <Link href="/auctions" className="text-sm font-semibold text-accent hover:underline">All auctions →</Link>
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items === null
          ? Array.from({ length: 3 }, (_, i) => <AuctionCardSkeleton key={i} />)
          : items.map((item, i) => <AuctionCard key={item.auction.id} data={item} index={i} />)}
      </div>
    </section>
  );
}
