"use client";

import { clsx } from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { useCountdown } from "@/hooks/useCountdown";

const URGENT_MS = 2 * 60 * 1000; // matches the anti-sniping window

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Glowing digital countdown. Turns red and pulses in the final two minutes. */
export function Countdown({
  targetMs,
  offsetMs = 0,
  size = "md",
  extendedAt,
  label,
}: {
  targetMs: number;
  offsetMs?: number;
  size?: "sm" | "md" | "lg";
  /** Timestamp of the last anti-sniping extension (shows a "+2:00" flash). */
  extendedAt?: number | null;
  label?: string;
}) {
  const t = useCountdown(targetMs, offsetMs);
  const urgent = !t.done && t.totalMs <= URGENT_MS;
  const [showExtended, setShowExtended] = useState(false);
  const lastAnnounced = useRef<number | null>(null);

  useEffect(() => {
    if (!extendedAt || extendedAt === lastAnnounced.current) return;
    lastAnnounced.current = extendedAt;
    setShowExtended(true);
    const id = window.setTimeout(() => setShowExtended(false), 3500);
    return () => window.clearTimeout(id);
  }, [extendedAt]);

  const units = t.days > 0
    ? [[t.days, "d"], [t.hours, "h"], [t.minutes, "m"]]
    : [[t.hours, "h"], [t.minutes, "m"], [t.seconds, "s"]];

  const digit = {
    sm: "text-sm min-w-[2ch]",
    md: "text-2xl min-w-[2ch]",
    lg: "text-4xl sm:text-5xl min-w-[2ch]",
  }[size];

  // Screen readers get a calm, minute-level summary instead of per-second updates.
  const srText = t.done ? "Ended" : `${t.days ? `${t.days} days ` : ""}${t.hours} hours ${t.minutes} minutes remaining`;

  return (
    <div className="relative inline-flex flex-col">
      {label && <span className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">{label}</span>}
      <div
        className={clsx(
          "flex items-baseline gap-1 font-display font-extrabold tabular-nums transition-colors",
          t.done ? "text-muted" : urgent ? "animate-pulse text-red-600 dark:text-red-400"
            : "text-neon",
        )}
        aria-hidden
      >
        {t.done ? (
          <span className={digit}>ENDED</span>
        ) : (
          units.map(([value, unit], i) => (
            <span key={String(unit)} className="flex items-baseline">
              <span className={clsx(digit, "text-center")}>{pad(value as number)}</span>
              <span className={clsx("ml-0.5 font-sans font-semibold opacity-60", size === "lg" ? "text-base" : "text-[10px]")}>{unit}</span>
              {i < units.length - 1 && <span className="mx-1 opacity-30">:</span>}
            </span>
          ))
        )}
      </div>
      <span className="sr-only" role="timer" aria-live="off">{srText}</span>
      <AnimatePresence>
        {showExtended && (
          <motion.span
            initial={{ opacity: 0, y: 8, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute -right-2 -top-3 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase text-on-accent shadow-glow"
            role="status"
          >
            +2:00 extended
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

