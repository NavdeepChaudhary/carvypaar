import { apiFetch } from "./api";
import { toQueryString } from "./listings";
import type {
  AdminAuctionRow,
  AdminListingRow,
  AdminSales,
  AdminStats,
  AdminUserRow,
  AuctionState,
  ListingCard,
  Page,
  PublicStats,
  UserRole,
} from "./types";

export type AdminListingStatus = "pending" | "active" | "sold" | "rejected" | "inactive" | "all";
export type AdminAuctionStatus = "all" | "scheduled" | "live" | "ended" | "cancelled";

export const adminApi = {
  stats: () => apiFetch<AdminStats>("/api/admin/stats"),
  listings: (status: AdminListingStatus, q: string, page: number) =>
    apiFetch<Page<AdminListingRow>>(`/api/admin/listings${toQueryString({ status, q: q || undefined, page })}`),
  approve: (id: number) => apiFetch<ListingCard>(`/api/admin/listings/${id}/approve`, { method: "POST" }),
  reject: (id: number, reason: string) =>
    apiFetch<ListingCard>(`/api/admin/listings/${id}/reject`, { method: "POST", body: { reason } }),
  removeListing: (id: number) => apiFetch<void>(`/api/admin/listings/${id}`, { method: "DELETE" }),
  users: (params: { q?: string; role?: UserRole | ""; active?: "true" | "false" | ""; page: number }) =>
    apiFetch<Page<AdminUserRow>>(`/api/admin/users${toQueryString(params)}`),
  updateUser: (id: number, data: { role?: UserRole; is_active?: boolean }) =>
    apiFetch<AdminUserRow>(`/api/admin/users/${id}`, { method: "PATCH", body: data }),
  auctions: (status: AdminAuctionStatus, page: number) =>
    apiFetch<Page<AdminAuctionRow>>(`/api/admin/auctions${toQueryString({ status, page })}`),
  deleteUser: (id: number) => apiFetch<void>(`/api/admin/users/${id}`, { method: "DELETE" }),
  sales: () => apiFetch<AdminSales>("/api/admin/sales"),
  cancelAuction: (id: number) => apiFetch<AuctionState>(`/api/admin/auctions/${id}/cancel`, { method: "POST" }),
};

export const statsApi = {
  public: () => apiFetch<PublicStats>("/api/stats", { auth: false }),
};
