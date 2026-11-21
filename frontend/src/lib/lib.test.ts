import { describe, expect, it, vi } from "vitest";

import { buildAuction, suggestedIncrement, DEFAULT_AUCTION_SETTINGS } from "@/components/auctions/AuctionSettings";
import { partitionFiles } from "@/components/cars/photos";
import { splitMs } from "@/hooks/useCountdown";
import { mergeBids, newer } from "@/hooks/useLiveAuction";

import { extractMessage } from "./api";
import { parseUtc } from "./auctions";
import { formatKm, formatPrice, formatPriceShort, timeAgo } from "./format";
import { toQueryString } from "./listings";
import { safeNext } from "./navigation";
import type { AuctionState, Bid } from "./types";
import { EMAIL_RE, passwordError, passwordScore, phoneError } from "./validation";

describe("safeNext (open-redirect protection)", () => {
  it("allows same-origin paths", () => {
    expect(safeNext("/cars/12")).toBe("/cars/12");
    expect(safeNext("/auctions?tab=live")).toBe("/auctions?tab=live");
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null, undefined])(
    "rejects %s",
    (value) => expect(safeNext(value as string | null | undefined)).toBe("/profile"),
  );
});

describe("formatting", () => {
  it("formats rupees in Indian notation", () => {
    expect(formatPrice(5800000)).toBe("₹58,00,000");
    expect(formatPriceShort(5800000)).toBe("₹58 L");
    expect(formatPriceShort(19000000)).toBe("₹1.9 Cr");
    expect(formatPriceShort(1250000)).toBe("₹12.5 L");
    expect(formatPriceShort(95000)).toBe("₹95,000");
    expect(formatKm(147282)).toBe("1,47,282 km");
  });
  it("treats offset-less API timestamps as UTC", () => {
    expect(parseUtc("2026-11-21T06:00:00")).toBe(Date.UTC(2026, 10, 21, 6));
    expect(parseUtc("2026-11-21T06:00:00+00:00")).toBe(Date.UTC(2026, 10, 21, 6));
    expect(parseUtc("2026-11-21T11:30:00+05:30")).toBe(Date.UTC(2026, 10, 21, 6));
  });
  it("renders relative times", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 21, 12)));
    expect(timeAgo("2026-11-21T09:00:00")).toBe("3 hours ago");
    expect(timeAgo("2026-11-21T11:59:50+00:00")).toBe("just now");
    expect(timeAgo("2026-11-24T12:00:00Z")).toBe("in 3 days");
    vi.useRealTimers();
  });
});

describe("validation", () => {
  it("mirrors the server password rules", () => {
    expect(passwordError("short1")).toMatch(/8 characters/);
    expect(passwordError("onlyletters")).toMatch(/letter and one number/);
    expect(passwordError("a1".repeat(40))).toMatch(/72 bytes/);
    expect(passwordError("Racing2026")).toBeNull();
    expect(passwordScore("Racing2026!xY")).toBe(4);
  });
  it("validates emails and phones", () => {
    expect(EMAIL_RE.test("a@b.co")).toBe(true);
    expect(EMAIL_RE.test("a@b")).toBe(false);
    expect(phoneError("+91 98765 43210")).toBeNull();
    expect(phoneError("")).toBeNull();
    expect(phoneError("call me")).toMatch(/valid/);
  });
});

describe("api helpers", () => {
  it("turns FastAPI errors into readable messages", () => {
    expect(extractMessage({ detail: "Nope" }, "x")).toBe("Nope");
    expect(extractMessage({ detail: [{ loc: ["body", "year"], msg: "Value error, Year cannot be later than 2027" }] }, "x"))
      .toBe("year: Year cannot be later than 2027");
    expect(extractMessage({ error: "Rate limit exceeded: 10 per 1 minute" }, "x")).toBe("Rate limit exceeded: 10 per 1 minute");
    expect(extractMessage("<html>", "fallback")).toBe("fallback");
  });
  it("builds query strings without empty values", () => {
    expect(toQueryString({ make: "BMW", q: "", page: 2, model: undefined })).toBe("?make=BMW&page=2");
    expect(toQueryString({})).toBe("");
    expect(toQueryString({ q: "a&b=c" })).toBe("?q=a%26b%3Dc");
  });
});

describe("photo pre-checks", () => {
  const file = (name: string, type: string, size: number) => new File([new Uint8Array(size)], name, { type });
  it("rejects wrong types/sizes and respects remaining slots", () => {
    const { ok, errors } = partitionFiles(
      [file("a.jpg", "image/jpeg", 10), file("b.gif", "image/gif", 10), file("c.png", "image/png", 9 * 1024 * 1024),
        file("d.webp", "image/webp", 10), file("e.jpg", "image/jpeg", 10)],
      2,
    );
    expect(ok.map((f) => f.name)).toEqual(["a.jpg", "d.webp"]);
    expect(errors.join(" ")).toMatch(/b\.gif/);
    expect(errors.join(" ")).toMatch(/larger than 8 MB/);
    expect(errors.join(" ")).toMatch(/Only 2 more photos/);
  });
});

describe("auction helpers", () => {
  const state = (over: Partial<AuctionState>): AuctionState => ({
    id: 1, listing_id: 1, status: "live", starting_price: 100, bid_increment: 10, current_price: null, min_next_bid: 100,
    bid_count: 0, start_time: "2026-11-21T00:00:00Z", end_time: "2026-11-21T01:00:00Z",
    original_end_time: "2026-11-21T01:00:00Z", extended: false, has_reserve: false, reserve_met: null,
    leading_bidder_id: null, winner_id: null, final_price: null, server_time: "2026-11-21T00:30:00Z", ...over,
  });

  it("only accepts newer auction state (out-of-order WebSocket events)", () => {
    const cur = state({ bid_count: 3 });
    expect(newer(cur, state({ bid_count: 2 }))).toBe(false); // stale event arriving late
    expect(newer(cur, state({ bid_count: 4 }))).toBe(true);
    expect(newer(cur, state({ bid_count: 3, status: "ended" }))).toBe(true);
    expect(newer(cur, state({ bid_count: 3, end_time: "2026-11-21T01:02:00Z" }))).toBe(true); // extension
    expect(newer(cur, state({ bid_count: 3 }))).toBe(false);
  });

  it("merges bids without duplicates, highest first", () => {
    const bid = (id: number, amount: number): Bid => ({ id, auction_id: 1, amount, created_at: "", bidder: { id: 1, display_name: "A" } });
    expect(mergeBids([bid(1, 100), bid(2, 110)], [bid(2, 110), bid(3, 120)]).map((b) => b.id)).toEqual([3, 2, 1]);
  });

  it("splits countdowns", () => {
    expect(splitMs(90_061_000)).toMatchObject({ days: 1, hours: 1, minutes: 1, seconds: 1, done: false });
    expect(splitMs(-5)).toMatchObject({ totalMs: 0, done: true });
  });

  it("suggests ~1% increments and validates auction settings", () => {
    expect(suggestedIncrement(1_250_000)).toBe(13_000);
    expect(suggestedIncrement(50_000)).toBe(1_000);
    const ok = buildAuction({ ...DEFAULT_AUCTION_SETTINGS, reserve: "1500000" }, 1_000_000);
    expect(ok.payload).toMatchObject({ starting_price: 1_000_000, bid_increment: 10_000, reserve_price: 1_500_000 });
    expect(ok.payload?.start_time).toBeUndefined();
    const end = Date.parse(ok.payload!.end_time);
    expect(Math.abs(end - (Date.now() + 24 * 3600_000))).toBeLessThan(5_000);
    expect(buildAuction({ ...DEFAULT_AUCTION_SETTINGS, reserve: "900000" }, 1_000_000).errors.reserve).toMatch(/at least/);
    expect(buildAuction({ ...DEFAULT_AUCTION_SETTINGS, startMode: "scheduled", startAt: "2000-01-01T10:00" }, 1_000_000)
      .errors.startAt).toMatch(/future/);
  });
});
