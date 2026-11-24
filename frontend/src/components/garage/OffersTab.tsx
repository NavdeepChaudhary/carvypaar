"use client";

import { clsx } from "clsx";
import { HandCoins } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CarImage } from "@/components/cars/CarImage";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError } from "@/lib/api";
import { formatPrice, timeAgo } from "@/lib/format";
import { offersApi } from "@/lib/listings";
import type { Offer, OfferStatus } from "@/lib/types";

const STATUS: Record<OfferStatus, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  accepted: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  rejected: "bg-accent/15 text-ink",
  withdrawn: "bg-muted/15 text-muted",
};

export function OffersTab() {
  const [box, setBox] = useState<"received" | "sent">("received");
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    setOffers(null);
    offersApi.list(box).then(setOffers).catch(() => setOffers([]));
  }, [box]);

  const act = async (offer: Offer, status: "accepted" | "rejected" | "withdrawn") => {
    setBusyId(offer.id);
    try {
      const updated = await offersApi.setStatus(offer.id, status);
      setOffers((list) => list?.map((o) => (o.id === offer.id ? updated : o)) ?? null);
      toast.success(`Offer ${status === "rejected" ? "declined" : status}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update offer");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-5 inline-flex rounded-xl border border-line p-1" role="tablist" aria-label="Offer box">
        {(["received", "sent"] as const).map((b) => (
          <button key={b} type="button" role="tab" aria-selected={box === b} onClick={() => setBox(b)}
            className={clsx("rounded-lg px-4 py-2 text-sm font-semibold capitalize transition-colors",
              box === b ? "bg-accent text-on-accent" : "text-muted hover:text-fg")}>
            {b}
          </button>
        ))}
      </div>

      {!offers ? (
        <div className="space-y-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : !offers.length ? (
        <EmptyState icon={HandCoins} title={box === "received" ? "No offers yet" : "You haven't made any offers"}
          body={box === "received" ? "Offers buyers make on your cars show up here." : "Find a car you love and make an offer."} />
      ) : (
        <ul className="space-y-3">
          {offers.map((o) => {
            const pct = Math.round((o.amount / o.listing_price) * 100);
            return (
              <li key={o.id} className="glass flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center">
                <Link href={`/cars/${o.listing_id}`} className="flex min-w-0 flex-1 items-center gap-4">
                  <CarImage src={o.cover_image} alt={o.listing_title} className="h-16 w-24 shrink-0 rounded-xl" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold hover:text-ink">{o.listing_title}</p>
                    <p className="text-xs text-muted">
                      {box === "received" ? `From ${o.buyer.full_name} · ` : ""}{timeAgo(o.created_at)}
                    </p>
                    {o.message && <p className="mt-1 line-clamp-2 text-sm text-fg/80">“{o.message}”</p>}
                  </div>
                </Link>
                <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-1">
                  <p className="font-display text-lg font-extrabold text-ink">{formatPrice(o.amount)}</p>
                  <p className="text-xs text-muted">{pct}% of {formatPrice(o.listing_price)}</p>
                  <span className={clsx("rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider", STATUS[o.status])}>
                    {o.status}
                  </span>
                </div>
                {o.status === "pending" && (
                  <div className="flex gap-2">
                    {box === "received" ? (
                      <>
                        <Button size="sm" loading={busyId === o.id} onClick={() => act(o, "accepted")}>Accept</Button>
                        <Button size="sm" variant="outline" disabled={busyId === o.id} onClick={() => act(o, "rejected")}>Decline</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" loading={busyId === o.id} onClick={() => act(o, "withdrawn")}>Withdraw</Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
