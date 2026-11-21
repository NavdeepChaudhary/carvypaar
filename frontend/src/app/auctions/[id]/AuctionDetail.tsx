"use client";

import { clsx } from "clsx";
import { motion } from "framer-motion";
import { ArrowLeft, Ban, Eye, Gavel, PartyPopper, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BidHistory } from "@/components/auctions/BidHistory";
import { BidPanel } from "@/components/auctions/BidPanel";
import { Countdown } from "@/components/auctions/Countdown";
import { FavoriteButton } from "@/components/cars/FavoriteButton";
import { Gallery } from "@/components/cars/Gallery";
import { PriceInsightPanel } from "@/components/price/PriceInsightPanel";
import { CarDetails } from "@/components/cars/SpecGrid";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/AuthContext";
import { useLiveAuction } from "@/hooks/useLiveAuction";
import { ApiError } from "@/lib/api";
import { auctionsApi, parseUtc } from "@/lib/auctions";
import { formatPrice } from "@/lib/format";
import type { AuctionDetail } from "@/lib/types";

function LiveAuction({ initial }: { initial: AuctionDetail }) {
  const { user } = useAuth();
  const { auction, bids, clockOffset, extendedAt, myMaxBid, connection, placeBid } = useLiveAuction(initial);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const car = initial.listing;
  const isSeller = initial.is_seller;
  const live = auction.status === "live";
  const upcoming = auction.status === "scheduled";
  const ended = auction.status === "ended" || auction.status === "cancelled";
  const iWon = !!user && auction.winner_id === user.id;

  useEffect(() => {
    document.title = `${live ? "🔴 LIVE · " : ""}${car.title} auction · CarvyPaar`;
  }, [live, car.title]);

  // Celebrate (once) when the auction closes with this user as the winner.
  const [celebrated, setCelebrated] = useState(false);
  useEffect(() => {
    if (iWon && auction.status === "ended" && !celebrated) {
      setCelebrated(true);
      toast.success("🏆 You won this auction!");
    }
  }, [iWon, auction.status, celebrated]);

  const cancel = async () => {
    setCancelling(true);
    try {
      await auctionsApi.cancel(auction.id);
      toast.success("Auction cancelled");
      setCancelOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't cancel");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="container-page pb-20 pt-28">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/auctions" className="inline-flex items-center gap-2 text-sm text-muted hover:text-accent">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All auctions
        </Link>
        <span className={clsx("flex items-center gap-1.5 text-xs font-semibold",
          connection === "open" ? "text-emerald-400" : "text-amber-400")} role="status">
          {connection === "open" ? <Wifi className="h-3.5 w-3.5" aria-hidden /> : <WifiOff className="h-3.5 w-3.5" aria-hidden />}
          {connection === "open" ? "Live updates on" : connection === "closed" ? "Live updates unavailable" : "Reconnecting…"}
        </span>
      </div>

      {ended && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className={clsx("mb-6 flex items-center gap-4 rounded-2xl border p-5",
            iWon ? "border-emerald-500/50 bg-emerald-500/10" : "border-line bg-elevated/60")}>
          {iWon ? <PartyPopper className="h-8 w-8 shrink-0 text-emerald-400" aria-hidden />
            : auction.status === "cancelled" ? <Ban className="h-8 w-8 shrink-0 text-muted" aria-hidden />
            : <Gavel className="h-8 w-8 shrink-0 text-accent" aria-hidden />}
          <div>
            <p className="font-display text-lg font-bold uppercase">
              {auction.status === "cancelled" ? "Auction cancelled"
                : iWon ? "You won!"
                : auction.winner_id ? `Sold for ${formatPrice(auction.final_price ?? 0)}`
                : "Ended without a sale"}
            </p>
            <p className="text-sm text-muted">
              {iWon ? "The seller will contact you to arrange payment and handover."
                : auction.status === "ended" && !auction.winner_id
                  ? auction.bid_count ? "The reserve price wasn't met." : "No bids were placed."
                  : isSeller && auction.winner_id ? "Check your notifications for the buyer's details." : ""}
            </p>
          </div>
        </motion.div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-8">
          <Gallery images={car.images} title={car.title} />
          <CarDetails car={car} />
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:h-fit">
          <div className={clsx("glass relative overflow-hidden rounded-2xl p-6", live && "border-accent/50 shadow-glow")}>
            <div className="neon-line absolute inset-x-6 top-0" aria-hidden />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                  {live && <span className="h-2 w-2 animate-ping rounded-full bg-accent" aria-hidden />}
                  {live ? "Live auction" : upcoming ? "Upcoming auction" : "Auction"}
                </p>
                <h1 className="mt-2 font-display text-2xl font-black leading-tight">{car.title}</h1>
              </div>
              <FavoriteButton listingId={car.id} initial={car.is_favorite} variant="solid" size="lg" className="shrink-0" />
            </div>

            {!ended && (
              <div className="mt-6 rounded-xl border border-line/60 bg-black/20 p-4">
                <Countdown
                  targetMs={parseUtc(upcoming ? auction.start_time : auction.end_time)}
                  offsetMs={clockOffset}
                  size="lg"
                  extendedAt={extendedAt}
                  label={upcoming ? "Bidding opens in" : "Time left"}
                />
                {auction.extended && live && (
                  <p className="mt-2 text-xs text-muted">Extended by anti-sniping protection</p>
                )}
              </div>
            )}

            <div className="mt-6">
              <BidPanel auction={auction} user={user} isSeller={isSeller} myMaxBid={myMaxBid} onBid={placeBid} />
            </div>

            <p className="mt-5 flex items-center gap-1.5 border-t border-line/60 pt-4 text-xs text-muted">
              <Eye className="h-3.5 w-3.5" aria-hidden /> {initial.watchers + (connection === "open" ? 1 : 0)} watching · Seller: {car.seller.full_name}
            </p>
            {isSeller && !ended && auction.bid_count === 0 && (
              <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setCancelOpen(true)}>
                Cancel auction
              </Button>
            )}
          </div>

          {car.price_insight && (
            <PriceInsightPanel insight={car.price_insight} askingPrice={auction.current_price ?? auction.starting_price} isAuction />
          )}

          <div className="glass rounded-2xl p-6">
            <h2 className="mb-4 flex items-center justify-between font-display text-sm font-bold uppercase tracking-wide">
              Bid history <span className="text-xs font-normal normal-case text-muted">{auction.bid_count} total</span>
            </h2>
            <BidHistory bids={bids} meId={user?.id} />
          </div>
        </aside>
      </div>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this auction?"
        description="The car will be hidden and turned back into a fixed-price listing you can relist.">
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setCancelOpen(false)}>Keep it running</Button>
          <Button onClick={cancel} loading={cancelling}>Cancel auction</Button>
        </div>
      </Modal>
    </div>
  );
}

export default function AuctionPage() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = Number(rawId);
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [detail, setDetail] = useState<AuctionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!Number.isInteger(id) || id < 1) {
      setError("Auction not found");
      return;
    }
    auctionsApi.get(id).then(setDetail).catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load auction"));
  }, [id, authLoading, userId]);

  if (error) {
    return (
      <div className="container-page pb-20 pt-28">
        <EmptyState icon={Gavel} title="Auction not found" body="It may have been cancelled or removed."
          action={<Link href="/auctions" className="rounded-xl bg-accent px-6 py-3 font-semibold text-white">See live auctions</Link>} />
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="container-page grid gap-8 pb-20 pt-28 lg:grid-cols-[1fr_400px]" aria-busy="true" aria-label="Loading auction">
        <Skeleton className="aspect-[16/10] rounded-3xl" />
        <Skeleton className="h-[32rem] rounded-2xl" />
      </div>
    );
  }
  // key: remount live state if the signed-in user changes (is_seller, my bids differ).
  return <LiveAuction key={`${detail.auction.id}:${userId}`} initial={detail} />;
}
