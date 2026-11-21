"use client";

import { clsx } from "clsx";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ClipboardCheck, Minus } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError } from "@/lib/api";
import { adminApi } from "@/lib/admin";
import { formatPrice } from "@/lib/format";
import type { AdminStats } from "@/lib/types";

import { BarList, ColumnChart } from "./charts";

const num = new Intl.NumberFormat("en-IN");

/** Week-over-week delta. Up is good for every metric here; shown with icon + sign, never color alone. */
function Delta({ now, prev }: { now: number; prev: number }) {
  if (prev === 0 && now === 0) return <span className="text-xs text-muted">No change vs previous 7 days</span>;
  const pct = prev === 0 ? null : Math.round(((now - prev) / prev) * 100);
  const up = now > prev;
  const flat = now === prev;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={clsx("flex items-center gap-1 text-xs font-semibold", flat ? "text-muted" : up ? "text-emerald-500" : "text-accent")}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {pct === null ? `+${num.format(now)} (new)` : `${pct > 0 ? "+" : ""}${pct}%`}
      <span className="font-normal text-muted">vs previous 7 days</span>
    </span>
  );
}

function StatTile({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-sans text-3xl font-semibold">{value}</p>
      <div className="mt-2 min-h-5">{children}</div>
    </div>
  );
}

export function Overview({ onReview }: { onReview: () => void }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.stats().then(setStats).catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load stats"));
  }, []);

  if (error) return <EmptyState icon={AlertTriangle} title="Stats unavailable" body={error} />;
  if (!stats) {
    return (
      <div className="space-y-5" aria-busy="true">
        <Skeleton className="h-36 rounded-2xl" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
        <div className="grid gap-5 lg:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-60 rounded-2xl" />)}</div>
      </div>
    );
  }

  const live = stats.auctions_by_status.live ?? 0;
  const statusItems = ["active", "pending", "sold", "inactive", "rejected"]
    .map((s) => ({ label: s[0].toUpperCase() + s.slice(1), count: stats.listings_by_status[s] ?? 0 }))
    .filter((i) => i.count > 0);

  return (
    <div className="space-y-5">
      {/* Hero figure: exactly one per view. */}
      <section className="glass flex flex-col gap-4 rounded-2xl p-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">Gross merchandise value (all time)</p>
          <p className="mt-1 font-sans text-5xl font-semibold">{formatPrice(stats.gmv)}</p>
          <p className="mt-2 text-sm text-muted">{formatPrice(stats.gmv_7d)} in the last 7 days · fixed-price sales + winning auction bids</p>
        </div>
        {stats.pending_review > 0 && (
          <Button onClick={onReview} className="shrink-0">
            <ClipboardCheck className="h-4 w-4" aria-hidden /> Review {stats.pending_review} pending listing{stats.pending_review === 1 ? "" : "s"}
          </Button>
        )}
      </section>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Members" value={num.format(stats.users_total)}>
          <Delta now={stats.users_new_7d} prev={stats.users_new_prev_7d} />
        </StatTile>
        <StatTile label="New listings (7 days)" value={num.format(stats.listings_new_7d)}>
          <Delta now={stats.listings_new_7d} prev={stats.listings_new_prev_7d} />
        </StatTile>
        <StatTile label="Live auctions" value={num.format(live)}>
          <span className="text-xs text-muted">{num.format(stats.auctions_by_status.scheduled ?? 0)} scheduled · {num.format(stats.auctions_by_status.ended ?? 0)} ended</span>
        </StatTile>
        <StatTile label="Bids (7 days)" value={num.format(stats.bids_7d)}>
          <span className="text-xs text-muted">{num.format(stats.bids_total)} all time</span>
        </StatTile>
      </div>

      {/* Three measures on different scales: small multiples, never a dual axis. */}
      <div className="grid gap-5 lg:grid-cols-3">
        <ColumnChart title="New listings per day" unit="listings" data={stats.daily.map((d) => ({ date: d.date, value: d.listings }))} />
        <ColumnChart title="New members per day" unit="members" data={stats.daily.map((d) => ({ date: d.date, value: d.users }))} />
        <ColumnChart title="Bids per day" unit="bids" data={stats.daily.map((d) => ({ date: d.date, value: d.bids }))} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <BarList title="Listings by status" items={statusItems} emptyText="No listings yet." />
        <BarList title="Top makes (live listings)" items={stats.top_makes} emptyText="No live listings yet." />
      </div>

      <p className="text-xs text-muted">
        Members by role: {Object.entries(stats.users_by_role).map(([r, n]) => `${num.format(n)} ${r}${n === 1 ? "" : "s"}`).join(" · ")}
      </p>
    </div>
  );
}
