"use client";

import { motion } from "framer-motion";
import { BadgeCheck, Gauge, Gavel } from "lucide-react";
import type { ReactNode } from "react";

const BG =
  "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1400&q=70";

const PERKS = [
  { icon: Gavel, text: "Bid in live auctions with fair anti-sniping" },
  { icon: Gauge, text: "AI price check on every listing" },
  { icon: BadgeCheck, text: "Every listing reviewed before it goes live" },
];

/** Split card: photo panel with perks on the left, the form on the right. Shared by login & register. */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <div className="container-page flex min-h-[calc(100vh-4rem)] items-center justify-center py-12">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-line bg-surface shadow-lift lg:grid-cols-2"
      >
        <div className="relative hidden min-h-[560px] flex-col justify-end overflow-hidden bg-navy p-10 text-white lg:flex">
          <div aria-hidden className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${BG})` }} />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-navy via-navy/70 to-navy/10" />
          <div className="relative">
            <p className="font-display text-3xl font-bold leading-tight">
              Your next car is <span className="text-accent">one bid away.</span>
            </p>
            <ul className="mt-6 space-y-3">
              {PERKS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-white/85">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-on-accent">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="p-8 sm:p-10">
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          <p className="mt-2 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </motion.div>
    </div>
  );
}
