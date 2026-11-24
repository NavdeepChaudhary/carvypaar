"use client";

import { clsx } from "clsx";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Car,
  Eye,
  Heart,
  HandCoins,
  MapPin,
  MessageSquare,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { FavoriteButton } from "@/components/cars/FavoriteButton";
import { Gallery } from "@/components/cars/Gallery";
import { Spin360 } from "@/components/cars/Spin360";
import { PriceBadge } from "@/components/price/PriceBadge";
import { PriceInsightPanel } from "@/components/price/PriceInsightPanel";
import { CarDetails } from "@/components/cars/SpecGrid";
import { ContactSellerModal, MakeOfferModal } from "@/components/cars/ListingActionsModals";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api";
import {
  STATUS_STYLES,
} from "@/lib/constants";
import { formatNumber, formatPrice, timeAgo } from "@/lib/format";
import { listingsApi } from "@/lib/listings";
import type { ListingDetail } from "@/lib/types";

function DetailSkeleton() {
  return (
    <div className="container-page grid gap-8 pb-20 pt-10 lg:grid-cols-[1fr_380px]" aria-busy="true" aria-label="Loading car">
      <div className="space-y-4">
        <Skeleton className="aspect-[16/10] rounded-3xl" />
        <div className="flex gap-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 w-28 rounded-xl" />)}</div>
        <Skeleton className="h-48 rounded-2xl" />
      </div>
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  );
}

export default function CarDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();

  const [car, setCar] = useState<ListingDetail | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [offerOpen, setOfferOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [view, setView] = useState<"photos" | "spin">("photos");

  useEffect(() => {
    if (authLoading) return; // owners/admins can see hidden listings once signed in
    if (!Number.isInteger(id) || id < 1) {
      setError({ status: 404, message: "Listing not found" });
      return;
    }
    listingsApi
      .get(id)
      .then(setCar)
      .catch((err) =>
        setError(err instanceof ApiError ? { status: err.status, message: err.message } : { status: 0, message: "Couldn't load this car" }),
      );
  }, [id, authLoading]);

  // Cars being auctioned live on the auction page.
  useEffect(() => {
    if (car?.auction_id && car.listing_type === "auction") router.replace(`/auctions/${car.auction_id}`);
  }, [car, router]);

  useEffect(() => {
    if (car) document.title = `${car.title} · CarvyPaar`;
  }, [car]);

  if (error) {
    return (
      <div className="container-page pb-20 pt-10">
        <EmptyState
          icon={Car}
          title={error.status === 404 ? "This car has left the lot" : "Something went wrong"}
          body={error.status === 404 ? "It may have been sold or removed by the seller." : error.message}
          action={<Link href="/cars" className="rounded-xl bg-accent px-6 py-3 font-semibold text-on-accent">Browse cars</Link>}
        />
      </div>
    );
  }
  if (!car) return <DetailSkeleton />;

  const requireLogin = (open: () => void) => () => {
    if (!user) router.push(`/login?next=${encodeURIComponent(pathname)}`);
    else open();
  };

  const status = STATUS_STYLES[car.status];
  const canBuy = car.status === "active" && !car.is_owner;

  return (
    <div className="container-page pb-20 pt-10">
      <Link href="/cars" className="mb-6 inline-flex items-center gap-2 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to all cars
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-8">
          {car.is_owner && (car.status === "pending" || car.status === "rejected") && (
            <div role="status" className={clsx("rounded-2xl border p-4 text-sm",
              car.status === "pending" ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400" : "border-accent/40 bg-accent/10 text-ink")}>
              {car.status === "pending"
                ? "In review: only you can see this listing until an admin approves it. You'll get a notification."
                : "This listing was rejected. Check your notifications for the reason, then edit it to resubmit."}
            </div>
          )}
          {car.images.length >= 3 && (
            <div className="flex gap-1 rounded-xl border border-line p-1 w-fit" role="tablist" aria-label="Media view">
              {([["photos", "Photos"], ["spin", "360° view"]] as const).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
                  className={clsx("rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors",
                    view === id ? "bg-accent text-on-accent" : "text-muted hover:text-fg")}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {view === "spin" && car.images.length >= 3
            ? <Spin360 images={car.images} title={car.title} />
            : <Gallery images={car.images} title={car.title} />}

          <CarDetails car={car} />
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:h-fit">
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="glass relative overflow-hidden rounded-2xl p-6">
            <div className="neon-line absolute inset-x-6 top-0" aria-hidden />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink">{car.year} · {car.make}</p>
                <h1 className="mt-2 font-display text-2xl font-extrabold leading-tight">{car.title}</h1>
              </div>
              <FavoriteButton
                listingId={car.id}
                initial={car.is_favorite}
                size="lg"
                variant="solid"
                className="shrink-0"
                onChange={(fav) => setCar((c) => c && { ...c, is_favorite: fav, favorites_count: c.favorites_count + (fav ? 1 : -1) })}
              />
            </div>
            {car.status !== "active" && (
              <span className={clsx("mt-3 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider", status.className)}>
                {status.label}
              </span>
            )}
            <p className="mt-5 font-display text-4xl font-extrabold text-ink">{formatPrice(car.price)}</p>
            {car.price_insight?.rating && (
              <div className="mt-2">
                <PriceBadge rating={car.price_insight.rating} estimate={car.price_insight.estimated_price} size="md" />
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted">
              <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" aria-hidden /> {formatNumber(car.views_count)} views</span>
              <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" aria-hidden /> {formatNumber(car.favorites_count)} saved</span>
              <span>Listed {timeAgo(car.created_at)}</span>
            </div>

            <div className="mt-6 space-y-3">
              {car.is_owner ? (
                <Link
                  href={`/cars/${car.id}/edit`}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-on-accent hover:shadow-glow"
                >
                  <Pencil className="h-4 w-4" aria-hidden /> Edit listing
                </Link>
              ) : canBuy ? (
                <>
                  <Button size="lg" className="w-full" onClick={requireLogin(() => setOfferOpen(true))}>
                    <HandCoins className="h-5 w-5" aria-hidden /> Make offer
                  </Button>
                  <Button size="lg" variant="outline" className="w-full" onClick={requireLogin(() => setContactOpen(true))}>
                    <MessageSquare className="h-5 w-5" aria-hidden /> Contact seller
                  </Button>
                </>
              ) : (
                <p className="rounded-xl bg-elevated p-4 text-center text-sm text-muted">This car is not available right now.</p>
              )}
            </div>
          </motion.div>

          {car.price_insight && <PriceInsightPanel insight={car.price_insight} askingPrice={car.price} />}

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 }} className="glass rounded-2xl p-6">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Seller</h2>
            <div className="mt-4 flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-deep font-display text-lg font-extrabold text-on-accent">
                {car.seller.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold">{car.seller.full_name}</p>
                <p className="text-xs text-muted">
                  Member since {new Date(car.seller.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </p>
                {car.seller.location && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted"><MapPin className="h-3 w-3" aria-hidden /> {car.seller.location}</p>
                )}
              </div>
            </div>
            <Link href={`/cars?seller_id=${car.seller.id}`} className="mt-4 block text-sm font-semibold text-ink hover:underline">
              More cars from this seller →
            </Link>
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-elevated/60 p-3 text-xs text-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink" aria-hidden />
              Never pay before seeing the car in person. Keep conversations on CarvyPaar.
            </p>
          </motion.div>
        </aside>
      </div>

      <MakeOfferModal car={car} open={offerOpen} onClose={() => setOfferOpen(false)} />
      <ContactSellerModal car={car} open={contactOpen} onClose={() => setContactOpen(false)} />
    </div>
  );
}
