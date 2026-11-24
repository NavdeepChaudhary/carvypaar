"use client";

import { Heart } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { CarCard, CarCardSkeleton } from "@/components/cars/CarCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { listingsApi } from "@/lib/listings";
import type { ListingCard } from "@/lib/types";

export function FavoritesTab() {
  const [items, setItems] = useState<ListingCard[] | null>(null);

  useEffect(() => {
    listingsApi.favorites().then(setItems).catch(() => setItems([]));
  }, []);

  if (!items) {
    return <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <CarCardSkeleton key={i} />)}</div>;
  }
  if (!items.length) {
    return (
      <EmptyState
        icon={Heart}
        title="No saved cars"
        body="Tap the heart on any car to keep it here."
        action={<Link href="/cars" className="rounded-xl bg-accent px-6 py-3 font-semibold text-on-accent hover:shadow-glow">Browse cars</Link>}
      />
    );
  }
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((car, i) => (
        <CarCard
          key={car.id}
          car={car}
          index={i}
          showStatus={car.status !== "active"}
          onFavoriteChange={(fav) => {
            if (!fav) setItems((list) => list?.filter((c) => c.id !== car.id) ?? null);
          }}
        />
      ))}
    </div>
  );
}
