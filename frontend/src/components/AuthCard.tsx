"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BadgeCheck, Gauge, Gavel, KeyRound } from "lucide-react";
import type { ReactNode } from "react";

const BG =
  "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1400&q=70";

const PERKS = [
  { icon: Gavel, text: "Bid in live auctions with fair anti-sniping" },
  { icon: Gauge, text: "AI price check on every listing" },
  { icon: BadgeCheck, text: "Every listing reviewed before it goes live" },
];

// ---- Tachometer: revs up when the page opens, then settles at idle. ----
const CX = 110;
const CY = 110;
const R = 88;
const START = -125; // degrees, 0 = straight up
const SWEEP = 250;
const MAX_RPM = 8;

function polar(angle: number, radius: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}
function arc(from: number, to: number, radius = R) {
  const a = polar(from, radius);
  const b = polar(to, radius);
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}
const rpmAngle = (rpm: number) => START + (rpm / MAX_RPM) * SWEEP;

function Tachometer() {
  const reduce = useReducedMotion();
  const idle = rpmAngle(1.2);
  return (
    <svg viewBox="0 0 220 190" className="w-44 drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]" aria-hidden>
      <circle cx={CX} cy={CY} r={R + 14} className="fill-navy/80 stroke-white/10" strokeWidth={2} />
      <path d={arc(START, START + SWEEP)} className="fill-none stroke-white/15" strokeWidth={8} strokeLinecap="round" />
      {/* redline */}
      <path d={arc(rpmAngle(6.5), START + SWEEP)} className="fill-none stroke-red-500" strokeWidth={8} strokeLinecap="round" />
      {Array.from({ length: MAX_RPM + 1 }, (_, i) => {
        const a = polar(rpmAngle(i), R - 12);
        const b = polar(rpmAngle(i), R - 2);
        const t = polar(rpmAngle(i), R - 26);
        return (
          <g key={i}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={i >= 7 ? "stroke-red-400" : "stroke-white/70"} strokeWidth={2} />
            <text x={t.x} y={t.y + 4} textAnchor="middle" className="fill-white/70 font-display text-[11px] font-semibold">
              {i}
            </text>
          </g>
        );
      })}
      <text x={CX} y={CY + 34} textAnchor="middle" className="fill-white/50 text-[8px] font-semibold tracking-[0.25em]">
        RPM ×1000
      </text>
      <motion.g
        style={{ originX: `${CX}px`, originY: `${CY}px` }}
        initial={{ rotate: reduce ? idle : START }}
        animate={{ rotate: reduce ? idle : [START, rpmAngle(7.4), rpmAngle(3), idle] }}
        transition={{ duration: 1.8, times: [0, 0.35, 0.65, 1], ease: "easeInOut", delay: 0.3 }}
      >
        <line x1={CX} y1={CY + 10} x2={CX} y2={CY - R + 16} className="stroke-accent" strokeWidth={3.5} strokeLinecap="round" />
      </motion.g>
      <circle cx={CX} cy={CY} r={8} className="fill-accent" />
      <circle cx={CX} cy={CY} r={3} className="fill-navy" />
    </svg>
  );
}

/** A dashed lane marking that scrolls past, like driving at night. */
function Road({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none overflow-hidden ${className}`}>
      <div
        className="h-1.5 w-[200%] motion-safe:animate-road"
        style={{ backgroundImage: "repeating-linear-gradient(90deg, rgb(255 193 7) 0 48px, transparent 48px 96px)" }}
      />
    </div>
  );
}

/**
 * The sign-in / sign-up page: a car-dashboard panel on the left (photo, a tachometer that
 * revs on load, perks) and the form on the right, over racing stripes. Shared by login & register.
 */
export function AuthCard({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative isolate overflow-hidden">
      {/* Racing stripes and glow behind the card */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="absolute -left-1/4 top-1/3 h-24 w-[150%] -rotate-[8deg] bg-accent/15 dark:bg-accent/10" />
        <div className="absolute -left-1/4 top-[calc(33%+7rem)] h-6 w-[150%] -rotate-[8deg] bg-accent/25 dark:bg-accent/15" />
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-neon/10 blur-3xl" />
      </div>

      <div className="container-page flex min-h-[calc(100vh-4rem)] items-center justify-center py-10 sm:py-14">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-line bg-surface shadow-lift lg:grid-cols-[1.05fr_1fr]"
        >
          {/* Dashboard panel (desktop) */}
          <div className="relative hidden min-h-[600px] flex-col overflow-hidden bg-navy p-10 text-white lg:flex">
            <div aria-hidden className="absolute inset-0 bg-cover bg-center opacity-60" style={{ backgroundImage: `url(${BG})` }} />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-navy via-navy/80 to-navy/30" />
            <div className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent">
              <span className="h-2 w-2 rounded-full bg-accent motion-safe:animate-pulse-glow" /> Engine on
            </div>
            <div className="relative mt-8 flex justify-center">
              <Tachometer />
            </div>
            <div className="relative mt-auto">
              <p className="font-display text-3xl font-bold leading-tight">
                Your next car is <span className="text-accent">one bid away.</span>
              </p>
              <ul className="mt-6 space-y-3">
                {PERKS.map(({ icon: Icon, text }, i) => (
                  <motion.li
                    key={text}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.12 }}
                    className="flex items-center gap-3 text-sm text-white/85"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-on-accent">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    {text}
                  </motion.li>
                ))}
              </ul>
            </div>
            <Road className="absolute inset-x-0 bottom-0" />
          </div>

          {/* Photo strip (phones and tablets) */}
          <div className="relative h-28 overflow-hidden bg-navy lg:hidden">
            <div aria-hidden className="absolute inset-0 bg-cover bg-center opacity-70" style={{ backgroundImage: `url(${BG})` }} />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-navy via-navy/70 to-transparent" />
            <div className="relative flex h-full items-center px-6">
              <p className="max-w-[16rem] font-display text-xl font-bold leading-tight text-white">
                Your next car is <span className="text-accent">one bid away.</span>
              </p>
            </div>
            <Road className="absolute inset-x-0 bottom-0" />
          </div>

          {/* Form */}
          <div className="p-6 sm:p-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-ink">
              <KeyRound className="h-3.5 w-3.5" aria-hidden /> {eyebrow}
            </span>
            <h1 className="mt-4 font-display text-3xl font-extrabold leading-tight">{title}</h1>
            <p className="mt-2 text-sm text-muted">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
