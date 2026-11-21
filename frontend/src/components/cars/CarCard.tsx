"use client";

import { clsx } from "clsx";
import { motion } from "framer-motion";
import { Camera, Fuel, Gauge, MapPin, Settings2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { PriceBadge } from "@/components/price/PriceBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { FUEL_OPTIONS, STATUS_STYLES, TRANSMISSION_OPTIONS, labelFor } from "@/lib/constants";
import { formatKm, formatPrice } from "@/lib/format";
import type { ListingCard } from "@/lib/types";

import { CarImage } from "./CarImage";
import { FavoriteButton } from "./FavoriteButton";

interface CarCardProps {
  car: ListingCard;
  index?: number;
  /** Show the status pill (used in "My listings"). */
  showStatus?: boolean;
  onFavoriteChange?: (fav: boolean) => void;
  /** Extra controls rendered under the card body (owner actions). */
  footer?: ReactNode;
}

export function CarCard({ car, index = 0, showStatus, onFavoriteChange, footer }: CarCardProps) {
  const status = STATUS_STYLES[car.status];
  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="glass group relative flex flex-col overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:border-accent/50 hover:shadow-glow"
    >
      <Link href={car.auction_id ? `/auctions/${car.auction_id}` : `/cars/${car.id}`} className="flex flex-1 flex-col focus-visible:ring-inset">
        <div className="relative aspect-[16/10] overflow-hidden">
          <CarImage
            src={car.cover_image}
            alt={car.title}
            className="h-full w-full transition-transform duration-700 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" aria-hidden />
          <div className="absolute left-3 right-16 top-3 flex flex-wrap gap-2">
            {showStatus && (
              <span className={clsx("rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider backdrop-blur", status.className)}>
                {status.label}
              </span>
            )}
            {car.price_rating && car.status === "active" && (
              <PriceBadge rating={car.price_rating} estimate={car.estimated_price} />
            )}
            {car.listing_type === "auction" && (
              <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                Auction
              </span>
            )}
          </div>
          <span className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[11px] text-white/90 backdrop-blur">
            <Camera className="h-3 w-3" aria-hidden /> {car.image_count}
          </span>
          <p className="absolute bottom-3 right-3 font-display text-lg font-black text-white drop-shadow">
            {formatPrice(car.price)}
          </p>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{car.year} · {car.make}</p>
          <h3 className="mt-1 line-clamp-1 text-base font-semibold" title={car.title}>
            {car.title}
          </h3>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-xs text-muted">
            <div className="flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <dt className="sr-only">Mileage</dt>
              <dd className="truncate">{formatKm(car.mileage)}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <Fuel className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <dt className="sr-only">Fuel</dt>
              <dd className="truncate">{labelFor(FUEL_OPTIONS, car.fuel_type)}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <dt className="sr-only">Transmission</dt>
              <dd className="truncate">{labelFor(TRANSMISSION_OPTIONS, car.transmission)}</dd>
            </div>
          </dl>
          <p className="mt-3 flex items-center gap-1.5 border-t border-line/60 pt-3 text-xs text-muted">
            <MapPin className="h-3.5 w-3.5" aria-hidden /> {car.location}
          </p>
        </div>
      </Link>

      <FavoriteButton
        listingId={car.id}
        initial={car.is_favorite}
        onChange={onFavoriteChange}
        className="absolute right-3 top-3"
      />
      {footer && <div className="border-t border-line/60 p-3">{footer}</div>}
    </motion.article>
  );
}

export function CarCardSkeleton() {
  return (
    <div className="glass overflow-hidden rounded-2xl" aria-hidden>
      <Skeleton className="aspect-[16/10] rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-3/4" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
        </div>
        <Skeleton className="h-4 w-1/3" />
      </div>
    </div>
  );
}
