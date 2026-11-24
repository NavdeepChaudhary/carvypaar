"use client";

import { clsx } from "clsx";
import { ExternalLink, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { CarImage } from "@/components/cars/CarImage";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api";
import { adminApi, type AdminListingStatus } from "@/lib/admin";
import { formatKm, formatNumber, formatPrice } from "@/lib/format";
import type { AdminListingRow, AdminSales, AdminStats, AdminUserRow, ListingStatus, Page } from "@/lib/types";

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

// ---------------------------------------------------------------- stat cards
const TONES = {
  amber: "border-l-amber-500 text-amber-600 dark:text-amber-400",
  emerald: "border-l-emerald-500 text-emerald-600 dark:text-emerald-400",
  red: "border-l-red-500 text-red-600 dark:text-red-400",
  blue: "border-l-blue-500 text-blue-600 dark:text-blue-400",
  violet: "border-l-violet-500 text-violet-600 dark:text-violet-400",
  teal: "border-l-teal-500 text-teal-600 dark:text-teal-400",
  orange: "border-l-orange-500 text-orange-600 dark:text-orange-400",
} as const;

function StatCard({ label, value, tone, onClick, active }: {
  label: string; value: ReactNode; tone: keyof typeof TONES; onClick?: () => void; active?: boolean;
}) {
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl font-extrabold tabular-nums">{value}</p>
    </>
  );
  const cls = clsx("glass rounded-2xl border-l-4 p-5 text-left transition", TONES[tone], active && "ring-2 ring-accent");
  return onClick ? (
    <button type="button" onClick={onClick} className={clsx(cls, "hover:-translate-y-0.5 hover:shadow-lift")} aria-pressed={active}>{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// ---------------------------------------------------------------- small pieces
const STATUS_PILL: Record<ListingStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  active: { label: "Approved", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  rejected: { label: "Rejected", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
  sold: { label: "Sold", className: "bg-violet-500/15 text-violet-700 dark:text-violet-400" },
  inactive: { label: "Hidden", className: "bg-muted/15 text-muted" },
};

function Pill({ status }: { status: ListingStatus }) {
  const s = STATUS_PILL[status];
  return <span className={clsx("rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide", s.className)}>{s.label}</span>;
}

const ACTION = "inline-flex h-8 items-center rounded-lg px-3 text-xs font-bold text-white transition disabled:opacity-50";

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h2 className="font-display text-xl font-bold sm:text-2xl">{children}</h2>
      {aside}
    </div>
  );
}

function Table({ head, children, minWidth = "min-w-[900px]" }: { head: string[]; children: ReactNode; minWidth?: string }) {
  return (
    <div className="glass overflow-x-auto rounded-2xl">
      <table className={clsx("w-full text-left text-sm", minWidth)}>
        <thead className="border-b border-line bg-elevated/60 text-xs uppercase tracking-wide text-muted">
          <tr>{head.map((h) => <th key={h} scope="col" className="px-4 py-3 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

const FILTERS: { id: AdminListingStatus; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "active", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All uploaded" },
];
const FILTER_TITLE: Record<string, string> = { pending: "Pending", active: "Approved", rejected: "Rejected", all: "All uploaded" };
const REJECT_REASONS = ["Photos are unclear or not of the actual car", "Price looks like a typo", "Details are incomplete or inconsistent", "Duplicate listing"];

/** The admin home: totals, the upload review table, sales with commission, and registered users. */
export function AdminDashboard() {
  const { user: me } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [sales, setSales] = useState<AdminSales | null>(null);
  const [status, setStatus] = useState<AdminListingStatus>("pending");
  const [listingPage, setListingPage] = useState(1);
  const [listings, setListings] = useState<Page<AdminListingRow> | null>(null);
  const [userPage, setUserPage] = useState(1);
  const [users, setUsers] = useState<Page<AdminUserRow> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<AdminListingRow | null>(null);
  const [reason, setReason] = useState("");
  const [removing, setRemoving] = useState<AdminListingRow | null>(null);
  const [deletingUser, setDeletingUser] = useState<AdminUserRow | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadTotals = useCallback(async () => {
    const [s, sl] = await Promise.all([adminApi.stats(), adminApi.sales()]);
    setStats(s);
    setSales(sl);
  }, []);
  const loadListings = useCallback(
    () => adminApi.listings(status, "", listingPage).then(setListings),
    [status, listingPage],
  );
  const loadUsers = useCallback(
    () => adminApi.users({ page: userPage }).then(setUsers),
    [userPage],
  );

  useEffect(() => { loadTotals().catch((e) => toast.error(message(e, "Couldn't load totals"))); }, [loadTotals]);
  useEffect(() => { loadListings().catch((e) => toast.error(message(e, "Couldn't load uploads"))); }, [loadListings]);
  useEffect(() => { loadUsers().catch((e) => toast.error(message(e, "Couldn't load users"))); }, [loadUsers]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadTotals(), loadListings(), loadUsers()]);
    } catch (e) {
      toast.error(message(e, "Refresh failed"));
    } finally {
      setRefreshing(false);
    }
  };

  const act = async (key: string, action: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await action();
      toast.success(done);
      await Promise.all([loadTotals(), loadListings(), loadUsers()]);
      return true;
    } catch (e) {
      toast.error(message(e, "Action failed"));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const submitReject = async (e: FormEvent) => {
    e.preventDefault();
    if (!rejecting || reason.trim().length < 3) return;
    const id = rejecting.listing.id;
    if (await act(`l${id}`, () => adminApi.reject(id, reason.trim()), "Rejected. The seller was told why.")) {
      setRejecting(null);
      setReason("");
    }
  };

  const by = stats?.listings_by_status ?? {};
  const allUploaded = Object.values(by).reduce((a, b) => a + b, 0);
  const pick = (s: AdminListingStatus) => { setStatus(s); setListingPage(1); };

  return (
    <div className="space-y-10">
      {/* Totals */}
      {!stats || !sales ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <StatCard label="Pending" value={formatNumber(by.pending ?? 0)} tone="amber" onClick={() => pick("pending")} active={status === "pending"} />
          <StatCard label="Approved" value={formatNumber(by.active ?? 0)} tone="emerald" onClick={() => pick("active")} active={status === "active"} />
          <StatCard label="Rejected" value={formatNumber(by.rejected ?? 0)} tone="red" onClick={() => pick("rejected")} active={status === "rejected"} />
          <StatCard label="All uploaded" value={formatNumber(allUploaded)} tone="blue" onClick={() => pick("all")} active={status === "all"} />
          <StatCard label="Cars sold" value={formatNumber(sales.cars_sold)} tone="violet" />
          <StatCard label={`Total commission (${sales.commission_pct}%)`} value={formatPrice(sales.commission)} tone="teal" />
          <StatCard label="Registered users" value={formatNumber(stats.users_total)} tone="orange" />
        </div>
      )}

      {/* Uploaded cars */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter uploads">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={status === f.id} onClick={() => pick(f.id)}
                className={clsx("h-10 rounded-xl px-4 text-sm font-semibold transition-colors",
                  status === f.id ? "bg-accent text-on-accent shadow-glow" : "border border-line bg-surface text-fg hover:border-accent")}>
                {f.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={refresh} loading={refreshing}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
          </Button>
        </div>
        <SectionTitle>Uploaded cars ({FILTER_TITLE[status]})</SectionTitle>
        {!listings ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : listings.items.length === 0 ? (
          <p className="glass rounded-2xl p-8 text-center text-sm text-muted">
            {status === "pending" ? "Nothing waiting for review. New uploads appear here." : "No cars in this list."}
          </p>
        ) : (
          <>
            <Table head={["Car", "Price", "Location", "Owner", "Contact", "Status", "Reason", "Actions"]} minWidth="min-w-[1050px]">
              {listings.items.map((row) => {
                const l = row.listing;
                const key = `l${l.id}`;
                return (
                  <tr key={l.id} className="align-middle">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <CarImage src={l.cover_image} alt={l.title} className="h-12 w-20 shrink-0 rounded-lg" />
                        <div className="min-w-0">
                          <Link href={`/cars/${l.id}`} target="_blank" className="line-clamp-1 font-semibold hover:text-ink">
                            {l.year} {l.make} {l.model} <ExternalLink className="inline h-3 w-3" aria-label="(opens in a new tab)" />
                          </Link>
                          <p className="text-xs text-muted">Mileage: {formatKm(l.mileage)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-ink">{formatPrice(l.price)}</td>
                    <td className="px-4 py-3">{l.location}</td>
                    <td className="px-4 py-3">{row.seller_name}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.seller_phone ?? <a href={`mailto:${row.seller_email}`} className="hover:text-ink">{row.seller_email}</a>}
                    </td>
                    <td className="px-4 py-3"><Pill status={l.status} /></td>
                    <td className="max-w-[14rem] px-4 py-3 text-muted">{row.rejection_reason ?? "–"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {(l.status === "pending" || l.status === "rejected") && (
                          <button type="button" disabled={busy === key} className={clsx(ACTION, "bg-emerald-600 hover:bg-emerald-500")}
                            onClick={() => act(key, () => adminApi.approve(l.id), "Approved. The car is live.")}>Approve</button>
                        )}
                        {(l.status === "pending" || l.status === "active") && (
                          <button type="button" disabled={busy === key} className={clsx(ACTION, "bg-red-600 hover:bg-red-500")}
                            onClick={() => { setRejecting(row); setReason(""); }}>Reject</button>
                        )}
                        <button type="button" disabled={busy === key} className={clsx(ACTION, "bg-slate-500 hover:bg-slate-400")}
                          onClick={() => setRemoving(row)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
            <Pagination page={listings.page} pages={listings.pages} onChange={setListingPage} />
          </>
        )}
      </section>

      {/* Sales */}
      <section className="space-y-4">
        <SectionTitle aside={sales && <p className="text-sm text-muted">Gross sales {formatPrice(sales.gross)}</p>}>
          Sold cars and commission
        </SectionTitle>
        {!sales ? (
          <Skeleton className="h-40 rounded-2xl" />
        ) : sales.items.length === 0 ? (
          <p className="glass rounded-2xl p-8 text-center text-sm text-muted">No cars sold yet.</p>
        ) : (
          <Table head={["Car", "Sold price", `Admin commission (${sales.commission_pct}%)`, "Seller amount", "Seller", "Buyer", "Sold"]}>
            {sales.items.map((s) => (
              <tr key={s.listing_id}>
                <td className="px-4 py-3 font-semibold">{s.title}</td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-ink">{formatPrice(s.sold_price)}</td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-teal-600 dark:text-teal-400">{formatPrice(s.commission)}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatPrice(s.seller_amount)}</td>
                <td className="px-4 py-3">{s.seller_name}</td>
                <td className="px-4 py-3">
                  {s.buyer_email ? (
                    <><span className="font-medium">{s.buyer_name}</span><span className="block text-xs text-muted">{s.buyer_email}</span></>
                  ) : (
                    <span className="text-muted">Not recorded</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted">
                  {dateTime(s.sold_at)}
                  <span className="block text-xs capitalize">{s.sold_via === "direct" ? "Marked sold" : `By ${s.sold_via}`}</span>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      {/* Users */}
      <section className="space-y-4">
        <SectionTitle aside={users && <p className="text-sm text-muted">{formatNumber(users.total)} total</p>}>Registered users</SectionTitle>
        {!users ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : (
          <>
            <Table head={["Email", "Name", "ID", "Role", "Registered on", "Updated on", "Actions"]}>
              {users.items.map((row) => {
                const u = row.user;
                const self = u.id === me?.id;
                const key = `u${u.id}`;
                return (
                  <tr key={u.id}>
                    <td className="px-4 py-3">{u.email}</td>
                    <td className="px-4 py-3">{u.full_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">#{u.id}</td>
                    <td className="px-4 py-3">
                      <span className={clsx("rounded-full px-2.5 py-1 text-[11px] font-bold uppercase",
                        u.role === "admin" ? "bg-accent/20 text-ink" : "bg-elevated text-fg")}>{u.role}</span>
                      {!u.is_active && <span className="ml-1 text-xs text-red-600 dark:text-red-400">Deactivated</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{dateTime(u.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{dateTime(row.updated_at)}</td>
                    <td className="px-4 py-3">
                      {self || u.role === "admin" ? (
                        <span className="text-xs text-muted">{self ? "You" : "Admin"}</span>
                      ) : (
                        <button type="button" disabled={busy === key} className={clsx(ACTION, "bg-red-600 hover:bg-red-500")}
                          onClick={() => setDeletingUser(row)}>Delete user</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
            <Pagination page={users.page} pages={users.pages} onChange={setUserPage} />
          </>
        )}
      </section>

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title="Reject this car"
        description={rejecting ? <>The seller of “{rejecting.listing.title}” sees this reason and can edit and resubmit.</> : undefined}>
        <form onSubmit={submitReject} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {REJECT_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)}
                className="rounded-full border border-line px-3 py-1.5 text-xs hover:border-accent hover:text-ink">{r}</button>
            ))}
          </div>
          <TextArea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} required hint={`${reason.length}/500`} />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button type="submit" disabled={reason.trim().length < 3} loading={busy === `l${rejecting?.listing.id}`}>Reject</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Delete this car permanently?"
        description={removing ? <>“{removing.listing.title}”, its photos, offers and messages will be deleted. This can&apos;t be undone.</> : undefined}>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setRemoving(null)}>Keep it</Button>
          <Button loading={busy === `l${removing?.listing.id}`}
            onClick={async () => { if (removing && await act(`l${removing.listing.id}`, () => adminApi.removeListing(removing.listing.id), "Car deleted")) setRemoving(null); }}>
            Delete
          </Button>
        </div>
      </Modal>

      <Modal open={!!deletingUser} onClose={() => setDeletingUser(null)} title="Delete this user permanently?"
        description={deletingUser ? <>{deletingUser.user.full_name} ({deletingUser.user.email}) and everything they own will be deleted: {deletingUser.listings} listing{deletingUser.listings === 1 ? "" : "s"}, {deletingUser.bids} bid{deletingUser.bids === 1 ? "" : "s"}, their offers and messages. This can&apos;t be undone. To block them without deleting, use Manage users → Deactivate.</> : undefined}>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeletingUser(null)}>Keep user</Button>
          <Button loading={busy === `u${deletingUser?.user.id}`}
            onClick={async () => { if (deletingUser && await act(`u${deletingUser.user.id}`, () => adminApi.deleteUser(deletingUser.user.id), "User deleted")) setDeletingUser(null); }}>
            Delete user
          </Button>
        </div>
      </Modal>
    </div>
  );
}
