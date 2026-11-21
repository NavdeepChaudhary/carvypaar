"use client";

import { clsx } from "clsx";
import { Gavel } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { CarImage } from "@/components/cars/CarImage";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError } from "@/lib/api";
import { adminApi, type AdminAuctionStatus } from "@/lib/admin";
import { parseUtc } from "@/lib/auctions";
import { formatPrice, timeAgo } from "@/lib/format";
import type { AdminAuctionRow, AuctionStatus, Page } from "@/lib/types";

const FILTERS: AdminAuctionStatus[] = ["all", "live", "scheduled", "ended", "cancelled"];
const STATUS_CLASS: Record<AuctionStatus, string> = {
  live: "bg-accent text-white",
  scheduled: "bg-neon/15 text-neon",
  ended: "bg-muted/15 text-muted",
  cancelled: "bg-muted/15 text-muted line-through",
};

function when(row: AdminAuctionRow): string {
  const a = row.auction;
  const end = parseUtc(a.end_time);
  if (a.status === "scheduled") return `starts ${timeAgo(a.start_time)}`;
  return end > Date.now() ? `ends ${timeAgo(a.end_time)}` : `ended ${timeAgo(a.end_time)}`;
}

export function AuctionsTable() {
  const [status, setStatus] = useState<AdminAuctionStatus>("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AdminAuctionRow> | null>(null);
  const [cancelling, setCancelling] = useState<AdminAuctionRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    adminApi.auctions(status, page).then(setData).catch((err) => toast.error(err instanceof ApiError ? err.message : "Couldn't load auctions"));
  }, [status, page]);
  useEffect(() => load(), [load]);

  const cancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    try {
      await adminApi.cancelAuction(cancelling.auction.id);
      toast.success("Auction cancelled; bidders were notified");
      setCancelling(null);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't cancel");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Auction status">
        {FILTERS.map((f) => (
          <button key={f} type="button" role="tab" aria-selected={status === f} onClick={() => { setStatus(f); setPage(1); }}
            className={clsx("rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors",
              status === f ? "bg-accent text-white" : "border border-line text-muted hover:text-fg")}>
            {f}
          </button>
        ))}
      </div>

      {!data ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : data.items.length === 0 ? (
        <EmptyState icon={Gavel} title="No auctions" />
      ) : (
        <>
          <div className="glass overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">Auctions ({data.total})</caption>
              <thead>
                <tr className="border-b border-line/60 text-left text-xs uppercase tracking-wider text-muted">
                  <th scope="col" className="px-4 py-3 font-semibold">Car</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Top bid</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Bids</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Reserve</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Timing</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => {
                  const a = row.auction;
                  const open = a.status === "live" || a.status === "scheduled";
                  return (
                    <tr key={a.id} className="border-b border-line/40 last:border-0">
                      <td className="px-4 py-3">
                        <Link href={`/auctions/${a.id}`} className="flex items-center gap-3 hover:text-accent">
                          <CarImage src={row.cover_image} alt="" className="h-10 w-16 shrink-0 rounded-lg" />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{row.listing_title}</span>
                            <span className="block text-xs text-muted">by {row.seller_name}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx("rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase", STATUS_CLASS[a.status])}>{a.status}</span>
                        {a.extended && open && <span className="ml-2 text-[11px] text-muted">extended</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {a.final_price ? formatPrice(a.final_price) : a.current_price ? formatPrice(a.current_price) : <span className="text-muted">–</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{a.bid_count}</td>
                      <td className="px-4 py-3 text-xs">
                        {!a.has_reserve ? <span className="text-muted">None</span> : a.reserve_met ? "Met" : "Not met"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">{when(row)}</td>
                      <td className="px-4 py-3 text-right">
                        {open && <Button size="sm" variant="ghost" onClick={() => setCancelling(row)}>Cancel</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pages={data.pages} onChange={setPage} />
        </>
      )}

      <Modal open={!!cancelling} onClose={() => setCancelling(null)} title="Cancel this auction?"
        description={cancelling ? <>“{cancelling.listing_title}” has {cancelling.auction.bid_count} bid{cancelling.auction.bid_count === 1 ? "" : "s"}. Every bidder will be notified and no winner is chosen.</> : undefined}>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setCancelling(null)}>Keep running</Button>
          <Button onClick={cancel} loading={busy}>Cancel auction</Button>
        </div>
      </Modal>
    </div>
  );
}
