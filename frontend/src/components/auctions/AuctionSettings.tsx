"use client";

import { clsx } from "clsx";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { formatPrice } from "@/lib/format";
import type { AuctionCreate } from "@/lib/types";

export interface AuctionSettingsValue {
  reserve: string;
  increment: string;
  startMode: "now" | "scheduled";
  startAt: string; // datetime-local value (browser's local time)
  durationMinutes: string;
}

export const DEFAULT_AUCTION_SETTINGS: AuctionSettingsValue = {
  reserve: "",
  increment: "",
  startMode: "now",
  startAt: "",
  durationMinutes: String(24 * 60),
};

const DURATIONS = [
  { value: "15", label: "15 minutes (quick demo)" },
  { value: "60", label: "1 hour" },
  { value: "360", label: "6 hours" },
  { value: "1440", label: "1 day" },
  { value: "4320", label: "3 days" },
  { value: "10080", label: "7 days" },
];

export type AuctionErrors = Partial<Record<keyof AuctionSettingsValue, string>>;

/** Suggested increment: ~1% of the starting price, rounded to ₹1,000 (min ₹1,000). */
export function suggestedIncrement(startingPrice: number): number {
  return Math.max(1000, Math.round((startingPrice * 0.01) / 1000) * 1000);
}

/** Validate and convert to the API payload. `startingPrice` comes from the listing form. */
export function buildAuction(
  v: AuctionSettingsValue,
  startingPrice: number,
): { payload?: AuctionCreate; errors: AuctionErrors } {
  const errors: AuctionErrors = {};
  const increment = v.increment ? Number(v.increment) : suggestedIncrement(startingPrice);
  if (!(increment > 0)) errors.increment = "Enter a positive amount";
  const reserve = v.reserve ? Number(v.reserve) : undefined;
  if (reserve !== undefined && !(reserve >= startingPrice)) errors.reserve = "Must be at least the starting price";

  const now = Date.now();
  let start = now;
  if (v.startMode === "scheduled") {
    start = v.startAt ? new Date(v.startAt).getTime() : NaN;
    if (!Number.isFinite(start)) errors.startAt = "Choose a start time";
    else if (start < now) errors.startAt = "Start time must be in the future";
  }
  const minutes = Number(v.durationMinutes);
  if (Object.keys(errors).length) return { errors };

  const end = start + minutes * 60_000;
  return {
    errors,
    payload: {
      starting_price: startingPrice,
      bid_increment: Math.round(increment),
      reserve_price: reserve !== undefined ? Math.round(reserve) : undefined,
      start_time: v.startMode === "scheduled" ? new Date(start).toISOString() : undefined,
      end_time: new Date(end).toISOString(),
    },
  };
}

function localNowPlus(minutes: number): string {
  const d = new Date(Date.now() + minutes * 60_000);
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function AuctionSettings({
  value,
  onChange,
  errors,
  startingPrice,
}: {
  value: AuctionSettingsValue;
  onChange: (v: AuctionSettingsValue) => void;
  errors: AuctionErrors;
  startingPrice: number;
}) {
  const set = <K extends keyof AuctionSettingsValue>(k: K, v: AuctionSettingsValue[K]) => onChange({ ...value, [k]: v });
  const suggestion = startingPrice > 0 ? suggestedIncrement(startingPrice) : null;

  return (
    <section className="glass space-y-5 rounded-2xl p-6" aria-labelledby="auction-heading">
      <div>
        <h2 id="auction-heading" className="font-display text-lg font-bold uppercase tracking-wide">Auction settings</h2>
        <p className="mt-1 text-sm text-muted">The asking price above becomes the starting bid.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          label="Bid increment (₹)"
          type="number"
          inputMode="numeric"
          min={1}
          value={value.increment}
          placeholder={suggestion ? String(suggestion) : "5000"}
          error={errors.increment}
          hint={suggestion ? `Default: ${formatPrice(suggestion)} (≈1% of start)` : "Minimum raise per bid"}
          onChange={(e) => set("increment", e.target.value)}
        />
        <Input
          label="Reserve price (₹, optional)"
          type="number"
          inputMode="numeric"
          min={1}
          value={value.reserve}
          placeholder="Hidden minimum you'll accept"
          error={errors.reserve}
          hint="Bidders only see whether it's been met"
          onChange={(e) => set("reserve", e.target.value)}
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Start</legend>
        <div className="grid grid-cols-2 gap-3" role="radiogroup">
          {(["now", "scheduled"] as const).map((mode) => (
            <button key={mode} type="button" role="radio" aria-checked={value.startMode === mode}
              onClick={() => onChange({ ...value, startMode: mode, startAt: value.startAt || localNowPlus(60) })}
              className={clsx("rounded-xl border p-3 text-left text-sm font-semibold transition-all",
                value.startMode === mode ? "border-accent bg-accent/10 text-ink" : "border-line hover:border-accent/50")}>
              {mode === "now" ? "Start immediately" : "Schedule for later"}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        {value.startMode === "scheduled" && (
          <Input label="Start time" type="datetime-local" value={value.startAt} min={localNowPlus(1)}
            error={errors.startAt} onChange={(e) => set("startAt", e.target.value)} />
        )}
        <Select label="Duration" options={DURATIONS} value={value.durationMinutes}
          onChange={(e) => set("durationMinutes", e.target.value)} />
      </div>
    </section>
  );
}
