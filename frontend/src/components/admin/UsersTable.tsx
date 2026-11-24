"use client";

import { clsx } from "clsx";
import { Search, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api";
import { adminApi } from "@/lib/admin";
import { timeAgo } from "@/lib/format";
import type { AdminUserRow, Page, UserRole } from "@/lib/types";

const ROLE_OPTIONS = [
  { value: "buyer", label: "Buyer" },
  { value: "seller", label: "Seller" },
  { value: "admin", label: "Admin" },
];

export function UsersTable() {
  const { user: me } = useAuth();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<UserRole | "">("");
  const [active, setActive] = useState<"" | "true" | "false">("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AdminUserRow> | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ row: AdminUserRow; change: { role?: UserRole; is_active?: boolean }; text: string } | null>(null);

  const load = useCallback(() => {
    adminApi.users({ q: query || undefined, role, active, page })
      .then(setData).catch((err) => toast.error(err instanceof ApiError ? err.message : "Couldn't load users"));
  }, [query, role, active, page]);

  useEffect(() => load(), [load]);

  const apply = async (row: AdminUserRow, change: { role?: UserRole; is_active?: boolean }) => {
    setBusy(row.user.id);
    try {
      const updated = await adminApi.updateUser(row.user.id, change);
      setData((d) => d && { ...d, items: d.items.map((r) => (r.user.id === row.user.id ? updated : r)) });
      toast.success(`${updated.user.full_name} updated`);
      setConfirm(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Filters: one row above the content they scope. */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <form onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); setPage(1); }} role="search" className="relative flex-1">
          <label htmlFor="admin-user-search" className="sr-only">Search by name or email</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input id="admin-user-search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} placeholder="Name or email"
            className="h-12 w-full rounded-xl border border-line bg-elevated/60 pl-9 pr-3 text-sm focus:border-accent focus:outline-none" />
        </form>
        <div className="grid grid-cols-2 gap-3 md:w-80">
          <Select label="Role" hideLabel placeholder="All roles" options={ROLE_OPTIONS} value={role}
            onChange={(e) => { setRole(e.target.value as UserRole | ""); setPage(1); }} />
          <Select label="Status" hideLabel placeholder="Any status" options={[{ value: "true", label: "Active" }, { value: "false", label: "Deactivated" }]}
            value={active} onChange={(e) => { setActive(e.target.value as "" | "true" | "false"); setPage(1); }} />
        </div>
      </div>

      {!data ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : data.items.length === 0 ? (
        <EmptyState icon={Users} title="No users match" />
      ) : (
        <>
          <div className="glass overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Users ({data.total})</caption>
              <thead>
                <tr className="border-b border-line/60 text-left text-xs uppercase tracking-wider text-muted">
                  <th scope="col" className="px-4 py-3 font-semibold">User</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Role</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Listings</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Bids</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Last sign-in</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => {
                  const u = row.user;
                  const self = u.id === me?.id;
                  return (
                    <tr key={u.id} className={clsx("border-b border-line/40 last:border-0", !u.is_active && "opacity-60")}>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{u.full_name}{self && <span className="ml-2 text-xs text-ink">(you)</span>}</p>
                        <p className="text-xs text-muted">{u.email} · joined {timeAgo(u.created_at)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <label className="sr-only" htmlFor={`role-${u.id}`}>Role for {u.full_name}</label>
                        <select id={`role-${u.id}`} value={u.role} disabled={self || busy === u.id}
                          onChange={(e) => {
                            const next = e.target.value as UserRole;
                            setConfirm({ row, change: { role: next }, text: `Change ${u.full_name}'s role from ${u.role} to ${next}?` });
                          }}
                          className="h-9 rounded-lg border border-line bg-elevated/60 px-2 text-sm capitalize focus:border-accent focus:outline-none disabled:opacity-60">
                          {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.listings}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.bids}</td>
                      <td className="px-4 py-3 text-muted">{row.last_login_at ? timeAgo(row.last_login_at) : "Never"}</td>
                      <td className="px-4 py-3">
                        <button type="button" disabled={self || busy === u.id}
                          onClick={() => setConfirm({
                            row, change: { is_active: !u.is_active },
                            text: u.is_active ? `Deactivate ${u.full_name}? They'll be signed out everywhere and can't sign in.` : `Reactivate ${u.full_name}?`,
                          })}
                          className={clsx("rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider disabled:cursor-not-allowed",
                            u.is_active ? "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25" : "bg-accent/15 text-ink hover:bg-accent/25")}
                          aria-label={`${u.is_active ? "Active" : "Deactivated"}. ${u.is_active ? "Deactivate" : "Reactivate"} ${u.full_name}`}>
                          {u.is_active ? "Active" : "Deactivated"}
                        </button>
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

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Confirm change" description={confirm?.text}>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button loading={busy === confirm?.row.user.id} onClick={() => confirm && apply(confirm.row, confirm.change)}>Confirm</Button>
        </div>
      </Modal>
    </div>
  );
}
