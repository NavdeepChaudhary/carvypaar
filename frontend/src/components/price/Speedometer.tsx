"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect, useId, useState } from "react";

import { formatPrice, formatPriceShort } from "@/lib/format";

interface SpeedometerProps {
  value: number;
  low: number;
  high: number;
  /** Optional asking price marker. */
  marker?: number | null;
}

const START = -120; // degrees (0 = straight up)
const END = 120;
const R = 120;
const CX = 160;
const CY = 160;

function polar(angle: number, radius = R) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}

function arc(from: number, to: number, radius = R) {
  const a = polar(from, radius);
  const b = polar(to, radius);
  const large = to - from > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} 1 ${b.x} ${b.y}`;
}

/** A "nice" gauge maximum above the range, e.g. 18.4 L -> 20 L. */
function niceMax(x: number) {
  const mag = 10 ** Math.floor(Math.log10(x));
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  return (steps.find((s) => s * mag >= x) ?? 10) * mag;
}

/**
 * Speedometer gauge: the needle sweeps to the AI estimate, the glowing band is
 * the 80% range, and an optional tick marks the asking price.
 */
export function Speedometer({ value, low, high, marker }: SpeedometerProps) {
  const gradientId = useId();
  const reduce = useReducedMotion();
  const max = niceMax(Math.max(high, marker ?? 0) * 1.25);
  const toAngle = (v: number) => START + (Math.min(Math.max(v, 0), max) / max) * (END - START);

  const progress = useMotionValue(0);
  const needle = useTransform(progress, (p) => START + p * (toAngle(value) - START));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    progress.set(0);
    const controls = animate(progress, 1, {
      duration: reduce ? 0 : 1.6,
      ease: [0.22, 1.2, 0.36, 1], // slight overshoot, like a real needle
      onUpdate: (p) => setDisplay(Math.round((p * value) / 1000) * 1000),
    });
    return () => controls.stop();
  }, [value, progress, reduce]);

  const ticks = Array.from({ length: 11 }, (_, i) => i / 10);

  return (
    <figure className="relative mx-auto w-full max-w-sm" aria-label={`Estimated value ${formatPrice(value)}, likely between ${formatPrice(low)} and ${formatPrice(high)}`}>
      <svg viewBox="0 0 320 230" className="w-full" role="img" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1">
            <stop offset="0%" stopColor="#1d4ed8" />
            <stop offset="100%" stopColor="#ffc107" />
          </linearGradient>
        </defs>
        {/* track */}
        <path d={arc(START, END)} fill="none" stroke="rgb(var(--line))" strokeWidth={18} strokeLinecap="round" />
        {/* 80% range band */}
        <motion.path
          d={arc(toAngle(low), toAngle(high))}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={18}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1 1"
          initial={{ strokeDashoffset: 1, opacity: 0 }}
          animate={{ strokeDashoffset: 0, opacity: 1 }}
          transition={{ duration: reduce ? 0 : 1.1, delay: 0.3 }}
          style={{ filter: "drop-shadow(0 2px 6px rgba(245,180,0,0.45))" }}
        />
        {/* ticks + labels */}
        {ticks.map((t) => {
          const angle = START + t * (END - START);
          const major = Math.round(t * 10) % 5 === 0; // 0%, 50%, 100%
          const a = polar(angle, R - 18);
          const b = polar(angle, major ? R - 32 : R - 26);
          const label = polar(angle, R - 46);
          return (
            <g key={t}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgb(var(--muted))" strokeWidth={major ? 2 : 1} opacity={0.7} />
              {major && (
                <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" className="fill-muted text-[10px] font-semibold">
                  {formatPriceShort(t * max)}
                </text>
              )}
            </g>
          );
        })}
        {/* asking price marker */}
        {marker ? (() => {
          const m1 = polar(toAngle(marker), R + 14);
          const m2 = polar(toAngle(marker), R - 12);
          return <line x1={m1.x} y1={m1.y} x2={m2.x} y2={m2.y} stroke="#f59e0b" strokeWidth={3} strokeLinecap="round" />;
        })() : null}
        {/* needle */}
        <motion.g style={{ rotate: needle, originX: `${CX}px`, originY: `${CY}px` }}>
          <polygon points={`${CX - 5},${CY} ${CX + 5},${CY} ${CX},${CY - R + 22}`} fill="rgb(var(--fg))"
            style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.25))" }} />
        </motion.g>
        <circle cx={CX} cy={CY} r={12} fill="rgb(var(--surface))" stroke="#ffc107" strokeWidth={3} />
      </svg>
      <figcaption className="-mt-10 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted">AI estimate</p>
        <p className="font-display text-4xl font-extrabold tabular-nums text-fg">
          {formatPrice(display)}
        </p>
        <p className="mt-1 text-sm text-muted">
          Likely <span className="font-semibold text-fg">{formatPriceShort(low)}</span> – <span className="font-semibold text-fg">{formatPriceShort(high)}</span>
        </p>
      </figcaption>
    </figure>
  );
}
