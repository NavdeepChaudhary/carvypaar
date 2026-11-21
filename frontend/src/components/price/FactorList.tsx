"use client";

import { clsx } from "clsx";
import { motion } from "framer-motion";
import { TrendingDown, TrendingUp } from "lucide-react";

import { formatPriceShort } from "@/lib/format";
import type { PriceFactor } from "@/lib/types";

/** Diverging bars: how much each feature moves this car's value vs a typical car. */
export function FactorList({ factors }: { factors: PriceFactor[] }) {
  if (!factors.length) {
    return <p className="text-sm text-muted">This car is close to a typical car on every feature.</p>;
  }
  const max = Math.max(...factors.map((f) => Math.abs(f.impact)));
  return (
    <ul className="space-y-3" aria-label="What drives this price">
      {factors.map((f, i) => {
        const up = f.direction === "up";
        const width = `${Math.max(6, (Math.abs(f.impact) / max) * 100)}%`;
        return (
          <li key={f.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-semibold">{f.label}</span>
                <span className="ml-2 text-muted">{f.value}</span>
              </span>
              <span className={clsx("flex shrink-0 items-center gap-1 font-display text-sm font-bold tabular-nums",
                up ? "text-emerald-400" : "text-accent")}>
                {up ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden />}
                {up ? "+" : "−"}{formatPriceShort(Math.abs(f.impact))}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-elevated" aria-hidden>
              <motion.div
                className={clsx("h-full rounded-full", up ? "bg-emerald-400" : "bg-accent")}
                initial={{ width: 0 }}
                animate={{ width }}
                transition={{ duration: 0.8, delay: 0.2 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </li>
        );
      })}
      <li className="pt-1 text-[11px] text-muted">Compared with a typical car in our data, all else equal.</li>
    </ul>
  );
}
