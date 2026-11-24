"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { CarCard, CarCardSkeleton } from "@/components/cars/CarCard";
import { listingsApi } from "@/lib/listings";
import type { ListingCard } from "@/lib/types";

/** Newest cars for sale; renders nothing when the API is unreachable or there are none. */
export function TopPicks() {
  const [items, setItems] = useState<ListingCard[] | null>(null);

  useEffect(() => {
    listingsApi
      .search({ sort: "newest", page: 1, page_size: 4 })
      .then((p) => setItems(p.items))
      .catch(() => setItems([]));
  }, []);

  if (items !== null && items.length === 0) return null;

  return (
    <section className="container-page pt-20" aria-labelledby="picks-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="picks-heading" className="section-title">Fresh on CarvyPaar</h2>
          <p className="mt-1 text-sm text-muted">The latest cars listed, each with an AI price check.</p>
        </div>
        <Link
          href="/cars"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-accent"
        >
          View all cars <ArrowRight className="h-4 w-4 text-ink dark:text-accent" aria-hidden />
        </Link>
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {items === null
          ? Array.from({ length: 4 }, (_, i) => <CarCardSkeleton key={i} />)
          : items.map((car, i) => <CarCard key={car.id} car={car} index={i} />)}
      </div>
    </section>
  );
}
