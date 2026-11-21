"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

const BG =
  "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=2000&q=70";

/** Centered glass card over a blurred car backdrop, shared by login & register. */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 pb-16 pt-28">
      <div aria-hidden className="absolute inset-0 bg-cover bg-center opacity-30 blur-sm" style={{ backgroundImage: `url(${BG})` }} />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-bg/60 via-bg/80 to-bg" />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="glass relative w-full max-w-md rounded-3xl p-8 shadow-2xl"
      >
        <div className="neon-line absolute inset-x-8 top-0" aria-hidden />
        <h1 className="font-display text-2xl font-black uppercase tracking-wide">{title}</h1>
        <p className="mt-2 text-sm text-muted">{subtitle}</p>
        <div className="mt-8">{children}</div>
      </motion.div>
    </div>
  );
}
