"use client";

import { useEffect, useState } from "react";

import { CountUp } from "@/components/CountUp";
import { Skeleton } from "@/components/ui/Skeleton";
import { statsApi } from "@/lib/admin";
import type { PublicStats } from "@/lib/types";

const ITEMS: { key: keyof PublicStats; label: string }[] = [
  { key: "active_listings", label: "Cars for sale" },
  { key: "live_auctions", label: "Live auctions" },
  { key: "auctions_closed", label: "Auctions closed" },
  { key: "members", label: "Members" },
];

/** Homepage counters from live marketplace data (hidden if the API is unreachable). */
export function LiveStats() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    statsApi.public().then(setStats).catch(() => setFailed(true));
  }, []);

  if (failed) return null;

  return (
    <section id="stats" className="container-page pt-12" aria-label="Marketplace stats">
      <div className="grid grid-cols-2 gap-6 rounded-2xl bg-navy p-6 text-white sm:p-8 lg:grid-cols-4">
        {ITEMS.map(({ key, label }) => (
          <div key={key} className="text-center">
            {/* div, not p: the skeleton is a block element (a <div> inside <p> breaks hydration) */}
            <div className="font-display text-3xl font-extrabold text-accent sm:text-4xl">
              {stats ? <CountUp value={stats[key]} /> : <Skeleton className="mx-auto h-10 w-20" />}
            </div>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/65">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
