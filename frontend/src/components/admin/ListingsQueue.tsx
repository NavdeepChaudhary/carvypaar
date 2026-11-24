"use client";

import { clsx } from "clsx";
import { Check, ClipboardCheck, ExternalLink, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { CarImage } from "@/components/cars/CarImage";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { TextArea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError } from "@/lib/api";
import { adminApi, type AdminListingStatus } from "@/lib/admin";
import { STATUS_STYLES } from "@/lib/constants";
import { formatKm, formatPrice, timeAgo } from "@/lib/format";
import type { AdminListingRow, Page } from "@/lib/types";

const FILTERS: { id: AdminListingStatus; label: string }[] = [
  { id: "pending", label: "Needs review" },
  { id: "active", label: "Live" },
  { id: "rejected", label: "Rejected" },
  { id: "sold", label: "Sold" },
  { id: "inactive", label: "Hidden" },
  { id: "all", label: "All" },
];

const REJECT_REASONS = ["Photos are unclear or not of the actual car", "Price looks like a typo", "Details are incomplete or inconsistent", "Duplicate listing"];

export function ListingsQueue({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState<AdminListingStatus>("pending");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AdminListingRow> | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<AdminListingRow | null>(null);
  const [removing, setRemoving] = useState<AdminListingRow | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    adminApi.listings(status, query, page).then(setData).catch((err) => toast.error(err instanceof ApiError ? err.message : "Couldn't load listings"));
  }, [status, query, page]);

  // The previous page stays rendered while the next one loads (no layout jump).
  useEffect(() => {
    load();
  }, [load]);

  const act = async (row: AdminListingRow, action: () => Promise<unknown>, message: string) => {
    setBusy(row.listing.id);
    try {
      await action();
      toast.success(message);
      load();
      onChanged?.();
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const submitReject = async (e: FormEvent) => {
    e.preventDefault();
    if (!rejecting || reason.trim().length < 3) return;
    if (await act(rejecting, () => adminApi.reject(rejecting.listing.id, reason.trim()), "Listing rejected; the seller was told why")) {
      setRejecting(null);
      setReason("");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Listing status">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={status === f.id}
              onClick={() => { setStatus(f.id); setPage(1); }}
              className={clsx("rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                status === f.id ? "bg-accent text-on-accent" : "border border-line text-muted hover:text-fg")}>
              {f.label}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); setPage(1); }} role="search" className="relative w-full lg:w-72">
          <label htmlFor="admin-listing-search" className="sr-only">Search listings or seller email</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input id="admin-listing-search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100}
            placeholder="Title, make or seller email"
            className="h-10 w-full rounded-xl border border-line bg-elevated/60 pl-9 pr-3 text-sm focus:border-accent focus:outline-none" />
        </form>
      </div>

      {!data ? (
        <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : data.items.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title={status === "pending" ? "Review queue is clear" : "Nothing here"}
          body={status === "pending" ? "New listings will appear here for approval." : "Try another filter or search."} />
      ) : (
        <>
          <p className="text-xs text-muted">{data.total} listing{data.total === 1 ? "" : "s"}{status === "pending" ? ", oldest first" : ""}</p>
          <ul className="space-y-3">
            {data.items.map((row) => {
              const l = row.listing;
              const s = STATUS_STYLES[l.status];
              return (
                <li key={l.id} className="glass flex flex-col gap-4 rounded-2xl p-4 md:flex-row md:items-center">
                  <CarImage src={l.cover_image} alt={l.title} className="h-20 w-full shrink-0 rounded-xl md:w-32" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/cars/${l.id}`} target="_blank" className="truncate font-semibold hover:text-ink">
                        {l.title} <ExternalLink className="inline h-3 w-3" aria-label="(opens in a new tab)" />
                      </Link>
                      <span className={clsx("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", s.className)}>{s.label}</span>
                      {l.listing_type === "auction" && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase text-ink">Auction</span>}
                    </div>
                    <p className="mt-1 text-sm">
                      <span className="font-semibold">{formatPrice(l.price)}</span>
                      <span className="text-muted"> · {l.year} · {formatKm(l.mileage)} · {l.location} · {l.image_count} photo{l.image_count === 1 ? "" : "s"}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {row.seller_name} ({row.seller_email}) · submitted {timeAgo(l.created_at)}
                      {l.estimated_price ? ` · AI estimate ${formatPrice(l.estimated_price)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {(l.status === "pending" || l.status === "rejected") && (
                      <Button size="sm" loading={busy === l.id} onClick={() => act(row, () => adminApi.approve(l.id), "Approved: the listing is live")}>
                        <Check className="h-4 w-4" aria-hidden /> Approve
                      </Button>
                    )}
                    {(l.status === "pending" || l.status === "active") && (
                      <Button size="sm" variant="outline" disabled={busy === l.id} onClick={() => { setRejecting(row); setReason(""); }}>
                        <X className="h-4 w-4" aria-hidden /> Reject
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" disabled={busy === l.id} onClick={() => setRemoving(row)} aria-label={`Remove ${l.title}`}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination page={data.page} pages={data.pages} onChange={setPage} />
        </>
      )}

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title="Reject listing"
        description={rejecting ? <>The seller of “{rejecting.listing.title}” sees this reason and can edit and resubmit.</> : undefined}>
        <form onSubmit={submitReject} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {REJECT_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)}
                className="rounded-full border border-line px-3 py-1.5 text-xs hover:border-accent hover:text-ink">{r}</button>
            ))}
          </div>
          <TextArea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} required
            hint={`${reason.length}/500`} />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button type="submit" disabled={reason.trim().length < 3} loading={busy === rejecting?.listing.id}>Reject listing</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Remove listing permanently?"
        description={removing ? <>“{removing.listing.title}”, its photos, offers and messages will be deleted. This can&apos;t be undone.</> : undefined}>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setRemoving(null)}>Keep it</Button>
          <Button loading={busy === removing?.listing.id}
            onClick={async () => { if (removing && await act(removing, () => adminApi.removeListing(removing.listing.id), "Listing removed")) setRemoving(null); }}>
            Remove
          </Button>
        </div>
      </Modal>
    </div>
  );
}
