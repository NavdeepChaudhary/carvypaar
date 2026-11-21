import { apiFetch } from "./api";
import type {
  AppNotification,
  AuctionCard,
  AuctionCreate,
  AuctionDetail,
  AuctionState,
  Bid,
  BidResult,
  MyBid,
  Page,
} from "./types";

export type AuctionTab = "live" | "upcoming" | "ended";

export const auctionsApi = {
  list: (tab: AuctionTab, page = 1, pageSize = 12) =>
    apiFetch<Page<AuctionCard>>(`/api/auctions?tab=${tab}&page=${page}&page_size=${pageSize}`),
  get: (id: number) => apiFetch<AuctionDetail>(`/api/auctions/${id}`),
  bids: (id: number, limit = 50) => apiFetch<Bid[]>(`/api/auctions/${id}/bids?limit=${limit}`),
  placeBid: (id: number, amount: number) =>
    apiFetch<BidResult>(`/api/auctions/${id}/bids`, { method: "POST", body: { amount } }),
  create: (listingId: number, data: AuctionCreate) =>
    apiFetch<AuctionDetail>(`/api/listings/${listingId}/auction`, { method: "POST", body: data }),
  cancel: (id: number) => apiFetch<AuctionState>(`/api/auctions/${id}/cancel`, { method: "POST" }),
  mine: () => apiFetch<MyBid[]>("/api/users/me/bids"),
};

export const notificationsApi = {
  list: (limit = 20) => apiFetch<{ items: AppNotification[]; unread_count: number }>(`/api/notifications?limit=${limit}`),
  markRead: (id: number) => apiFetch<void>(`/api/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () => apiFetch<void>("/api/notifications/read-all", { method: "POST" }),
};

/** Parse an ISO timestamp from the API as UTC even if the offset is missing. */
export function parseUtc(iso: string): number {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).getTime();
}
