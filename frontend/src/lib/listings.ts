/** Thin, typed wrappers around the listings / offers / messages endpoints. */
import { apiFetch } from "./api";
import type {
  ListingCard,
  ListingDetail,
  ListingImage,
  ListingInput,
  ListingStatus,
  MakeModels,
  Message,
  Offer,
  Page,
} from "./types";

export type ListingQuery = Record<string, string | number | undefined>;

export function toQueryString(params: ListingQuery): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export const listingsApi = {
  search: (params: ListingQuery, signal?: AbortSignal) =>
    apiFetch<Page<ListingCard>>(`/api/listings${toQueryString(params)}`, { signal }),
  makes: () => apiFetch<MakeModels[]>("/api/listings/makes", { auth: false }),
  get: (id: number) => apiFetch<ListingDetail>(`/api/listings/${id}`),
  create: (data: ListingInput) => apiFetch<ListingDetail>("/api/listings", { method: "POST", body: data }),
  update: (id: number, data: Partial<ListingInput> & { status?: Exclude<ListingStatus, "pending" | "rejected"> }) =>
    apiFetch<ListingDetail>(`/api/listings/${id}`, { method: "PATCH", body: data }),
  remove: (id: number) => apiFetch<void>(`/api/listings/${id}`, { method: "DELETE" }),

  uploadImages: (id: number, files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    return apiFetch<ListingImage[]>(`/api/listings/${id}/images`, { method: "POST", body: form });
  },
  reorderImages: (id: number, imageIds: number[]) =>
    apiFetch<ListingImage[]>(`/api/listings/${id}/images/order`, { method: "PUT", body: { image_ids: imageIds } }),
  deleteImage: (id: number, imageId: number) =>
    apiFetch<void>(`/api/listings/${id}/images/${imageId}`, { method: "DELETE" }),

  favorite: (id: number) => apiFetch<void>(`/api/listings/${id}/favorite`, { method: "POST" }),
  unfavorite: (id: number) => apiFetch<void>(`/api/listings/${id}/favorite`, { method: "DELETE" }),
  mine: () => apiFetch<ListingCard[]>("/api/users/me/listings"),
  favorites: () => apiFetch<ListingCard[]>("/api/users/me/favorites"),

  makeOffer: (id: number, amount: number, message?: string) =>
    apiFetch<Offer>(`/api/listings/${id}/offers`, { method: "POST", body: { amount, message } }),
  contactSeller: (id: number, body: string) =>
    apiFetch<Message>(`/api/listings/${id}/messages`, { method: "POST", body: { body } }),
};

export const offersApi = {
  list: (box: "received" | "sent") => apiFetch<Offer[]>(`/api/offers?box=${box}`),
  setStatus: (id: number, status: "accepted" | "rejected" | "withdrawn") =>
    apiFetch<Offer>(`/api/offers/${id}`, { method: "PATCH", body: { status } }),
};

export const messagesApi = {
  list: () => apiFetch<Message[]>("/api/messages"),
  reply: (id: number, body: string) =>
    apiFetch<Message>(`/api/messages/${id}/reply`, { method: "POST", body: { body } }),
  markRead: (id: number) => apiFetch<void>(`/api/messages/${id}/read`, { method: "POST" }),
};
