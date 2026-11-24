"use client";

import { clsx } from "clsx";
import { Gavel, KeyRound, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import {
  AuctionSettings,
  DEFAULT_AUCTION_SETTINGS,
  buildAuction,
  type AuctionErrors,
  type AuctionSettingsValue,
} from "@/components/auctions/AuctionSettings";
import { ListingForm } from "@/components/cars/ListingForm";
import { LocalPhotoPicker } from "@/components/cars/PhotoManager";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/AuthContext";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { ApiError } from "@/lib/api";
import { auctionsApi } from "@/lib/auctions";
import { listingsApi } from "@/lib/listings";
import type { AuctionCreate, ListingInput } from "@/lib/types";

type SaleMode = "sale" | "auction";

export default function SellPage() {
  const { user, ready } = useRequireAuth();
  const { becomeSeller } = useAuth();
  const router = useRouter();
  const [photos, setPhotos] = useState<File[]>([]);
  const [upgrading, setUpgrading] = useState(false);
  const [mode, setMode] = useState<SaleMode>("sale");
  const [auctionSettings, setAuctionSettings] = useState<AuctionSettingsValue>(DEFAULT_AUCTION_SETTINGS);
  const [auctionErrors, setAuctionErrors] = useState<AuctionErrors>({});
  const [price, setPrice] = useState(0);
  const onPriceChange = useCallback((p: number) => setPrice(p), []);

  if (!ready || !user) {
    return (
      <div className="container-page space-y-6 pb-20 pt-10" aria-busy="true">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (user.role === "buyer") {
    const upgrade = async () => {
      setUpgrading(true);
      try {
        await becomeSeller();
        toast.success("You're now a seller. Let's list your car!");
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Couldn't upgrade your account");
      } finally {
        setUpgrading(false);
      }
    };
    return (
      <div className="container-page pb-20 pt-10">
        <EmptyState
          icon={KeyRound}
          title="Switch to a seller account"
          body="Your account is set up for buying. Turn on selling to list or auction cars; you can still browse, save, bid and make offers."
          action={<Button size="lg" onClick={upgrade} loading={upgrading}>Enable selling</Button>}
        />
      </div>
    );
  }

  /** Runs before the listing is created, so a bad auction setup never leaves a stray listing. */
  const beforeSubmit = (data: ListingInput): boolean => {
    if (mode !== "auction") return true;
    const { payload, errors } = buildAuction(auctionSettings, data.price);
    setAuctionErrors(errors);
    if (!payload) {
      toast.error("Check the auction settings");
      document.getElementById("auction-heading")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    return true;
  };

  const onSubmit = async (data: ListingInput) => {
    // Built here (already validated in beforeSubmit) so the end time is measured from "now".
    const auction: AuctionCreate | null = mode === "auction" ? buildAuction(auctionSettings, data.price).payload ?? null : null;

    let listingId: number;
    let pending = false;
    try {
      const created = await listingsApi.create(data);
      listingId = created.id;
      pending = created.status === "pending";
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't create your listing");
      return;
    }

    if (photos.length) {
      const toastId = toast.loading(`Uploading ${photos.length} photo${photos.length === 1 ? "" : "s"}…`);
      try {
        await listingsApi.uploadImages(listingId, photos);
        toast.dismiss(toastId);
      } catch (err) {
        toast.error(`Listing saved, but photos failed: ${err instanceof ApiError ? err.message : "upload error"}`, { id: toastId });
        router.push(`/cars/${listingId}/edit`);
        return;
      }
    }

    if (auction) {
      try {
        const created = await auctionsApi.create(listingId, auction);
        toast.success(pending ? "Auction submitted for review. It goes live once approved."
          : created.auction.status === "live" ? "Your auction is live! 🔨" : "Auction scheduled!");
        router.push(`/auctions/${created.auction.id}`);
        return;
      } catch (err) {
        toast.error(`Listing saved, but the auction couldn't start: ${err instanceof ApiError ? err.message : "error"}`);
        router.push(`/cars/${listingId}`);
        return;
      }
    }

    toast.success(pending ? "Submitted for review! We'll notify you when it's live (usually within a few hours)."
      : photos.length ? "Listing published!" : "Listing published! Add photos anytime from the editor.");
    router.push(`/cars/${listingId}`);
  };

  return (
    <div className="container-page max-w-4xl pb-20 pt-10">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ink">Sell your car</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold uppercase sm:text-4xl">Create a listing</h1>
      <p className="mt-2 text-sm text-muted">Great photos and an honest description sell cars faster.</p>

      <div className="mt-8 grid grid-cols-2 gap-3" role="radiogroup" aria-label="How do you want to sell?">
        {([
          { id: "sale", icon: Tag, title: "Fixed price", body: "Set your price; buyers make offers." },
          { id: "auction", icon: Gavel, title: "Auction", body: "Live bidding with a countdown." },
        ] as const).map(({ id, icon: Icon, title, body }) => (
          <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => setMode(id)}
            className={clsx("glass rounded-2xl p-5 text-left transition-all",
              mode === id ? "border-accent shadow-glow" : "hover:border-accent/50")}>
            <Icon className={clsx("h-6 w-6", mode === id ? "text-ink" : "text-muted")} aria-hidden />
            <p className="mt-3 font-display font-bold uppercase tracking-wide">{title}</p>
            <p className="mt-1 text-xs text-muted">{body}</p>
          </button>
        ))}
      </div>

      <div className="mt-6">
        <ListingForm
          submitLabel={mode === "auction" ? "Publish & start auction" : "Publish listing"}
          priceLabel={mode === "auction" ? "Starting bid (₹)" : "Asking price (₹)"}
          onPriceChange={onPriceChange}
          beforeSubmit={beforeSubmit}
          onSubmit={onSubmit}
          extra={
            <>
              {mode === "auction" && (
                <AuctionSettings value={auctionSettings} onChange={setAuctionSettings} errors={auctionErrors} startingPrice={price} />
              )}
              <section className="glass space-y-5 rounded-2xl p-6" aria-labelledby="photos-heading">
                <div>
                  <h2 id="photos-heading" className="font-display text-lg font-bold uppercase tracking-wide">Photos</h2>
                  <p className="mt-1 text-sm text-muted">Up to 10. The first photo is the cover; use the arrows to reorder.</p>
                </div>
                <LocalPhotoPicker files={photos} onChange={setPhotos} />
              </section>
            </>
          }
        />
      </div>
    </div>
  );
}
