"use client";

import { AlertTriangle, CarFront, Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { CarCard, CarCardSkeleton } from "@/components/cars/CarCard";
import { FilterPanel, type FilterValues } from "@/components/cars/FilterPanel";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api";
import {
  BODY_OPTIONS,
  CONDITION_OPTIONS,
  FUEL_OPTIONS,
  SORT_OPTIONS,
  TRANSMISSION_OPTIONS,
  labelFor,
  type Option,
} from "@/lib/constants";
import { formatKm, formatNumber, formatPriceShort } from "@/lib/format";
import { listingsApi } from "@/lib/listings";
import type { ListingCard, MakeModels, Page } from "@/lib/types";

const PAGE_SIZE = 12;
const FILTER_KEYS = [
  "q", "make", "model", "min_price", "max_price", "min_year", "max_year", "max_mileage",
  "fuel_type", "transmission", "body_type", "condition", "location", "seller_id",
];

/** Human-readable chips for the active filters. */
function chipLabel(key: string, value: string): string {
  const opt = (options: Option[]) => labelFor(options, value);
  switch (key) {
    case "q": return `“${value}”`;
    case "min_price": return `From ${formatPriceShort(Number(value))}`;
    case "max_price": return `Up to ${formatPriceShort(Number(value))}`;
    case "min_year": return `From ${value}`;
    case "max_year": return `Until ${value}`;
    case "max_mileage": return `≤ ${formatKm(Number(value))}`;
    case "fuel_type": return opt(FUEL_OPTIONS);
    case "transmission": return opt(TRANSMISSION_OPTIONS);
    case "body_type": return opt(BODY_OPTIONS);
    case "condition": return opt(CONDITION_OPTIONS);
    case "seller_id": return "This seller only";
    default: return value;
  }
}

function BrowseCars() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { loading: authLoading } = useAuth();

  const values: FilterValues = useMemo(() => Object.fromEntries(searchParams.entries()), [searchParams]);
  const page = Math.max(1, Number(values.page) || 1);
  const sort = values.sort ?? "newest";

  const [data, setData] = useState<Page<ListingCard> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [makes, setMakes] = useState<MakeModels[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState(values.q ?? "");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => setQuery(values.q ?? ""), [values.q]);

  useEffect(() => {
    listingsApi.makes().then(setMakes).catch(() => setMakes([]));
  }, []);

  const updateParams = useCallback(
    (updates: FilterValues, resetPage = true) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === undefined || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (resetPage) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // Fetch whenever the URL changes. Wait for auth so "saved" hearts are accurate.
  useEffect(() => {
    if (authLoading) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listingsApi
      .search({ ...values, page, page_size: PAGE_SIZE, sort }, controller.signal)
      .then((res) => setData(res))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : "Couldn't load cars");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [values, page, sort, authLoading, reloadKey]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    updateParams({ q: query.trim() || undefined });
  };

  const goToPage = (p: number) => {
    updateParams({ page: String(p) }, false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetAll = () => router.replace(pathname, { scroll: false });
  const activeChips = FILTER_KEYS.filter((k) => values[k]);

  const filterPanel = (
    <FilterPanel
      values={values}
      makes={makes}
      onChange={(u) => updateParams(u)}
      onReset={() => {
        resetAll();
        setFiltersOpen(false);
      }}
    />
  );

  return (
    <div className="container-page pb-20 pt-28">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Marketplace</p>
          <h1 className="mt-2 font-display text-3xl font-black uppercase sm:text-4xl">Find your next car</h1>
          <p className="mt-2 text-sm text-muted" aria-live="polite">
            {loading && !data ? "Searching…" : `${formatNumber(data?.total ?? 0)} cars available`}
          </p>
        </div>
        <form onSubmit={onSearch} role="search" className="flex w-full gap-2 lg:max-w-md">
          <label htmlFor="browse-search" className="sr-only">Search cars</label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              id="browse-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={100}
              placeholder="Make, model or keyword"
              className="h-12 w-full rounded-xl border border-line bg-elevated/60 pl-11 pr-4 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <Button type="submit">Search</Button>
        </form>
      </header>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="flex h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold hover:border-accent lg:hidden"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filters
          {activeChips.length > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] text-white">
              {activeChips.length}
            </span>
          )}
        </button>
        <ul className="flex flex-1 flex-wrap gap-2" aria-label="Active filters">
          {activeChips.map((k) => (
            <li key={k}>
              <button
                type="button"
                onClick={() => updateParams(k === "make" ? { make: undefined, model: undefined } : { [k]: undefined })}
                className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent hover:text-white"
                aria-label={`Remove filter ${chipLabel(k, values[k]!)}`}
              >
                {chipLabel(k, values[k]!)} <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <div className="w-full sm:w-56">
          <Select
            label="Sort by"
            hideLabel
            value={sort}
            options={SORT_OPTIONS}
            onChange={(e) => updateParams({ sort: e.target.value === "newest" ? undefined : e.target.value })}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="glass sticky top-24 rounded-2xl p-5">{filterPanel}</div>
        </aside>

        <section aria-label="Results" aria-busy={loading}>
          {error ? (
            <EmptyState
              icon={AlertTriangle}
              title="Something went wrong"
              body={error}
              action={<Button onClick={() => setReloadKey((k) => k + 1)}>Try again</Button>}
            />
          ) : loading && !data ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => <CarCardSkeleton key={i} />)}
            </div>
          ) : data && data.items.length === 0 ? (
            <EmptyState
              icon={CarFront}
              title="No cars match"
              body="Try widening your price range or removing a filter."
              action={activeChips.length > 0 && <Button variant="outline" onClick={resetAll}>Clear filters</Button>}
            />
          ) : (
            <>
              <div className={`grid gap-5 transition-opacity sm:grid-cols-2 xl:grid-cols-3 ${loading ? "opacity-50" : ""}`}>
                {data?.items.map((car, i) => <CarCard key={car.id} car={car} index={i} />)}
              </div>
              <div className="mt-12">
                <Pagination page={data?.page ?? 1} pages={data?.pages ?? 1} onChange={goToPage} />
              </div>
            </>
          )}
        </section>
      </div>

      <Modal open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        {filterPanel}
        <Button className="mt-4 w-full" onClick={() => setFiltersOpen(false)}>
          Show {formatNumber(data?.total ?? 0)} cars
        </Button>
      </Modal>
    </div>
  );
}

export default function CarsPage() {
  return (
    <Suspense fallback={null}>
      <BrowseCars />
    </Suspense>
  );
}
