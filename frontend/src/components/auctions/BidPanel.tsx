"use client";

import { clsx } from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, Gavel, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/format";
import type { AuctionState, User } from "@/lib/types";

interface BidPanelProps {
  auction: AuctionState;
  user: User | null;
  isSeller: boolean;
  myMaxBid: number | null;
  onBid: (amount: number) => Promise<void>;
}

/** Current bid, reserve status, quick-bid chips and a custom amount field. */
export function BidPanel({ auction, user, isSeller, myMaxBid, onBid }: BidPanelProps) {
  const pathname = usePathname();
  const [amount, setAmount] = useState(String(auction.min_next_bid));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = auction.status === "live";
  const leading = !!user && auction.leading_bidder_id === user.id;
  const price = auction.current_price ?? auction.starting_price;

  // When someone else bids, bump the field up to the new minimum.
  useEffect(() => {
    setAmount((a) => (Number(a) < auction.min_next_bid ? String(auction.min_next_bid) : a));
  }, [auction.min_next_bid]);

  const quick = [0, 1, 4].map((k) => auction.min_next_bid + k * auction.bid_increment);

  const submit = async (value: number) => {
    setError(null);
    if (!Number.isFinite(value) || value < auction.min_next_bid) {
      setError(`Minimum bid is ${formatPrice(auction.min_next_bid)}`);
      return;
    }
    setSubmitting(true);
    try {
      await onBid(value);
      toast.success(`Bid placed: ${formatPrice(value)}. You're in the lead!`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bid failed";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(Math.round(Number(amount)));
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          {auction.current_price ? "Current bid" : "Starting bid"}
        </p>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p
            key={price}
            initial={{ y: 24, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className="font-display text-4xl font-black text-accent [text-shadow:0_0_24px_rgba(255,31,61,0.45)]"
            aria-live="polite"
          >
            {formatPrice(price)}
          </motion.p>
        </AnimatePresence>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1"><Gavel className="h-3.5 w-3.5" aria-hidden /> {auction.bid_count} bids</span>
          <span>Increment {formatPrice(auction.bid_increment)}</span>
          {auction.has_reserve && (
            <span className={clsx("flex items-center gap-1 font-semibold", auction.reserve_met ? "text-emerald-400" : "text-amber-400")}>
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> {auction.reserve_met ? "Reserve met" : "Reserve not met"}
            </span>
          )}
          {!auction.has_reserve && <span className="font-semibold text-emerald-400">No reserve</span>}
        </div>
      </div>

      {leading && live && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-400">
          <Crown className="h-5 w-5" aria-hidden /> You&apos;re the highest bidder
        </motion.div>
      )}
      {!leading && myMaxBid !== null && live && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm font-semibold text-amber-400">
          You&apos;ve been outbid (your max {formatPrice(myMaxBid)}). Bid again!
        </div>
      )}

      {!live ? (
        <p className="rounded-xl bg-elevated p-4 text-center text-sm text-muted">
          {auction.status === "scheduled" ? "Bidding opens when the countdown ends." : "Bidding is closed."}
        </p>
      ) : !user ? (
        <Link href={`/login?next=${encodeURIComponent(pathname)}`}
          className="flex h-14 items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-white hover:shadow-glow">
          <Lock className="h-4 w-4" aria-hidden /> Sign in to bid
        </Link>
      ) : isSeller ? (
        <p className="rounded-xl bg-elevated p-4 text-center text-sm text-muted">This is your car. Sit back and watch the bids roll in.</p>
      ) : leading ? null : (
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Quick bids">
            {quick.map((q) => (
              <button key={q} type="button" disabled={submitting} onClick={() => void submit(q)}
                className="rounded-xl border border-line px-2 py-2.5 text-xs font-bold transition-all hover:border-accent hover:bg-accent/10 hover:text-accent disabled:opacity-50">
                {formatPrice(q)}
              </button>
            ))}
          </div>
          <div>
            <label htmlFor="bid-amount" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Your bid (min {formatPrice(auction.min_next_bid)})
            </label>
            <div className="flex gap-2">
              <input
                id="bid-amount"
                type="number"
                inputMode="numeric"
                min={auction.min_next_bid}
                step={auction.bid_increment}
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setError(null); }}
                aria-invalid={!!error || undefined}
                aria-describedby={error ? "bid-error" : undefined}
                className={clsx("h-14 flex-1 rounded-xl border bg-elevated/60 px-4 font-display text-lg font-bold focus:outline-none focus:ring-2 focus:ring-accent/30",
                  error ? "border-accent" : "border-line focus:border-accent")}
              />
              <Button type="submit" size="lg" loading={submitting} className="shrink-0">
                <Gavel className="h-5 w-5" aria-hidden /> Bid
              </Button>
            </div>
            {error && <p id="bid-error" role="alert" className="mt-2 text-xs text-accent">{error}</p>}
          </div>
          <p className="text-[11px] leading-relaxed text-muted">
            Bids are binding. A bid in the final 2 minutes extends the auction by 2 minutes, so no last-second sniping.
          </p>
        </form>
      )}
    </div>
  );
}
