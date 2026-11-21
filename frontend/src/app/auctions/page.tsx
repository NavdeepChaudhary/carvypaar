"use client";

import { clsx } from "clsx";
import { motion } from "framer-motion";
import { AlertTriangle, CalendarClock, Flag, Gavel, Radio } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { AuctionCard, AuctionCardSkeleton } from "@/components/auctions/AuctionCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { useAuth } from "@/context/AuthContext";
import { ApiError, STATIC_DEMO } from "@/lib/api";
import { auctionsApi, type AuctionTab } from "@/lib/auctions";
import type { AuctionCard as AuctionCardData, Page } from "@/lib/types";

const TABS: { id: AuctionTab; label: string; icon: typeof Radio }[] = [
  { id: "live", label: "Live now", icon: Radio },
  { id: "upcoming", label: "Upcoming", icon: CalendarClock },
  { id: "ended", label: "Results", icon: Flag },
];
const REFRESH_MS = 20_000; // keep bid counts / prices fresh on the grid

function Auctions() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { loading: authLoading } = useAuth();
  const requested = params.get("tab") as AuctionTab | null;
  const tab: AuctionTab = TABS.some((t) => t.id === requested) ? requested! : "live";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const [data, setData] = useState<Page<AuctionCardData> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    const load = () =>
      auctionsApi
        .list(tab, page)
        .then((d) => !cancelled && (setData(d), setError(null)))
        .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Couldn't load auctions"));
    setData(null);
    void load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [tab, page, authLoading, reload]);

  const go = (next: { tab?: AuctionTab; page?: number }) => {
    const qs = new URLSearchParams();
    qs.set("tab", next.tab ?? tab);
    if (next.page && next.page > 1) qs.set("page", String(next.page));
    router.replace(`${pathname}?${qs}`, { scroll: false });
  };

  return (
    <div className="container-page pb-20 pt-28">
      <header className="relative overflow-hidden rounded-3xl border border-line/60 bg-gradient-to-br from-accent/20 via-surface to-neon/10 p-8 sm:p-12">
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-accent/30 blur-3xl" aria-hidden />
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent">
          <span className="h-2 w-2 animate-ping rounded-full bg-accent" aria-hidden /> Under the hammer
        </p>
        <h1 className="mt-3 font-display text-3xl font-black uppercase sm:text-5xl">Live auctions</h1>
        <p className="mt-3 max-w-xl text-sm text-muted sm:text-base">
          Real-time bidding with live countdowns. Every bid in the last two minutes adds two more, so the highest bidder wins, not the fastest clicker.
        </p>
      </header>

      <div className="mt-8 flex gap-2 overflow-x-auto" role="tablist" aria-label="Auction status">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => go({ tab: id })}
            className={clsx("relative flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
              tab === id ? "text-white" : "text-muted hover:text-fg")}>
            {tab === id && <motion.span layoutId="auction-tab" className="absolute inset-0 rounded-xl bg-accent shadow-glow" />}
            <Icon className="relative h-4 w-4" aria-hidden /> <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      <section className="mt-8" aria-busy={!data && !error}>
        {error ? (
          <EmptyState icon={AlertTriangle} title={STATIC_DEMO ? "Preview only" : "Something went wrong"} body={error}
            action={STATIC_DEMO ? undefined : <Button onClick={() => setReload((r) => r + 1)}>Try again</Button>} />
        ) : !data ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => <AuctionCardSkeleton key={i} />)}
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={Gavel}
            title={tab === "live" ? "No live auctions right now" : tab === "upcoming" ? "Nothing scheduled yet" : "No results yet"}
            body={tab === "live" ? "Check the upcoming tab, or put your own car under the hammer." : undefined} />
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((item, i) => <AuctionCard key={item.auction.id} data={item} index={i} />)}
            </div>
            <div className="mt-12">
              <Pagination page={data.page} pages={data.pages} onChange={(p) => go({ page: p })} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default function AuctionsPage() {
  return (
    <Suspense fallback={null}>
      <Auctions />
    </Suspense>
  );
}
