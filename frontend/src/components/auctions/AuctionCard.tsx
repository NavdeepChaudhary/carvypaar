"use client";

import { clsx } from "clsx";
import { motion } from "framer-motion";
import { Gavel, MapPin } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { CarImage } from "@/components/cars/CarImage";
import { FavoriteButton } from "@/components/cars/FavoriteButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { parseUtc } from "@/lib/auctions";
import { formatKm, formatPrice } from "@/lib/format";
import type { AuctionCard as AuctionCardData } from "@/lib/types";

import { Countdown } from "./Countdown";

export function AuctionCard({ data, index = 0 }: { data: AuctionCardData; index?: number }) {
  const { auction, listing } = data;
  // Clock skew between this browser and the server, measured when the data arrived.
  const offset = useMemo(() => parseUtc(auction.server_time) - Date.now(), [auction.server_time]);
  const live = auction.status === "live";
  const upcoming = auction.status === "scheduled";
  const ended = auction.status === "ended";

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.05, duration: 0.4 }}
      className={clsx(
        "glass group relative overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1",
        live ? "border-accent/40 animate-pulse-glow hover:border-accent" : "hover:border-accent/50 hover:shadow-glow",
      )}
    >
      <Link href={`/auctions/${auction.id}`} className="block">
        <div className="relative aspect-[16/10] overflow-hidden">
          <CarImage src={listing.cover_image} alt={listing.title}
            className={clsx("h-full w-full transition-transform duration-700 group-hover:scale-110", ended && "grayscale-[60%]")} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" aria-hidden />
          <span className={clsx(
            "absolute left-3 top-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider",
            live ? "bg-accent text-on-accent" : upcoming ? "bg-neon/20 text-neon backdrop-blur" : "bg-black/60 text-on-accent/80 backdrop-blur",
          )}>
            {live && <span className="h-1.5 w-1.5 animate-ping rounded-full bg-white" aria-hidden />}
            {live ? "Live" : upcoming ? "Upcoming" : auction.winner_id ? "Sold" : "Ended"}
          </span>
          <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
            {!ended ? (
              <Countdown
                targetMs={parseUtc(upcoming ? auction.start_time : auction.end_time)}
                offsetMs={offset}
                size="sm"
                label={upcoming ? "Starts in" : "Ends in"}
              />
            ) : (
              <span className="text-xs font-semibold uppercase tracking-wider text-white/70">
                {auction.winner_id ? "Hammer down" : auction.bid_count ? "Reserve not met" : "No bids"}
              </span>
            )}
          </div>
        </div>
        <div className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink">{listing.year} · {listing.make}</p>
          <h3 className="mt-1 line-clamp-1 font-semibold" title={listing.title}>{listing.title}</h3>
          <div className="mt-4 flex items-end justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                {ended ? (auction.final_price ? "Sold for" : "High bid") : auction.current_price ? "Current bid" : "Starting bid"}
              </p>
              <p className="font-display text-xl font-extrabold">
                {formatPrice(auction.final_price ?? auction.current_price ?? auction.starting_price)}
              </p>
            </div>
            <p className="flex items-center gap-1 text-xs text-muted">
              <Gavel className="h-3.5 w-3.5" aria-hidden /> {auction.bid_count} bid{auction.bid_count === 1 ? "" : "s"}
            </p>
          </div>
          <p className="mt-3 flex items-center gap-3 border-t border-line/60 pt-3 text-xs text-muted">
            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden /> {listing.location}</span>
            <span>{formatKm(listing.mileage)}</span>
          </p>
        </div>
      </Link>
      <FavoriteButton listingId={listing.id} initial={listing.is_favorite} className="absolute right-3 top-3" />
    </motion.article>
  );
}

export function AuctionCardSkeleton() {
  return (
    <div className="glass overflow-hidden rounded-2xl" aria-hidden>
      <Skeleton className="aspect-[16/10] rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-7 w-1/2" />
      </div>
    </div>
  );
}
