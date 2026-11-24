"use client";

import { clsx } from "clsx";
import { ChevronDown, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { formatPrice, formatPriceShort } from "@/lib/format";
import type { PriceInsight } from "@/lib/types";

import { FactorList } from "./FactorList";
import { PriceBadge } from "./PriceBadge";

const CONFIDENCE_LABEL = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" } as const;

/** AI price check on a listing page: estimate, range bar with the asking price, factors. */
export function PriceInsightPanel({ insight, askingPrice, isAuction }: { insight: PriceInsight; askingPrice: number; isAuction?: boolean }) {
  const [open, setOpen] = useState(false);
  // Range bar scale: a little padding around the interval and asking price.
  const lo = Math.min(insight.low, askingPrice) * 0.9;
  const hi = Math.max(insight.high, askingPrice) * 1.1;
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;

  return (
    <section className="glass rounded-2xl p-6" aria-labelledby="ai-price-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="ai-price-heading" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neon">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> AI price check
          </h2>
          <p className="mt-2 font-display text-2xl font-extrabold">{formatPrice(insight.estimated_price)}</p>
          <p className="text-xs text-muted">
            Likely {formatPriceShort(insight.low)} – {formatPriceShort(insight.high)} · {CONFIDENCE_LABEL[insight.confidence]}
          </p>
        </div>
        {insight.rating && <PriceBadge rating={insight.rating} size="md" />}
      </div>

      {!isAuction && (
        <div className="mt-6" aria-hidden>
          <div className="relative h-2 rounded-full bg-elevated">
            <div className="absolute inset-y-0 rounded-full bg-gradient-to-r from-neon to-accent opacity-80"
              style={{ left: pos(insight.low), width: `calc(${pos(insight.high)} - ${pos(insight.low)})` }} />
            <div className="absolute -top-1.5 h-5 w-1 -translate-x-1/2 rounded bg-fg" style={{ left: pos(insight.estimated_price) }} />
            <div className="absolute -top-2 h-6 w-1.5 -translate-x-1/2 rounded bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.8)]"
              style={{ left: pos(askingPrice) }} />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-muted">
            <span>Fair range</span>
            <span className="text-amber-700 dark:text-amber-400">▲ Asking {formatPriceShort(askingPrice)}</span>
          </div>
        </div>
      )}
      {!isAuction && insight.delta_pct !== null && (
        <p className={clsx("mt-3 text-sm font-semibold",
          insight.rating === "great_deal" ? "text-emerald-600 dark:text-emerald-400" : insight.rating === "overpriced" ? "text-amber-700 dark:text-amber-400" : "text-fg/80")}>
          Asking price is {Math.abs(insight.delta_pct).toFixed(0)}% {insight.delta_pct < 0 ? "below" : "above"} our estimate.
        </p>
      )}
      {isAuction && <p className="mt-3 text-sm text-muted">A useful guide for how high to bid.</p>}

      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="mt-4 flex w-full items-center justify-between rounded-xl border border-line px-4 py-2.5 text-sm font-semibold hover:border-accent">
        Why this price?
        <ChevronDown className={clsx("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && <div className="mt-4"><FactorList factors={insight.factors} /></div>}

      <p className="mt-4 text-[11px] text-muted">
        Estimates come from a machine-learning model and aren&apos;t a valuation guarantee.{" "}
        <Link href="/price-check" className="text-ink hover:underline">Value your own car →</Link>
      </p>
    </section>
  );
}
