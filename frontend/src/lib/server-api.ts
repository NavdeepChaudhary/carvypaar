/**
 * Server-side reads of public API data, for metadata, the sitemap and structured data.
 * Every call is cached for a while and gives up quickly: if the backend is slow or asleep,
 * pages fall back to the generic site metadata instead of waiting on it.
 */
import { IS_STATIC_EXPORT } from "./site";
import type { AuctionDetail, ListingCard, ListingDetail, Page } from "./types";

const API_BASE = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const TIMEOUT_MS = 3000;

async function getJson<T>(path: string, revalidate: number): Promise<T | null> {
  // Relative URLs can't be fetched on the server, and the static preview has no backend.
  if (IS_STATIC_EXPORT || !/^https?:\/\//.test(API_BASE)) return null;
  try {
    const res = await fetch(`${API_BASE}/api${path}`, {
      next: { revalidate },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export function getListing(id: string): Promise<ListingDetail | null> {
  if (!/^\d+$/.test(id)) return Promise.resolve(null);
  return getJson<ListingDetail>(`/listings/${id}`, 600);
}

export function getAuction(id: string): Promise<AuctionDetail | null> {
  if (!/^\d+$/.test(id)) return Promise.resolve(null);
  return getJson<AuctionDetail>(`/auctions/${id}`, 120);
}

/** Ids of the active listings, for the sitemap (capped so a huge catalogue can't stall the build). */
export async function listActiveListingIds(maxPages = 20): Promise<Pick<ListingCard, "id" | "created_at">[]> {
  const out: Pick<ListingCard, "id" | "created_at">[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await getJson<Page<ListingCard>>(`/listings?page=${page}&page_size=48`, 3600);
    if (!data) break;
    out.push(...data.items.map(({ id, created_at }) => ({ id, created_at })));
    if (page >= data.pages) break;
  }
  return out;
}
